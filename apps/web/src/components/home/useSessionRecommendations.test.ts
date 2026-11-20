import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import type { MatchSessionRecommendationResponse } from "@pkpkdupr/shared/matchmaking";
import { getStaleRecommendedPlayerIds } from "@/components/home/useSessionRecommendations";

const player = (id: string) => ({ id, username: id, doublesRating: null });
const team = (a: string, b: string) => ({
  players: [player(a), player(b)] as [ReturnType<typeof player>, ReturnType<typeof player>],
  averageRating: 3,
});

const recommendation: MatchSessionRecommendationResponse = {
  sessionId: "S1",
  requestedCourts: 1,
  rank: 0,
  candidateCount: 1,
  courts: [
    {
      teams: [team("a", "b"), team("c", "d")],
      repeatedPartnerPairs: [],
      repeatedOpponentPairs: [],
    },
  ],
  restingPlayers: [player("e")],
};

const session = (ids: string[]) => ({
  id: "S1",
  participants: ids.map((id) => ({ id })),
});

const inProgress = (ids: string[]) => ({
  teams: [{ players: ids.map((id) => ({ id })) }],
});

describe("getStaleRecommendedPlayerIds", () => {
  it("진행 중 경기에 든 추천 선수와 참여자에서 빠진 추천 선수를 고른다", () => {
    expect(
      getStaleRecommendedPlayerIds(
        recommendation,
        session(["a", "b", "c", "e"]) as never,
        [inProgress(["b", "x"])] as never,
      ),
    ).toEqual(["b", "d"]);
  });

  it("쉬는 선수는 보지 않는다", () => {
    expect(
      getStaleRecommendedPlayerIds(
        recommendation,
        session(["a", "b", "c", "d"]) as never,
        [inProgress(["e"])] as never,
      ),
    ).toEqual([]);
  });

  it("추천이 없거나 다른 세션 것이면 빈 배열이다", () => {
    expect(getStaleRecommendedPlayerIds(null, session([]) as never, [])).toEqual([]);
    expect(
      getStaleRecommendedPlayerIds(
        recommendation,
        { id: "S2", participants: [] } as never,
        [],
      ),
    ).toEqual([]);
  });
});
