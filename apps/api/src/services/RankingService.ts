import {
  ACHIEVEMENTS,
  computeAchievements,
  toEarnedAchievements,
  type AchievementMatch,
  type EarnedAchievement,
} from "@pkpkdupr/shared/achievements";
import { isEntityId } from "@pkpkdupr/shared/entityId";
import {
  getMatchTopLevelType,
  getWinningTeamIndex,
  type MatchScore,
  type MatchTopLevelType,
  type MatchType,
} from "@pkpkdupr/shared/match";
import {
  DUPR_DEFAULT_RATING,
  roundDuprRating,
  type Player,
  type PlayerRatingChangeLog,
} from "@pkpkdupr/shared/player";
import type {
  MatchSessionHistoryItem,
  MatchSessionReport,
  RankingEntry,
  RankingEntryPlayer,
  RankingPlayer,
  RankingResponse,
  RecordSessionItem,
  SessionPlayerReport,
  UnratedRankingEntry,
} from "@pkpkdupr/shared/ranking";
import {
  getEmptySessionExpiresAt,
  toKstDateKey,
  type MatchSessionKind,
} from "@pkpkdupr/shared/session";

/**
 * 랭킹·세션 리포트 계산. 순위 스냅샷을 저장하지 않고 평점 변경 로그로
 * 조회 시점에 시점 평점·순위를 다시 계산한다. 모든 함수는 DB 없이 동작한다.
 */

export const SESSION_HISTORY_DEFAULT_LIMIT = 20;
export const SESSION_HISTORY_MAX_LIMIT = 100;

/** 완료 경기 요약. 진행 중·취소 경기는 넣지 않는다 */
export interface RankingMatch {
  id: string;
  type: MatchType;
  sessionId: string | null;
  matchStartsAt: Date;
  completedAt: Date;
  teamPlayerIds: [string[], string[]];
  scores: MatchScore[];
}

export interface RankingSession {
  id: string;
  name: string;
  kind: MatchSessionKind;
  date: Date;
  /** 시작 시각("HH:MM", KST). 정기 세션은 18:00, 시각 없는 회원 세션은 null */
  startTime: string | null;
  location: string;
  participantIds: string[];
}

export type RankingSourcePlayer = Pick<
  Player,
  | "id"
  | "username"
  | "avatarUrl"
  | "duprRating"
  | "status"
  | "statusMessage"
  | "statusMessageBackgroundColor"
>;

/** 시점 평점·순위 계산에 쓰는 데이터 묶음 */
export interface RankingContext {
  /** 활성·비활성 모두. 순위 대상은 활성 회원뿐이다 */
  playersById: Map<string, RankingSourcePlayer>;
  /** 선수별 로그(createdAt 오름차순) */
  logsByPlayerId: Map<string, PlayerRatingChangeLog[]>;
  matches: RankingMatch[];
  categoryByMatchId: Map<string, MatchTopLevelType>;
}

interface RatingAtInput {
  logs: PlayerRatingChangeLog[];
  currentRating: number | null;
  category: MatchTopLevelType;
  at: Date;
  /** true면 createdAt <= at 로그까지, false면 createdAt < at 로그까지 반영한다 */
  inclusive?: boolean;
  categoryByMatchId?: Map<string, MatchTopLevelType>;
}

/** `match-completed-<matchId>-<completedAtMs>`에서 경기 id를 꺼낸다 */
const getLogMatchId = (log: PlayerRatingChangeLog) =>
  log.source === "match_completed"
    ? log.sourceLogId.replace(/^match-completed-/, "").replace(/-[^-]+$/, "")
    : null;

/** 이 로그가 해당 분류 평점을 정한 이벤트(그 분류 경기 완료·평점 조정)인지 */
const touchesCategory = (
  log: PlayerRatingChangeLog,
  category: MatchTopLevelType,
  categoryByMatchId?: Map<string, MatchTopLevelType>,
) => {
  const matchId = getLogMatchId(log);
  const matchCategory = matchId ? categoryByMatchId?.get(matchId) : undefined;
  return matchCategory ? matchCategory === category : log.delta[category] !== 0;
};

const byCreatedAtAsc = (
  left: PlayerRatingChangeLog,
  right: PlayerRatingChangeLog,
) => left.createdAt.getTime() - right.createdAt.getTime();

/**
 * 시점 at의 분류 평점.
 * - at 이전 마지막 로그의 next 값, 그런 로그가 없으면 첫 로그의 previous 값, 로그가 없으면 현재 평점
 * - 현재 NR(null)인 분류는 과거 시점도 null이다. 로그에는 NR 분류도 기본값 숫자로 남기 때문이다.
 * - 그 분류의 첫 평점 이벤트가 아직 없고 그 직전 값이 기본 평점이면 그때는 NR이었으므로 null이다.
 */
export const getRatingAt = ({
  logs,
  currentRating,
  category,
  at,
  inclusive = false,
  categoryByMatchId,
}: RatingAtInput): number | null => {
  if (currentRating == null) return null;

  const atMs = at.getTime();
  const isApplied = (log: PlayerRatingChangeLog) =>
    inclusive
      ? log.createdAt.getTime() <= atMs
      : log.createdAt.getTime() < atMs;
  const sorted = [...logs].sort(byCreatedAtAsc);

  const firstTouch = sorted.find((log) =>
    touchesCategory(log, category, categoryByMatchId),
  );
  if (
    firstTouch &&
    !isApplied(firstTouch) &&
    firstTouch.previousRating[category] === DUPR_DEFAULT_RATING
  ) {
    return null;
  }

  const lastApplied = sorted.filter(isApplied).at(-1);
  if (lastApplied) return lastApplied.nextRating[category];
  if (sorted[0]) return sorted[0].previousRating[category];
  return currentRating;
};

/**
 * 세션 리포트용 세션 전 복식 평점. 세션 전에 NR이던 회원(첫 복식 평점 이벤트가 세션 중)은
 * 그 첫 경기 완료 로그의 시작값(기본 3.0)을 세션 전 평점으로 본다.
 * 세션 후에도 NR(첫 복식 이벤트가 세션 이후)이거나 첫 복식 이벤트가 경기 완료가 아니면 null이다.
 */
const getSessionRatingBefore = (
  context: RankingContext,
  playerId: string,
  before: RankingPoint,
  ratingAfter: number | null,
): number | null => {
  const ratingBefore = getPlayerRatingAt(context, playerId, "doubles", before);
  if (ratingBefore != null || ratingAfter == null) return ratingBefore;

  const firstDoublesLog = (context.logsByPlayerId.get(playerId) ?? []).find(
    (log) => touchesCategory(log, "doubles", context.categoryByMatchId),
  );
  return firstDoublesLog?.source === "match_completed"
    ? firstDoublesLog.previousRating.doubles
    : null;
};

export const createRankingContext = (
  players: RankingSourcePlayer[],
  logs: PlayerRatingChangeLog[],
  matches: RankingMatch[],
): RankingContext => {
  const logsByPlayerId = new Map<string, PlayerRatingChangeLog[]>();
  for (const log of logs) {
    const playerLogs = logsByPlayerId.get(log.playerId) ?? [];
    playerLogs.push(log);
    logsByPlayerId.set(log.playerId, playerLogs);
  }
  for (const playerLogs of logsByPlayerId.values()) {
    playerLogs.sort(byCreatedAtAsc);
  }

  return {
    playersById: new Map(players.map((player) => [player.id, player])),
    logsByPlayerId,
    matches,
    categoryByMatchId: new Map(
      matches.map((match) => [match.id, getMatchTopLevelType(match.type)]),
    ),
  };
};

/** 시점. null이면 현재 */
export interface RankingPoint {
  at: Date;
  inclusive: boolean;
}

const isMatchApplied = (match: RankingMatch, point: RankingPoint | null) => {
  if (!point) return true;
  const completedAtMs = match.completedAt.getTime();
  const atMs = point.at.getTime();
  return point.inclusive ? completedAtMs <= atMs : completedAtMs < atMs;
};

const countCategoryMatches = (
  context: RankingContext,
  category: MatchTopLevelType,
  point: RankingPoint | null,
) => {
  const counts = new Map<string, number>();
  for (const match of context.matches) {
    if (context.categoryByMatchId.get(match.id) !== category) continue;
    if (!isMatchApplied(match, point)) continue;
    for (const playerId of new Set(match.teamPlayerIds.flat())) {
      counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
    }
  }
  return counts;
};

export const getPlayerRatingAt = (
  context: RankingContext,
  playerId: string,
  category: MatchTopLevelType,
  point: RankingPoint | null,
): number | null => {
  const currentRating =
    context.playersById.get(playerId)?.duprRating?.[category] ?? null;
  if (!point) return currentRating;
  return getRatingAt({
    logs: context.logsByPlayerId.get(playerId) ?? [],
    currentRating,
    category,
    at: point.at,
    inclusive: point.inclusive,
    categoryByMatchId: context.categoryByMatchId,
  });
};

export interface RankedPlayer {
  rank: number;
  player: RankingSourcePlayer;
  rating: number;
  matchCount: number;
}

/** 이름 비교는 런타임 로케일에 따라 달라지지 않도록 코드 포인트 순으로 한다 */
const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * 시점의 순위. 활성 회원 중 평점이 있는 사람을 평점 내림차순 → 분류 완료 경기 수
 * 내림차순 → 아이디(username) 오름차순으로 세우고 1부터 연속 번호를 붙인다.
 */
export const rankPlayersAt = (
  context: RankingContext,
  category: MatchTopLevelType,
  point: RankingPoint | null,
): RankedPlayer[] => {
  const matchCounts = countCategoryMatches(context, category, point);
  return [...context.playersById.values()]
    .filter((player) => player.status === "active")
    .flatMap((player) => {
      const rating = getPlayerRatingAt(context, player.id, category, point);
      return rating == null
        ? []
        : [{ player, rating, matchCount: matchCounts.get(player.id) ?? 0 }];
    })
    .sort(
      (left, right) =>
        right.rating - left.rating ||
        right.matchCount - left.matchCount ||
        compareText(left.player.username, right.player.username) ||
        compareText(left.player.id, right.player.id),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
};

const toRankMap = (ranked: RankedPlayer[]) =>
  new Map(ranked.map((entry) => [entry.player.id, entry.rank]));

const toRankingPlayer = (player: RankingSourcePlayer): RankingPlayer => ({
  id: player.id,
  username: player.username,
  avatarUrl: player.avatarUrl,
});

/** 상태메시지 필드는 값이 있을 때만 넣는다(Player와 같은 규칙) */
const toRankingEntryPlayer = (
  player: RankingSourcePlayer,
): RankingEntryPlayer => ({
  ...toRankingPlayer(player),
  ...(player.statusMessage ? { statusMessage: player.statusMessage } : {}),
  ...(player.statusMessageBackgroundColor
    ? { statusMessageBackgroundColor: player.statusMessageBackgroundColor }
    : {}),
});

const groupMatchesBySession = (matches: RankingMatch[]) => {
  const bySession = new Map<string, RankingMatch[]>();
  for (const match of matches) {
    if (!match.sessionId) continue;
    const sessionMatches = bySession.get(match.sessionId) ?? [];
    sessionMatches.push(match);
    bySession.set(match.sessionId, sessionMatches);
  }
  return bySession;
};

/** 세션 시작 직전 시점 = min(세션 date, 세션 완료 경기 completedAt 최솟값) */
export const getSessionStartAt = (
  session: Pick<RankingSession, "date">,
  sessionMatches: RankingMatch[],
): Date =>
  new Date(
    Math.min(
      session.date.getTime(),
      ...sessionMatches.map((match) => match.completedAt.getTime()),
    ),
  );

/** 세션 마지막 완료 경기 시각. 완료 경기가 없으면 null */
const getSessionEndAt = (sessionMatches: RankingMatch[]): Date | null =>
  sessionMatches.length
    ? new Date(
        Math.max(...sessionMatches.map((match) => match.completedAt.getTime())),
      )
    : null;

/**
 * 순위 변동 기준 세션. 완료 경기가 있는 세션 중 시작 직전 시점이 now 이하이면서 가장
 * 늦은 세션이다. 진행 중인 오늘 세션도 완료 경기가 있으면 대상이다.
 */
export const selectBaselineSession = (
  sessions: RankingSession[],
  matches: RankingMatch[],
  now: Date,
): { session: RankingSession; startAt: Date } | null => {
  const matchesBySession = groupMatchesBySession(matches);
  let baseline: { session: RankingSession; startAt: Date } | null = null;
  for (const session of sessions) {
    const sessionMatches = matchesBySession.get(session.id);
    if (!sessionMatches?.length) continue;
    const startAt = getSessionStartAt(session, sessionMatches);
    if (startAt.getTime() > now.getTime()) continue;
    if (
      !baseline ||
      startAt.getTime() > baseline.startAt.getTime() ||
      (startAt.getTime() === baseline.startAt.getTime() &&
        compareText(session.id, baseline.session.id) > 0)
    ) {
      baseline = { session, startAt };
    }
  }
  return baseline;
};

export const buildRankingResponse = ({
  context,
  category,
  sessions,
  now,
}: {
  context: RankingContext;
  category: MatchTopLevelType;
  sessions: RankingSession[];
  now: Date;
}): RankingResponse => {
  const current = rankPlayersAt(context, category, null);
  const baseline = selectBaselineSession(sessions, context.matches, now);
  const baselineRanks = baseline
    ? toRankMap(
        rankPlayersAt(context, category, {
          at: baseline.startAt,
          inclusive: false,
        }),
      )
    : null;

  const entries: RankingEntry[] = current.map((entry) => {
    const baselineRank = baselineRanks?.get(entry.player.id);
    return {
      rank: entry.rank,
      player: toRankingEntryPlayer(entry.player),
      rating: entry.rating,
      matchCount: entry.matchCount,
      rankChange: baselineRank == null ? null : baselineRank - entry.rank,
    };
  });

  const matchCounts = countCategoryMatches(context, category, null);
  const unrated: UnratedRankingEntry[] = [...context.playersById.values()]
    .filter(
      (player) =>
        player.status === "active" && player.duprRating?.[category] == null,
    )
    .map((player) => ({
      player: toRankingEntryPlayer(player),
      matchCount: matchCounts.get(player.id) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.matchCount - left.matchCount ||
        compareText(left.player.username, right.player.username) ||
        compareText(left.player.id, right.player.id),
    );

  return {
    category,
    baselineSessionId: baseline?.session.id ?? null,
    entries,
    unrated,
  };
};

const toSessionHistoryItem = (
  session: RankingSession,
  completedMatchCount: number,
  activePlayerIds: Set<string>,
): MatchSessionHistoryItem => ({
  id: session.id,
  name: session.name,
  kind: session.kind,
  date: session.date,
  dateKey: toKstDateKey(session.date),
  startTime: session.startTime,
  location: session.location,
  participantCount: new Set(
    session.participantIds.filter((playerId) => activePlayerIds.has(playerId)),
  ).size,
  matchCount: completedMatchCount,
});

const getActivePlayerIds = (context: RankingContext) =>
  new Set(
    [...context.playersById.values()]
      .filter((player) => player.status === "active")
      .map((player) => player.id),
  );

/** 완료 경기가 있는 세션 목록(세션 date 내림차순). playerId를 주면 그 선수가 완료 경기를 뛴 세션만 */
export const buildSessionHistory = ({
  context,
  sessions,
  limit = SESSION_HISTORY_DEFAULT_LIMIT,
  playerId,
}: {
  context: RankingContext;
  sessions: RankingSession[];
  limit?: number;
  playerId?: string;
}): MatchSessionHistoryItem[] => {
  const matchesBySession = groupMatchesBySession(context.matches);
  const activePlayerIds = getActivePlayerIds(context);
  return sessions
    .filter((session) => {
      const sessionMatches = matchesBySession.get(session.id);
      if (!sessionMatches?.length) return false;
      return (
        !playerId ||
        sessionMatches.some((match) =>
          match.teamPlayerIds.some((team) => team.includes(playerId)),
        )
      );
    })
    .sort(
      (left, right) =>
        right.date.getTime() - left.date.getTime() ||
        compareText(right.id, left.id),
    )
    .slice(0, limit)
    .map((session) =>
      toSessionHistoryItem(
        session,
        matchesBySession.get(session.id)?.length ?? 0,
        activePlayerIds,
      ),
    );
};

/** 순위를 뺀 세션 참가자 보고 */
type SessionPlayerStats = Omit<SessionPlayerReport, "rankBefore" | "rankAfter">;

/** ratingDelta 내림차순 → 경기 수 내림차순 → 아이디(username) 오름차순 */
const compareSessionPlayerReports = (
  left: SessionPlayerStats,
  right: SessionPlayerStats,
) =>
  right.ratingDelta - left.ratingDelta ||
  right.matchCount - left.matchCount ||
  compareText(left.player.username, right.player.username) ||
  compareText(left.player.id, right.player.id);

/**
 * 세션 참가자별 경기·승패와 복식 평점 전후(순위 제외). ratingDelta 내림차순(topRiser와 같은 기준)이다.
 * 평점은 복식 기준, 경기 수·승패는 세션의 완료 경기 전체 기준이다. 완료 경기가 없으면 null.
 */
const buildSessionPlayerStats = (
  context: RankingContext,
  session: RankingSession,
  sessionMatches: RankingMatch[],
): {
  before: RankingPoint;
  after: RankingPoint;
  players: SessionPlayerStats[];
} | null => {
  const endAt = getSessionEndAt(sessionMatches);
  if (!endAt) return null;

  const before: RankingPoint = {
    at: getSessionStartAt(session, sessionMatches),
    inclusive: false,
  };
  const after: RankingPoint = { at: endAt, inclusive: true };

  const statsByPlayerId = new Map<
    string,
    { matchCount: number; wins: number; losses: number }
  >();
  for (const match of sessionMatches) {
    const winner = getWinningTeamIndex(match);
    match.teamPlayerIds.forEach((team, teamIndex) => {
      for (const playerId of new Set(team)) {
        const stats = statsByPlayerId.get(playerId) ?? {
          matchCount: 0,
          wins: 0,
          losses: 0,
        };
        stats.matchCount += 1;
        if (winner === teamIndex) stats.wins += 1;
        else if (winner !== null) stats.losses += 1;
        statsByPlayerId.set(playerId, stats);
      }
    });
  }

  const players = [...statsByPlayerId.entries()]
    .flatMap(([playerId, stats]): SessionPlayerStats[] => {
      const player = context.playersById.get(playerId);
      if (!player) return [];
      const ratingAfter = getPlayerRatingAt(
        context,
        playerId,
        "doubles",
        after,
      );
      const ratingBefore = getSessionRatingBefore(
        context,
        playerId,
        before,
        ratingAfter,
      );
      return [
        {
          player: toRankingPlayer(player),
          ...stats,
          ratingBefore,
          ratingAfter,
          ratingDelta:
            ratingBefore == null || ratingAfter == null
              ? 0
              : roundDuprRating(ratingAfter - ratingBefore),
        },
      ];
    })
    .sort(compareSessionPlayerReports);

  return { before, after, players };
};

/** 세션 참가자 보고(복식 순위 전후 포함, ratingDelta 내림차순). 완료 경기가 없으면 null */
const buildSessionPlayerReports = (
  context: RankingContext,
  session: RankingSession,
  sessionMatches: RankingMatch[],
): SessionPlayerReport[] | null => {
  const stats = buildSessionPlayerStats(context, session, sessionMatches);
  if (!stats) return null;

  const ranksBefore = toRankMap(
    rankPlayersAt(context, "doubles", stats.before),
  );
  const ranksAfter = toRankMap(rankPlayersAt(context, "doubles", stats.after));
  return stats.players.map((report) => ({
    ...report,
    rankBefore: ranksBefore.get(report.player.id) ?? null,
    rankAfter: ranksAfter.get(report.player.id) ?? null,
  }));
};

/** 세션 지배자: 복식 평점이 가장 많이 오른 참가자. 오른 사람이 없으면 null */
const pickTopRiser = <T extends SessionPlayerStats>(players: T[]): T | null =>
  players[0] && players[0].ratingDelta > 0 ? players[0] : null;

/** 회원 id → 세션 지배자로 확정된 세션 id(`findSessionDominations`) */
export type SessionDominations = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * 끝난 세션(만료 시각 `getEmptySessionExpiresAt` ≤ now)의 지배자를 모은다.
 * 진행 중이거나 오늘 아직 끝나지 않은 세션은 지배자가 바뀔 수 있어 넣지 않는다.
 * 다른 업적처럼 조회 때마다 계산하므로, 끝난 뒤 경기를 수정·삭제하면 지배자도 다시 정해진다.
 */
export const findSessionDominations = (
  context: RankingContext,
  sessions: RankingSession[],
  now: Date,
): SessionDominations => {
  const matchesBySession = groupMatchesBySession(context.matches);
  const dominations = new Map<string, Set<string>>();
  for (const session of sessions) {
    if (getEmptySessionExpiresAt(session.kind, session.date) > now) continue;
    const sessionMatches = matchesBySession.get(session.id);
    if (!sessionMatches) continue;
    const stats = buildSessionPlayerStats(context, session, sessionMatches);
    const topRiser = stats && pickTopRiser(stats.players);
    if (!topRiser) continue;
    const sessionIds = dominations.get(topRiser.player.id) ?? new Set();
    sessionIds.add(session.id);
    dominations.set(topRiser.player.id, sessionIds);
  }
  return dominations;
};

/**
 * 세션 리포트. 완료 경기가 없으면 null.
 * 평점·순위는 복식 기준, 경기 수·승패는 세션의 완료 경기 전체 기준이다.
 * players는 ratingDelta 내림차순(topRiser와 같은 기준)이다.
 */
export const buildSessionReport = ({
  context,
  session,
  dominations,
}: {
  context: RankingContext;
  session: RankingSession;
  dominations: SessionDominations;
}): MatchSessionReport | null => {
  const sessionMatches = context.matches.filter(
    (match) => match.sessionId === session.id,
  );
  const players = buildSessionPlayerReports(context, session, sessionMatches);
  if (!players) return null;

  return {
    session: toSessionHistoryItem(
      session,
      sessionMatches.length,
      getActivePlayerIds(context),
    ),
    players,
    topRiser: pickTopRiser(players),
    achievements: buildSessionAchievements(
      context,
      sessionMatches,
      players.map((report) => report.player.id),
      dominations,
    ),
  };
};

/** 완료 경기 요약을 업적 계산 입력으로 바꾼다 */
export const toAchievementMatch = (match: RankingMatch): AchievementMatch => ({
  id: match.id,
  type: match.type,
  status: "completed",
  completedAt: match.completedAt,
  teams: [
    { players: match.teamPlayerIds[0].map((id) => ({ id })) },
    { players: match.teamPlayerIds[1].map((id) => ({ id })) },
  ],
  scores: match.scores,
  session: match.sessionId ? { id: match.sessionId } : null,
});

const ACHIEVEMENT_ORDER = new Map(
  ACHIEVEMENTS.map((definition, index) => [definition.id, index]),
);

/**
 * 세션 경기로 받은 업적. 각 참가자의 전체 완료 경기로 계산해, 받게 된 경기가
 * 이 세션 경기인 업적만 고른다. 받은 시각 → 업적 정의 순서 → 회원 id 순이다.
 */
const buildSessionAchievements = (
  context: RankingContext,
  sessionMatches: RankingMatch[],
  playerIds: string[],
  dominations: SessionDominations,
): EarnedAchievement[] => {
  const sessionMatchIds = new Set(sessionMatches.map((match) => match.id));
  const matches = context.matches.map(toAchievementMatch);
  return playerIds
    .flatMap((playerId) =>
      toEarnedAchievements(
        playerId,
        computeAchievements(playerId, matches, dominations.get(playerId)),
      ),
    )
    .filter((item) => sessionMatchIds.has(item.earnedMatchId))
    .sort(
      (left, right) =>
        left.earnedAt.getTime() - right.earnedAt.getTime() ||
        (ACHIEVEMENT_ORDER.get(left.achievementId) ?? 0) -
          (ACHIEVEMENT_ORDER.get(right.achievementId) ?? 0) ||
        compareText(left.playerId, right.playerId),
    );
};

/** 업적 id별 받은 활성 회원 수. 아무도 받지 않은 업적도 0으로 넣는다 */
export const countAchievementHolders = (
  context: RankingContext,
  dominations: SessionDominations,
): Record<string, number> => {
  const counts: Record<string, number> = Object.fromEntries(
    ACHIEVEMENTS.map((definition) => [definition.id, 0]),
  );
  const matches = context.matches.map(toAchievementMatch);
  for (const playerId of getActivePlayerIds(context)) {
    for (const item of computeAchievements(
      playerId,
      matches,
      dominations.get(playerId),
    )) {
      if (item.earned) counts[item.id] += 1;
    }
  }
  return counts;
};

/** 기록 탭 줄의 정렬 키. 세션은 date, 경기는 matchStartsAt */
export interface RecordsCursor {
  atMs: number;
  id: string;
}

/** `<정렬 시각 ms>_<세션·경기 id>` */
export const formatRecordsCursor = ({ atMs, id }: RecordsCursor) =>
  `${atMs}_${id}`;

/** 형식이 틀리면 null */
export const parseRecordsCursor = (value: string): RecordsCursor | null => {
  const matched = /^(\d{1,15})_([A-Za-z0-9]+)$/.exec(value);
  if (!matched) return null;
  const id = matched[2];
  if (!isEntityId(id, "session") && !isEntityId(id, "match")) return null;
  return { atMs: Number(matched[1]), id };
};

/** 기록 탭 페이지 줄. 경기는 공개 Match hydrate 전이라 id만 담는다 */
export type RecordsPageEntry =
  | RecordSessionItem
  | { kind: "match"; matchId: string };

/**
 * 기록 탭 목록 한 페이지. 완료 경기가 있는 세션과 세션 없는 완료 경기를
 * 정렬 시각(세션 date·경기 matchStartsAt) 내림차순 → id 내림차순으로 섞고 cursor 뒤에서 limit개를 자른다.
 * playerId를 주면 그 회원이 완료 경기를 뛴 세션·경기만 남긴다.
 * 세션 줄의 mine은 세션 리포트 players의 requesterId 줄이다(업적·지배자 계산은 하지 않는다).
 */
export const buildRecordsPage = ({
  context,
  sessions,
  limit = SESSION_HISTORY_DEFAULT_LIMIT,
  cursor,
  playerId,
  requesterId,
}: {
  context: RankingContext;
  sessions: RankingSession[];
  limit?: number;
  cursor?: RecordsCursor | null;
  playerId?: string;
  requesterId: string;
}): { entries: RecordsPageEntry[]; nextCursor: string | null } => {
  const hasPlayer = (match: RankingMatch) =>
    !playerId || match.teamPlayerIds.some((team) => team.includes(playerId));
  const matchesBySession = groupMatchesBySession(context.matches);

  type Row = RecordsCursor &
    (
      | { kind: "session"; session: RankingSession; matches: RankingMatch[] }
      | { kind: "match"; match: RankingMatch }
    );
  const rows: Row[] = [];
  for (const session of sessions) {
    const sessionMatches = matchesBySession.get(session.id);
    if (!sessionMatches?.length || !sessionMatches.some(hasPlayer)) continue;
    rows.push({
      kind: "session",
      atMs: session.date.getTime(),
      id: session.id,
      session,
      matches: sessionMatches,
    });
  }
  for (const match of context.matches) {
    if (match.sessionId || !hasPlayer(match)) continue;
    rows.push({
      kind: "match",
      atMs: match.matchStartsAt.getTime(),
      id: match.id,
      match,
    });
  }

  const compareRows = (left: RecordsCursor, right: RecordsCursor) =>
    right.atMs - left.atMs || compareText(right.id, left.id);
  const remaining = rows
    .filter((row) => !cursor || compareRows(row, cursor) > 0)
    .sort(compareRows);
  const page = remaining.slice(0, limit);
  const last = page.at(-1);

  const activePlayerIds = getActivePlayerIds(context);
  const entries = page.map((row): RecordsPageEntry => {
    if (row.kind === "match") return { kind: "match", matchId: row.id };
    const players = buildSessionPlayerReports(
      context,
      row.session,
      row.matches,
    );
    return {
      kind: "session",
      session: toSessionHistoryItem(
        row.session,
        row.matches.length,
        activePlayerIds,
      ),
      mine:
        players?.find((report) => report.player.id === requesterId) ?? null,
    };
  });

  return {
    entries,
    nextCursor:
      remaining.length > limit && last ? formatRecordsCursor(last) : null,
  };
};
