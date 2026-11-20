import {
  computeAchievements,
  type AchievementMatch,
  type AchievementProgress,
  type EndedSessions,
} from "@pkpkdupr/shared/achievements";
import {
  getMatchRecordedAt,
  getMatchTopLevelType,
  getWinningTeamIndex,
  type Match,
  type MatchTopLevelType,
} from "@pkpkdupr/shared/match";
import type {
  Player,
  PlayerRatingChangeLog,
  PlayerRatingHistory,
} from "@pkpkdupr/shared/player";
import {
  PARTNER_STAT_MIN_MATCHES,
  RIVAL_MIN_MATCHES,
  type HeadToHeadStat,
  type OpponentStat,
  type PartnerStat,
  type StatPlayer,
} from "@pkpkdupr/shared/profileStats";
import { computeCurrentWinStreak } from "@pkpkdupr/shared/streak";
import { buildDoublesRatingAfterByMatchId } from "./RankingService";

export type PlayerProfileMatchStats = Record<
  MatchTopLevelType,
  {
    matchWins: number;
    matchLosses: number;
    setWins: number;
    setLosses: number;
  }
>;

export type PlayerProfileRatingDelta = Record<
  MatchTopLevelType,
  {
    last7Days: number;
    last30Days: number;
    last90Days: number;
    last7DaysMatchCount: number;
  }
>;

export type MatchWithRatingChanges = Match & {
  ratingChanges?: PlayerRatingChangeLog[];
};

export interface PlayerProfileSummary {
  matchStats: PlayerProfileMatchStats;
  ratingDelta: PlayerProfileRatingDelta;
  ratingHistory: PlayerRatingHistory;
  recentMatches: MatchWithRatingChanges[];
  partners: PartnerStat[];
  /** 자주 진 상대(천적). 조건에 맞는 상대 전부 */
  rivals: OpponentStat[];
  /** 요청자 기준 분류별 맞대결. 본인 프로필이면 null */
  headToHead: Record<MatchTopLevelType, HeadToHeadStat> | null;
  /** 업적 전부의 진행 상태(정의 순서) */
  achievements: AchievementProgress[];
  /** 지금 이어지는 연승 수(단식·복식 합, `computeCurrentWinStreak`) */
  winStreak: number;
}

const createEmptyMatchStats = (): PlayerProfileMatchStats => ({
  singles: { matchWins: 0, matchLosses: 0, setWins: 0, setLosses: 0 },
  doubles: { matchWins: 0, matchLosses: 0, setWins: 0, setLosses: 0 },
});

const createEmptyRatingDelta = (): PlayerProfileRatingDelta => ({
  singles: {
    last7Days: 0,
    last30Days: 0,
    last90Days: 0,
    last7DaysMatchCount: 0,
  },
  doubles: {
    last7Days: 0,
    last30Days: 0,
    last90Days: 0,
    last7DaysMatchCount: 0,
  },
});

const getPlayerTeamIndex = (match: Match, playerId: string): 0 | 1 | null => {
  const index = match.teams.findIndex((team) =>
    team.players.some((player) => player.id === playerId),
  );
  return index === 0 || index === 1 ? index : null;
};

/** 잘못된 날짜는 가장 오래된 시각으로 취급한다. */
const toTimeMs = (date: Date) => {
  const value = date.getTime();
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
};

const toStatPlayer = (player: Player): StatPlayer => ({
  id: player.id,
  username: player.username,
  avatarUrl: player.avatarUrl,
});

/** 경기 기록 시각(ms). 완료 시각이 없으면 시작 시각으로 본다 */
const getMatchEndedAtMs = (match: Match) => toTimeMs(getMatchRecordedAt(match));

/** 승률 내림차순 → 경기 수 내림차순 → 아이디(username) 오름차순 */
const sortPartnerStats = (left: PartnerStat, right: PartnerStat) => {
  const winRateDiff =
    right.wins / right.matchCount - left.wins / left.matchCount;
  if (winRateDiff !== 0) return winRateDiff;
  if (right.matchCount !== left.matchCount) {
    return right.matchCount - left.matchCount;
  }
  return left.partner.username.localeCompare(right.partner.username);
};

/** 진 비율 내림차순 → 경기 수 내림차순 → 아이디(username) 오름차순 */
const sortRivalStats = (left: OpponentStat, right: OpponentStat) => {
  const lossRateDiff =
    right.losses / right.matchCount - left.losses / left.matchCount;
  if (lossRateDiff !== 0) return lossRateDiff;
  if (right.matchCount !== left.matchCount) {
    return right.matchCount - left.matchCount;
  }
  return left.opponent.username.localeCompare(right.opponent.username);
};

export const buildPlayerProfileSummary = (
  matches: MatchWithRatingChanges[],
  playerId: string,
  ratingHistory: PlayerRatingHistory,
  viewerPlayerId: string,
  now: Date = new Date(),
  /** 만료 세션과 그 지배자(무패 세션·세션 지배자 업적용). 없으면 두 업적은 받지 않은 상태다 */
  endedSessions?: EndedSessions,
  /** 요청자 평점 변경 로그(경기 id별). 상대 전적의 요청자 평점 변화 합에 쓴다 */
  viewerRatingChangesByMatchId?: ReadonlyMap<string, PlayerRatingChangeLog[]>,
  /**
   * 업적 계산 입력(동호회 전체 완료 경기). 연승 저지·환영 인사·개근상은 다른 회원 기록이 필요하다.
   * 없으면 이 회원의 경기로만 계산하고, 그 업적들은 잘못 받은 것으로 보이지 않게 받지 않은 상태로 둔다
   */
  achievementMatches?: readonly AchievementMatch[],
): PlayerProfileSummary => {
  const matchStats = createEmptyMatchStats();
  const ratingDelta = createEmptyRatingDelta();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const partnerStatsById = new Map<string, PartnerStat>();
  const opponentStatsById = new Map<string, OpponentStat>();
  const createEmptyHeadToHead = (): HeadToHeadStat => ({
    matchCount: 0,
    wins: 0,
    losses: 0,
    ratingDelta: 0,
  });
  const headToHead: Record<MatchTopLevelType, HeadToHeadStat> | null =
    viewerPlayerId === playerId
      ? null
      : { singles: createEmptyHeadToHead(), doubles: createEmptyHeadToHead() };

  for (const match of matches) {
    // 게스트가 낀 경기는 승패·파트너 궁합·상대 전적·최근 경기 수에 세지 않는다(최근 경기 목록에는 나온다).
    if (match.status !== "completed" || match.ratingExcluded) continue;

    const playerTeamIndex = getPlayerTeamIndex(match, playerId);
    const winningTeamIndex = getWinningTeamIndex(match);
    const category = getMatchTopLevelType(match.type);

    if (
      playerTeamIndex !== null &&
      now.getTime() - getMatchEndedAtMs(match) <= sevenDaysMs
    ) {
      ratingDelta[category].last7DaysMatchCount += 1;
    }

    // 승패·파트너 궁합·천적·상대 전적은 승패가 갈린 경기만 센다.
    if (playerTeamIndex !== null && winningTeamIndex !== null) {
      const won = playerTeamIndex === winningTeamIndex;

      if (category === "doubles") {
        for (const partner of match.teams[playerTeamIndex].players) {
          if (partner.id === playerId) continue;
          const stat = partnerStatsById.get(partner.id) ?? {
            partner: toStatPlayer(partner),
            matchCount: 0,
            wins: 0,
            losses: 0,
          };
          stat.matchCount += 1;
          if (won) stat.wins += 1;
          else stat.losses += 1;
          partnerStatsById.set(partner.id, stat);
        }
      }

      // 상대 팀 선수 각각과 1경기씩 센다(복식은 두 명, 단식은 한 명).
      for (const opponent of match.teams[playerTeamIndex === 0 ? 1 : 0]
        .players) {
        const stat = opponentStatsById.get(opponent.id) ?? {
          opponent: toStatPlayer(opponent),
          matchCount: 0,
          wins: 0,
          losses: 0,
        };
        stat.matchCount += 1;
        if (won) stat.wins += 1;
        else stat.losses += 1;
        opponentStatsById.set(opponent.id, stat);
      }

      const viewerTeamIndex = headToHead
        ? getPlayerTeamIndex(match, viewerPlayerId)
        : null;
      if (
        headToHead &&
        viewerTeamIndex !== null &&
        viewerTeamIndex !== playerTeamIndex
      ) {
        const stat = headToHead[category];
        stat.matchCount += 1;
        // 요청자 기준 승패라 대상 선수의 승패와 반대다.
        if (won) stat.losses += 1;
        else stat.wins += 1;
        const viewerChange = viewerRatingChangesByMatchId?.get(match.id)?.[0];
        stat.ratingDelta += viewerChange?.delta[category] ?? 0;
      }

      if (won) {
        matchStats[category].matchWins += 1;
      } else {
        matchStats[category].matchLosses += 1;
      }

      for (const score of match.scores ?? []) {
        const setWinner =
          score.scoreA === score.scoreB
            ? null
            : score.scoreA > score.scoreB
              ? 0
              : 1;
        if (setWinner === null) continue;
        if (setWinner === playerTeamIndex) {
          matchStats[category].setWins += 1;
        } else {
          matchStats[category].setLosses += 1;
        }
      }
    }

    const change = match.ratingChanges?.find(
      (candidate) => candidate.playerId === playerId,
    );
    if (!change) continue;

    const elapsedMs = now.getTime() - change.createdAt.getTime();
    const delta = change.delta[category];
    if (elapsedMs <= sevenDaysMs) ratingDelta[category].last7Days += delta;
    if (elapsedMs <= thirtyDaysMs) ratingDelta[category].last30Days += delta;
    if (elapsedMs <= ninetyDaysMs) ratingDelta[category].last90Days += delta;
  }

  const partners = [...partnerStatsById.values()]
    .filter((stat) => stat.matchCount >= PARTNER_STAT_MIN_MATCHES)
    .sort(sortPartnerStats);

  const rivals = [...opponentStatsById.values()]
    .filter(
      (stat) =>
        stat.matchCount >= RIVAL_MIN_MATCHES &&
        // 진 비율 50% 이상. 나눗셈 대신 정수 비교로 쓴다.
        stat.losses * 2 >= stat.matchCount,
    )
    .sort(sortRivalStats);

  const completedMatches = matches.filter(
    (match) => match.status === "completed",
  );
  const recentMatches = [...completedMatches]
    .sort((left, right) => getMatchEndedAtMs(right) - getMatchEndedAtMs(left))
    .slice(0, 5);

  return {
    matchStats,
    ratingDelta,
    ratingHistory,
    recentMatches,
    partners,
    rivals,
    headToHead,
    achievements: achievementMatches
      ? computeAchievements(playerId, achievementMatches, endedSessions)
      : computeAchievements(
          playerId,
          withDoublesRatingAfter(matches),
          endedSessions,
          { clubMatches: false },
        ),
    winStreak: computeCurrentWinStreak(
      completedMatches.map((match) => ({
          id: match.id,
          completedAt: getMatchRecordedAt(match),
          teamPlayerIds: [
            match.teams[0].players.map((player) => player.id),
            match.teams[1].players.map((player) => player.id),
          ],
          scores: match.scores,
          ratingExcluded: match.ratingExcluded,
        })),
      playerId,
    ),
  };
};

/** 경기에 붙은 평점 변경 로그로 경기 직후 선수별 복식 평점(평점 업적 입력)을 붙인다 */
const withDoublesRatingAfter = (
  matches: readonly MatchWithRatingChanges[],
): AchievementMatch[] => {
  const ratingsByMatchId = buildDoublesRatingAfterByMatchId(
    matches.flatMap((match) => match.ratingChanges ?? []),
  );
  return matches.map((match) => ({
    ...match,
    doublesRatingAfter: ratingsByMatchId.get(match.id),
  }));
};
