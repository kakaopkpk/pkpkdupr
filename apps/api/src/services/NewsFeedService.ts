import type { EarnedAchievement } from "@pkpkdupr/shared/achievements";
import type {
  NewsFeedItem,
  NewsFeedLine,
  NewsFeedResponse,
  NewsFeedSessionItem,
} from "@pkpkdupr/shared/newsFeed";
import { getPlayerJoinedAt, type Player } from "@pkpkdupr/shared/player";
import {
  WIN_STREAK_DISPLAY_MIN,
  computeCurrentWinStreaks,
} from "@pkpkdupr/shared/streak";
import {
  buildSessionPlayerReports,
  compareSessionsLatestFirst,
  compareText,
  findPlayerEarnedAchievements,
  getActivePlayerIds,
  getSessionEndAt,
  groupMatchesBySession,
  isRankablePlayer,
  pickTopRiser,
  selectAchievementsEarnedByMatches,
  toContextAchievementMatches,
  toRankingPlayer,
  toSessionHistoryItem,
  type RankingContext,
  type RankingMatch,
  type RankingSession,
  type RankingSourcePlayer,
  type EndedSessions,
} from "./RankingService";

/**
 * 홈 소식 피드. 저장 없이 랭킹 원천(세션·완료 경기·평점 로그·회원)으로 요청마다 계산한다.
 * 세션 값(session·mine·topRiser·순위 전후)은 세션 리포트 계산 함수를 그대로 써서 리포트와 같다.
 */

/** 한 페이지 창: 남은 세션 중 가장 최근 세션 date부터 이 기간 전까지(그 시각 포함) */
export const NEWS_FEED_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;

/** 지배자 줄과 겹쳐 소식 줄에서 빼는 업적(세션 지배자 1회) */
const FIRST_DOMINATOR_ACHIEVEMENT_ID = "dominator-1";

/** 복식 순위가 이 안에 든 회원만 랭킹 줄을 만든다 */
const NEWS_FEED_RANK_LIMIT = 3;

/** 가입 시각(getPlayerJoinedAt)을 알 수 있는 회원 */
export type NewsFeedSourcePlayer = RankingSourcePlayer &
  Pick<Player, "createdAt" | "promotedAt">;

// 15자리면 Number.MAX_SAFE_INTEGER(16자리) 안이라 ms 값이 정확히 복원된다
const NEWS_FEED_CURSOR_PATTERN = /^\d{1,15}$/;

/** cursor 쿼리(세션 date ms 정수 문자열). 형식이 틀리면 null */
export const parseNewsFeedCursor = (value: string): number | null =>
  NEWS_FEED_CURSOR_PATTERN.test(value) ? Number(value) : null;

type TimedItem = { atMs: number; item: NewsFeedItem };

/** 시각 내림차순 → 세션 먼저 → 세션은 id 내림차순, 새 회원은 아이디 오름차순 */
const compareTimedItems = (left: TimedItem, right: TimedItem) => {
  if (left.atMs !== right.atMs) return right.atMs - left.atMs;
  const a = left.item;
  const b = right.item;
  if (a.kind !== b.kind) return a.kind === "session" ? -1 : 1;
  if (a.kind === "session" && b.kind === "session") {
    return compareText(b.session.id, a.session.id);
  }
  if (a.kind === "newMember" && b.kind === "newMember") {
    return (
      compareText(a.player.username, b.player.username) ||
      compareText(a.player.id, b.player.id)
    );
  }
  return 0;
};

/** 세션 마지막 완료 경기까지(포함) 완료된 경기로 센 연승(`computeCurrentWinStreaks`와 같은 규칙) */
const computeWinStreaksAt = (matches: RankingMatch[], endAt: Date) =>
  computeCurrentWinStreaks(
    matches.filter(
      (match) => match.completedAt.getTime() <= endAt.getTime(),
    ),
  );

const buildSessionItem = ({
  context,
  session,
  sessionMatches,
  activePlayerIds,
  requesterId,
  earnedByPlayerId,
}: {
  context: RankingContext;
  session: RankingSession;
  sessionMatches: RankingMatch[];
  activePlayerIds: Set<string>;
  requesterId: string;
  earnedByPlayerId: (playerId: string) => EarnedAchievement[];
}): NewsFeedSessionItem | null => {
  const players = buildSessionPlayerReports(context, session, sessionMatches);
  const endAt = getSessionEndAt(sessionMatches);
  if (!players || !endAt) return null;

  // 소식 줄 대상: 세션 참가자 중 지금 활성 정회원(id → 회원)
  const lineMembers = new Map(
    players.flatMap((report) => {
      const player = context.playersById.get(report.player.id);
      return player && isRankablePlayer(player)
        ? [[player.id, player] as const]
        : [];
    }),
  );

  const rankLines: NewsFeedLine[] = players
    .flatMap((report) => {
      const { rankAfter, rankBefore } = report;
      return lineMembers.has(report.player.id) &&
        rankAfter != null &&
        rankAfter <= NEWS_FEED_RANK_LIMIT &&
        (rankBefore == null || rankAfter < rankBefore)
        ? [{ player: report.player, rank: rankAfter, rankBefore }]
        : [];
    })
    .sort((left, right) => left.rank - right.rank)
    .map(({ player, rank, rankBefore }) => ({
      kind: "rank",
      player,
      rank,
      rankChange: rankBefore == null ? null : rankBefore - rank,
    }));

  const ratedPlayerIds = new Set(
    sessionMatches
      .filter((match) => !match.ratingExcluded)
      .flatMap((match) => match.teamPlayerIds.flat()),
  );
  const streaks = computeWinStreaksAt(context.matches, endAt);
  const winStreakLines: NewsFeedLine[] = [...lineMembers.values()]
    .flatMap((player) => {
      const winStreak = streaks.get(player.id) ?? 0;
      return ratedPlayerIds.has(player.id) &&
        winStreak >= WIN_STREAK_DISPLAY_MIN
        ? [{ player, winStreak }]
        : [];
    })
    .sort(
      (left, right) =>
        right.winStreak - left.winStreak ||
        compareText(left.player.username, right.player.username) ||
        compareText(left.player.id, right.player.id),
    )
    .map(({ player, winStreak }) => ({
      kind: "winStreak",
      player: toRankingPlayer(player),
      winStreak,
    }));

  const topRiser = pickTopRiser(players);

  // 세션 리포트 achievements와 같은 집합(참가자 전원으로 고른 뒤 활성 정회원만 남긴다).
  // 지배자가 이 세션으로 받은 첫 '세션 지배자' 업적은 카드의 지배자 줄과 같은 소식이라 뺀다
  const achievementLines: NewsFeedLine[] = selectAchievementsEarnedByMatches(
    players.flatMap((report) => earnedByPlayerId(report.player.id)),
    new Set(sessionMatches.map((match) => match.id)),
  ).flatMap((earned) => {
    if (
      earned.achievementId === FIRST_DOMINATOR_ACHIEVEMENT_ID &&
      earned.playerId === topRiser?.player.id
    ) {
      return [];
    }
    const player = lineMembers.get(earned.playerId);
    return player
      ? [
          {
            kind: "achievement" as const,
            player: toRankingPlayer(player),
            achievementId: earned.achievementId,
            earnedMatchId: earned.earnedMatchId,
            earnedAt: earned.earnedAt,
          },
        ]
      : [];
  });

  return {
    kind: "session",
    session: toSessionHistoryItem(
      session,
      sessionMatches.length,
      activePlayerIds,
    ),
    mine: players.find((report) => report.player.id === requesterId) ?? null,
    topRiser,
    lines: [...rankLines, ...winStreakLines, ...achievementLines],
  };
};

/**
 * 소식 피드 한 페이지.
 * - 세션: 완료 경기가 있는 세션 중 cursor보다 이른 세션에서, 가장 최근 세션 date부터 28일 창에 든 세션 전부
 * - 새 회원: 활성 정회원을 가입 시각이 든 페이지 한 곳에만 끼운다
 */
export const buildNewsFeedPage = ({
  context,
  sessions,
  players,
  endedSessions,
  requesterId,
  cursor,
}: {
  context: RankingContext;
  sessions: RankingSession[];
  /** 새 회원 후보(가입 시각 포함). 활성 정회원만 고른다 */
  players: readonly NewsFeedSourcePlayer[];
  endedSessions: EndedSessions;
  requesterId: string;
  /** 이전 페이지 nextCursor(ms). 첫 페이지는 null */
  cursor: number | null;
}): NewsFeedResponse => {
  const matchesBySession = groupMatchesBySession(context.matches);
  const remaining = sessions
    .filter(
      (session) =>
        matchesBySession.get(session.id)?.length &&
        (cursor == null || session.date.getTime() < cursor),
    )
    .sort(compareSessionsLatestFirst);

  const latestMs = remaining[0]?.date.getTime();
  const page =
    latestMs == null
      ? []
      : remaining.filter(
          (session) => session.date.getTime() >= latestMs - NEWS_FEED_WINDOW_MS,
        );
  const oldestMs = page.at(-1)?.date.getTime();
  const hasMore = remaining.length > page.length;

  // 새 회원 구간: [가장 오래된 세션 date, cursor). 마지막 페이지는 아래 끝이 없고, 첫 페이지는 위 끝이 없다
  const fromMs = hasMore && oldestMs != null ? oldestMs : -Infinity;
  const toMs = cursor ?? Infinity;
  const newMemberItems: TimedItem[] = players
    .filter(isRankablePlayer)
    .flatMap((player) => {
      const joinedAt = getPlayerJoinedAt(player);
      const atMs = joinedAt.getTime();
      return atMs >= fromMs && atMs < toMs
        ? [
            {
              atMs,
              item: {
                kind: "newMember" as const,
                player: toRankingPlayer(player),
                joinedAt,
              },
            },
          ]
        : [];
    });

  // 업적은 요청 하나에 회원별로 한 번만 계산해 세션마다 나눈다
  const achievementMatches = page.length
    ? toContextAchievementMatches(context)
    : [];
  const earnedCache = new Map<string, EarnedAchievement[]>();
  const earnedByPlayerId = (playerId: string) => {
    let earned = earnedCache.get(playerId);
    if (!earned) {
      earned = findPlayerEarnedAchievements(
        achievementMatches,
        endedSessions,
        playerId,
      );
      earnedCache.set(playerId, earned);
    }
    return earned;
  };

  const activePlayerIds = getActivePlayerIds(context);
  const sessionItems: TimedItem[] = page.flatMap((session) => {
    const item = buildSessionItem({
      context,
      session,
      sessionMatches: matchesBySession.get(session.id) ?? [],
      activePlayerIds,
      requesterId,
      earnedByPlayerId,
    });
    return item ? [{ atMs: session.date.getTime(), item }] : [];
  });

  return {
    items: [...sessionItems, ...newMemberItems]
      .sort(compareTimedItems)
      .map(({ item }) => item),
    nextCursor: hasMore && oldestMs != null ? String(oldestMs) : null,
  };
};
