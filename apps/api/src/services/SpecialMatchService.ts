import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import type { SpecialMatchCandidatePlayer } from "@pkpkdupr/shared/specialMatch";
import { computeCurrentWinStreaks } from "@pkpkdupr/shared/streak";
import { rankPlayersAt, type RankingContext } from "./RankingService";

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
