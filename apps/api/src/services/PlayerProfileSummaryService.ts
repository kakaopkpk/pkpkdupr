import {
  getMatchTopLevelType,
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
  type HeadToHeadStat,
  type PartnerStat,
  type StatPlayer,
} from "@pkpkdupr/shared/profileStats";

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
  headToHead: HeadToHeadStat | null;
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

export const getWinningTeamIndex = (
  match: Pick<Match, "scores">,
): 0 | 1 | null => {
  if (!match.scores?.length) return null;

  const setWins = match.scores.reduce<[number, number]>(
    ([teamA, teamB], score) => [
      teamA + Number(score.scoreA > score.scoreB),
      teamB + Number(score.scoreB > score.scoreA),
    ],
    [0, 0],
  );
  if (setWins[0] !== setWins[1]) return setWins[0] > setWins[1] ? 0 : 1;

  const points = match.scores.reduce<[number, number]>(
    ([teamA, teamB], score) => [teamA + score.scoreA, teamB + score.scoreB],
    [0, 0],
  );
  if (points[0] === points[1]) return null;
  return points[0] > points[1] ? 0 : 1;
};

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

const getMatchStartsAtMs = (match: Match) => toTimeMs(match.matchStartsAt);

const toStatPlayer = (player: Player): StatPlayer => ({
  id: player.id,
  username: player.username,
  avatarUrl: player.avatarUrl,
});

const getMatchEndedAtMs = (match: Match) =>
  toTimeMs(match.completedAt ?? match.matchStartsAt);

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

export const buildPlayerProfileSummary = (
  matches: MatchWithRatingChanges[],
  playerId: string,
  ratingHistory: PlayerRatingHistory,
  viewerPlayerId: string,
  now: Date = new Date(),
): PlayerProfileSummary => {
  const matchStats = createEmptyMatchStats();
  const ratingDelta = createEmptyRatingDelta();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const partnerStatsById = new Map<string, PartnerStat>();
  const headToHead: HeadToHeadStat | null =
    viewerPlayerId === playerId ? null : { matchCount: 0, wins: 0, losses: 0 };

  for (const match of matches) {
    if (match.status !== "completed") continue;

    const playerTeamIndex = getPlayerTeamIndex(match, playerId);
    const winningTeamIndex = getWinningTeamIndex(match);
    const category = getMatchTopLevelType(match.type);

    if (
      playerTeamIndex !== null &&
      now.getTime() - getMatchEndedAtMs(match) <= sevenDaysMs
    ) {
      ratingDelta[category].last7DaysMatchCount += 1;
    }

    // 승패·파트너 궁합·상대 전적은 승패가 갈린 경기만 센다.
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

      const viewerTeamIndex = headToHead
        ? getPlayerTeamIndex(match, viewerPlayerId)
        : null;
      if (
        headToHead &&
        viewerTeamIndex !== null &&
        viewerTeamIndex !== playerTeamIndex
      ) {
        headToHead.matchCount += 1;
        // 요청자 기준 승패라 대상 선수의 승패와 반대다.
        if (won) headToHead.losses += 1;
        else headToHead.wins += 1;
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

  const recentMatches = matches
    .filter((match) => match.status === "completed")
    .sort((left, right) => getMatchStartsAtMs(right) - getMatchStartsAtMs(left))
    .slice(0, 5);

  return {
    matchStats,
    ratingDelta,
    ratingHistory,
    recentMatches,
    partners,
    headToHead,
  };
};
