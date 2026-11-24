import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import type {
  MatchSessionRecommendationResponse,
  RecommendationPlayer,
} from "@pkpkdupr/shared/matchmaking";
import {
  getExpandableCourtCount,
  getStaleRecommendedPlayerIds,
} from "@/components/home/useSessionRecommendations";

const player = (id: string): RecommendationPlayer => ({
  id,
  username: id,
  doublesRating: null,
  doublesRank: null,
  winStreak: 0,
});
const team = (a: string, b: string) => ({
  players: [player(a), player(b)] as [RecommendationPlayer, RecommendationPlayer],
  averageRating: 3,
});

const recommendation: MatchSessionRecommendationResponse = {
  sessionId: "S1",
  requestedCourts: 1,
  reroll: 0,
  candidateCount: 1,
  courts: [
    {
      teams: [team("a", "b"), team("c", "d")],
      repeatedPartnerPairs: [],
      repeatedOpponentPairs: [],
      specialMatch: null,
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

describe("getExpandableCourtCount", () => {
  const ids = (count: number) => Array.from({ length: count }, (_, i) => `p${i}`);

  it("대기 인원으로 채울 수 있는 코트가 보이는 코트보다 많을 때만 그 코트 수를 낸다", () => {
    // 대기 12명, 1코트 보임 -> 요청 3코트까지 채움
    expect(
      getExpandableCourtCount(recommendation, session(ids(12)) as never, [], 3),
    ).toBe(3);
    // 대기 8명이면 2코트
    expect(
      getExpandableCourtCount(recommendation, session(ids(8)) as never, [], 3),
    ).toBe(2);
  });

  it("대기 인원 경계값: 4명 단위로 코트가 늘어난다", () => {
    const count = (n: number) =>
      getExpandableCourtCount(recommendation, session(ids(n)) as never, [], 3);
    expect(count(7)).toBe(0);
    expect(count(8)).toBe(2);
    expect(count(11)).toBe(2);
    expect(count(12)).toBe(3);
  });

  it("요청 코트 수를 넘겨 늘리지 않는다", () => {
    expect(
      getExpandableCourtCount(recommendation, session(ids(20)) as never, [], 3),
    ).toBe(3);
  });

  it("진행 중 경기에 든 사람은 대기 인원에서 뺀다", () => {
    expect(
      getExpandableCourtCount(
        recommendation,
        session(ids(12)) as never,
        [inProgress(ids(4))] as never,
        3,
      ),
    ).toBe(2);
  });

  it("늘어날 코트가 없으면 0이다", () => {
    expect(
      getExpandableCourtCount(recommendation, session(ids(4)) as never, [], 3),
    ).toBe(0);
    expect(
      getExpandableCourtCount(recommendation, session(ids(3)) as never, [], 3),
    ).toBe(0);
  });

  it("추천이 없거나 다른 세션 것이면 0이다", () => {
    expect(getExpandableCourtCount(null, session(ids(12)) as never, [], 3)).toBe(0);
    expect(
      getExpandableCourtCount(
        recommendation,
        { id: "S2", participants: ids(12).map((id) => ({ id })) } as never,
        [],
        3,
      ),
    ).toBe(0);
  });
});
