import { compareCountedMatches } from "@pkpkdupr/shared/achievements";
import {
  getMatchTopLevelType,
  getWinningTeamIndex,
  type Match,
  type MatchTopLevelType,
} from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import type {
  SpecialMatch,
  SpecialMatchCandidatePlayer,
  SpecialMatchCelebration,
  SpecialMatchCelebrationPlayer,
  SpecialMatchChallengePair,
  SpecialMatchKind,
  SpecialMatchOutcome,
} from "@pkpkdupr/shared/specialMatch";
import { computeCurrentWinStreaks } from "@pkpkdupr/shared/streak";
import {
  rankPlayersAt,
  type RankingContext,
  type RankingPoint,
} from "./RankingService";

/**
 * 랭킹 원천으로 특수 매치 판정 입력 선수를 만든다. category는 경기 종류 랭킹이다.
 * 랭킹에 없는 선수(게스트·평점 없음·비활성)는 rank·rating이 null이고, 연승은 랭킹 winStreak과 같은 규칙이다.
 */
export const buildSpecialMatchCandidatePlayers = (
  context: RankingContext,
  category: MatchTopLevelType,
  players: readonly Pick<Player, "id" | "isGuest">[],
): Map<string, SpecialMatchCandidatePlayer> => {
  const rankedById = new Map(
    rankPlayersAt(context, category, null).map((entry) => [
      entry.player.id,
      entry,
    ]),
  );
  const winStreaks = computeCurrentWinStreaks(context.matches);
  return new Map(
    players.map((player) => {
      const ranked = rankedById.get(player.id);
      return [
        player.id,
        {
          id: player.id,
          isGuest: player.isGuest,
          rank: ranked?.rank ?? null,
          rating: ranked?.rating ?? null,
          winStreak: winStreaks.get(player.id) ?? 0,
        },
      ];
    }),
  );
};

const getRankById = (
  context: RankingContext,
  category: MatchTopLevelType,
  point: RankingPoint,
) =>
  new Map(
    rankPlayersAt(context, category, point).map((entry) => [
      entry.player.id,
      entry.rank,
    ]),
  );

/** 결과 판정·연출 입력 경기. completedAt은 평점 로그 시각과 같아 이 경기 반영 전·후 시점을 가른다 */
export type SpecialMatchSettleTarget = Pick<
  Match,
  "id" | "type" | "teams" | "scores" | "completedAt"
> & { completedAt: Date };

type SpecialMatchEvaluation =
  | { outcome: null }
  | {
      outcome: SpecialMatchOutcome;
      winnerIndex: 0 | 1;
      loserIndex: 0 | 1;
      /** 순위를 뒤집은 도전 쌍(대표 쌍 먼저). 라이벌전이 아니면 빈 배열이다 */
      successfulPairs: SpecialMatchChallengePair[];
      /** 반영 직후 순위. 라이벌전이 아니면 계산하지 않아 비어 있다 */
      rankAfter: Map<string, number>;
    };

/**
 * 평점 반영이 끝난 특수 매치의 결과. 순위는 그 경기 종류 랭킹에서 이 경기 반영 직후(rankAfter) 시점이다.
 * 승패가 갈리지 않으면 outcome null이다.
 */
const evaluateSpecialMatch = (
  context: RankingContext,
  specialMatch: SpecialMatch,
  match: SpecialMatchSettleTarget,
): SpecialMatchEvaluation => {
  const winnerIndex = getWinningTeamIndex(match);
  if (winnerIndex == null) {
    return { outcome: null };
  }
  const loserIndex = winnerIndex === 0 ? 1 : 0;

  switch (specialMatch.kind) {
    case "challenge": {
      const rankAfter = getRankById(
        context,
        getMatchTopLevelType(match.type),
        { at: match.completedAt, inclusive: true },
      );
      const winnerIds = new Set(
        match.teams[winnerIndex].players.map((player) => player.id),
      );
      // 이긴 팀 공격자가 반영 직후 방어자보다 높은 순위(작은 숫자)가 된 도전 쌍. 원래 순서(대표 쌍 먼저)를 지킨다
      const successfulPairs = specialMatch.challengePairs.filter((pair) => {
        const attackerRank = rankAfter.get(pair.attackerId);
        const defenderRank = rankAfter.get(pair.defenderId);
        return (
          winnerIds.has(pair.attackerId) &&
          attackerRank != null &&
          defenderRank != null &&
          attackerRank < defenderRank
        );
      });
      return {
        outcome:
          successfulPairs.length > 0 ? "challenge_success" : "defense_success",
        winnerIndex,
        loserIndex,
        successfulPairs,
        rankAfter,
      };
    }
    case "streak_stopper":
    case "champions":
    case "revenge": {
      const defendingTeamLost = specialMatch.defendingTeamIndex === loserIndex;
      const outcomeByKind: Record<
        Exclude<SpecialMatchKind, "challenge">,
        SpecialMatchOutcome
      > = {
        streak_stopper: defendingTeamLost ? "streak_stopped" : "streak_defended",
        champions: "champions_won",
        revenge: defendingTeamLost ? "revenge_success" : "revenge_defended",
      };
      return {
        outcome: outcomeByKind[specialMatch.kind],
        winnerIndex,
        loserIndex,
        successfulPairs: [],
        rankAfter: new Map(),
      };
    }
  }
};

/** 특수 매치 결과 판정(연출 데이터는 만들지 않는다) */
export const judgeSpecialMatchOutcome = (
  context: RankingContext,
  specialMatch: SpecialMatch,
  match: SpecialMatchSettleTarget,
): SpecialMatchOutcome | null =>
  evaluateSpecialMatch(context, specialMatch, match).outcome;

const toCelebrationPlayer = (
  match: SpecialMatchSettleTarget,
  playerId: string | null,
): SpecialMatchCelebrationPlayer | null => {
  const player = match.teams
    .flatMap((team) => team.players)
    .find((candidate) => candidate.id === playerId);
  return player
    ? { id: player.id, username: player.username, avatarUrl: player.avatarUrl }
    : null;
};

/** 이 경기 직전까지(완료 순서상 앞선 평점 반영 경기만) 센 연승 */
const computeWinStreaksBefore = (
  context: RankingContext,
  match: SpecialMatchSettleTarget,
) =>
  computeCurrentWinStreaks(
    context.matches.filter(
      (candidate) =>
        compareCountedMatches(candidate, {
          id: match.id,
          completedAt: match.completedAt,
        }) < 0,
    ),
  );

/**
 * 결과와 큰 연출 데이터. 연출은 결과가 라이벌전 승리·연승 저지·최강자전 승리일 때만 만들고,
 * 필요한 선수·순위를 찾지 못하면 null이다(결과는 그대로 정한다).
 */
export const settleSpecialMatch = (
  context: RankingContext,
  specialMatch: SpecialMatch,
  match: SpecialMatchSettleTarget,
): {
  outcome: SpecialMatchOutcome | null;
  celebration: SpecialMatchCelebration | null;
} => {
  const evaluation = evaluateSpecialMatch(context, specialMatch, match);
  if (evaluation.outcome == null) {
    return { outcome: null, celebration: null };
  }
  const { outcome, winnerIndex, loserIndex, successfulPairs, rankAfter } =
    evaluation;

  const buildCelebration = (): SpecialMatchCelebration | null => {
    if (outcome === "challenge_success") {
      const rankBefore = getRankById(
        context,
        getMatchTopLevelType(match.type),
        { at: match.completedAt, inclusive: false },
      );
      for (const pair of successfulPairs) {
        const challenger = toCelebrationPlayer(match, pair.attackerId);
        const defender = toCelebrationPlayer(match, pair.defenderId);
        const challengerBefore = rankBefore.get(pair.attackerId);
        const defenderBefore = rankBefore.get(pair.defenderId);
        if (
          challenger &&
          defender &&
          challengerBefore != null &&
          defenderBefore != null
        ) {
          return {
            kind: "challenge",
            defender: {
              player: defender,
              rankBefore: defenderBefore,
              rankAfter: rankAfter.get(pair.defenderId)!,
            },
            challenger: {
              player: challenger,
              rankBefore: challengerBefore,
              rankAfter: rankAfter.get(pair.attackerId)!,
            },
          };
        }
      }
      return null;
    }
    if (outcome === "streak_stopped") {
      const stoppedId =
        specialMatch.defendingTeamIndex == null
          ? null
          : specialMatch.protagonistIds[specialMatch.defendingTeamIndex];
      const stopped = toCelebrationPlayer(match, stoppedId);
      if (!stopped) return null;
      return {
        kind: "streak_stopper",
        stopped: {
          player: stopped,
          streakBefore: computeWinStreaksBefore(context, match).get(stopped.id) ?? 0,
        },
      };
    }
    if (outcome === "champions_won") {
      const winner = toCelebrationPlayer(
        match,
        specialMatch.protagonistIds[winnerIndex],
      );
      const loser = toCelebrationPlayer(
        match,
        specialMatch.protagonistIds[loserIndex],
      );
      if (!winner || !loser) return null;
      const streaks = computeWinStreaksBefore(context, match);
      return {
        kind: "champions",
        winner: { player: winner, streakBefore: streaks.get(winner.id) ?? 0 },
        loser: { player: loser, streakBefore: streaks.get(loser.id) ?? 0 },
      };
    }
    return null;
  };

  return { outcome, celebration: buildCelebration() };
};
