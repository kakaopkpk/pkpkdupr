import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import type {
  MatchSessionRecommendationResponse,
  RecommendationPlayer,
} from "@pkpkdupr/shared/matchmaking";
import {
  getExpandableCourtCount,
  getRequestedCourtCount,
  getStaleRecommendedPlayerIds,
  removeRecommendedCourt,
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

describe("getRequestedCourtCount", () => {
  const sessionMatch = (sessionId: string | null) => ({
    session: sessionId ? { id: sessionId } : undefined,
  });

  it("기본 코트 수에서 이 세션 진행 중 경기 수를 뺀다", () => {
    expect(getRequestedCourtCount("S1", [])).toBe(3);
    expect(getRequestedCourtCount("S1", [sessionMatch("S1")] as never)).toBe(2);
    expect(
      getRequestedCourtCount("S1", [sessionMatch("S1"), sessionMatch("S1")] as never),
    ).toBe(1);
  });

  it("다른 세션·세션 없는 진행 중 경기는 세지 않는다", () => {
    expect(
      getRequestedCourtCount("S1", [
        sessionMatch("S2"),
        sessionMatch(null),
        sessionMatch("S1"),
      ] as never),
    ).toBe(2);
  });

  it("0보다 작지 않다", () => {
    const matches = Array.from({ length: 4 }, () => sessionMatch("S1"));
    expect(getRequestedCourtCount("S1", matches as never)).toBe(0);
  });

  it("이 세션 경기가 끝나 진행 중 경기가 줄면 늘어난다", () => {
    const three = Array.from({ length: 3 }, () => sessionMatch("S1"));
    expect(getRequestedCourtCount("S1", three as never)).toBe(0);
    expect(getRequestedCourtCount("S1", three.slice(1) as never)).toBe(1);
  });

  it("세션이 없으면 0이다", () => {
    expect(getRequestedCourtCount(null, [])).toBe(0);
  });
});

describe("removeRecommendedCourt", () => {
  const court = (ids: [string, string, string, string]) => ({
    teams: [team(ids[0], ids[1]), team(ids[2], ids[3])] as [
      ReturnType<typeof team>,
      ReturnType<typeof team>,
    ],
    repeatedPartnerPairs: [] as Array<[string, string]>,
    repeatedOpponentPairs: [] as Array<[string, string]>,
    specialMatch: null,
  });
  const three: MatchSessionRecommendationResponse = {
    ...recommendation,
    requestedCourts: 3,
    reroll: 2,
    courts: [
      court(["a", "b", "c", "d"]),
      court(["e", "f", "g", "h"]),
      court(["i", "j", "k", "l"]),
    ],
  };

  it("시작한 코트만 빼고 나머지 코트·순서·쉬는 선수·다시 추천 횟수는 그대로다", () => {
    const result = removeRecommendedCourt(three, court(["e", "f", "g", "h"]));
    expect(result.courts).toEqual([three.courts[0], three.courts[2]]);
    expect(result.courts[0]).toBe(three.courts[0]);
    expect(result.restingPlayers).toBe(three.restingPlayers);
    expect(result.reroll).toBe(2);
    expect(result.candidateCount).toBe(three.candidateCount);
  });

  it("같은 선수 구성의 코트가 없으면 코트를 그대로 둔다", () => {
    expect(
      removeRecommendedCourt(three, court(["a", "b", "x", "y"])).courts,
    ).toEqual(three.courts);
  });

  it("시작한 코트를 빼고 그 선수를 진행 중으로 치면 stale·코트 늘리기 재조회가 없다", () => {
    const ids = Array.from({ length: 12 }, (_, i) => "abcdefghijkl"[i]);
    const started = court(["a", "b", "c", "d"]);
    const removed = removeRecommendedCourt(three, started);
    const busy = [inProgress(["a", "b", "c", "d"])];
    expect(
      getStaleRecommendedPlayerIds(removed, session(ids) as never, busy as never),
    ).toEqual([]);
    expect(
      getExpandableCourtCount(removed, session(ids) as never, busy as never, 2),
    ).toBe(0);
  });

  it("이 세션 경기가 끝나 요청 코트 수가 늘면 채울 수 있는 코트가 보이는 코트보다 많아져 다시 받는다", () => {
    const ids = Array.from({ length: 12 }, (_, i) => "abcdefghijkl"[i]);
    const removed = removeRecommendedCourt(three, court(["a", "b", "c", "d"]));
    expect(getExpandableCourtCount(removed, session(ids) as never, [], 3)).toBe(3);
  });
});
