import { describe, expect, it, vi } from "vitest";
import type {
  RecommendationPlayer,
  RecommendedCourt,
} from "@pkpkdupr/shared/matchmaking";
import { buildRecommendedMatchRequest } from "./matchSessions";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const player = (id: string): RecommendationPlayer => ({
  id,
  username: id,
  doublesRating: null,
  doublesRank: null,
  winStreak: 0,
});

const court = (
  specialMatch: RecommendedCourt["specialMatch"],
): RecommendedCourt => ({
  teams: [
    { players: [player("a"), player("b")], averageRating: 3 },
    { players: [player("c"), player("d")], averageRating: 3 },
  ],
  repeatedPartnerPairs: [],
  repeatedOpponentPairs: [],
  specialMatch,
});

describe("buildRecommendedMatchRequest", () => {
  it("일반 카드는 추천 팀 순서 그대로 보내고 recommendedSpecialKind를 생략한다", () => {
    const request = buildRecommendedMatchRequest(court(null));
    expect(request.teams.map((team) => team.playerIds)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect("recommendedSpecialKind" in request).toBe(false);
  });

  it("특수 유형 카드는 지키는 쪽이 오른쪽 팀이어도 팀 순서를 바꾸지 않고 유형을 넘긴다", () => {
    const request = buildRecommendedMatchRequest(
      court({
        kind: "rival",
        defendingTeamIndex: 1,
        protagonistIds: ["a", "c"],
        rivalPairs: [{ attackerId: "a", defenderId: "c" }],
        outcome: null,
      }),
    );
    expect(request.teams.map((team) => team.playerIds)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(request.recommendedSpecialKind).toBe("rival");
  });
});
