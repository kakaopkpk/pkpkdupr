import { describe, expect, it } from "vitest";
import type { Match } from "../match.js";
import {
  judgeRecommendedSpecialMatch,
  judgeRematchSpecialMatch,
  type SpecialMatchCandidatePlayer,
} from "../specialMatch.js";

const player = (
  id: string,
  overrides: Partial<SpecialMatchCandidatePlayer> = {},
): SpecialMatchCandidatePlayer => ({
  id,
  isGuest: false,
  rank: null,
  rating: null,
  winStreak: 0,
  ...overrides,
});

describe("judgeRecommendedSpecialMatch", () => {
  it("해당 유형이 없으면 null이다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 1, rating: 4 }), player("b", { winStreak: 4 })],
        [player("c", { rank: 5, rating: 3.5 }), player("d")],
      ]),
    ).toBeNull();
  });

  it("한 팀에만 5연승 이상 회원이 있으면 연승 저지이고 그 팀이 지킨다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a"), player("b")],
        [player("c", { winStreak: 5 }), player("d")],
      ]),
    ).toEqual({
      kind: "streak_stopper",
      defendingTeamIndex: 1,
      protagonistIds: [null, "c"],
      challengePairs: [],
      outcome: null,
    });
  });

  it("같은 팀에 연승 회원이 둘이면 연승이 긴 사람이 주인공이다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { winStreak: 6 }), player("b", { winStreak: 8 })],
        [player("c"), player("d")],
      ])?.protagonistIds,
    ).toEqual(["b", null]);
  });

  it("양쪽 팀에 모두 연승 회원이 있으면 최강자전이다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { winStreak: 5 }), player("b")],
        [player("c"), player("d", { winStreak: 7 })],
      ]),
    ).toEqual({
      kind: "champions",
      defendingTeamIndex: null,
      protagonistIds: ["a", "d"],
      challengePairs: [],
      outcome: null,
    });
  });

  it("상대로 만나는 두 랭킹 회원의 평점 차가 0.05 이하면 라이벌전이고 순위가 낮은 쪽이 도전한다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b")],
        [player("c", { rank: 3, rating: 3.55 }), player("d")],
      ]),
    ).toEqual({
      kind: "challenge",
      defendingTeamIndex: 1,
      protagonistIds: ["a", "c"],
      challengePairs: [{ attackerId: "a", defenderId: "c" }],
      outcome: null,
    });
  });

  it("평점 차가 0.05를 넘거나 랭킹에 없는 회원이면 라이벌전이 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b", { rating: 3.6 })],
        [player("c", { rank: 3, rating: 3.56 }), player("d", { rank: 9 })],
      ]),
    ).toBeNull();
  });

  it("같은 팀 두 사람은 도전 쌍이 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b", { rank: 3, rating: 3.52 })],
        [player("c", { rank: 1, rating: 4.2 }), player("d", { rank: 9, rating: 2.8 })],
      ]),
    ).toBeNull();
  });

  it("도전 쌍이 여럿이면 평점 차가 가장 작은 쌍, 같으면 순위가 높은 쌍이 대표다", () => {
    const result = judgeRecommendedSpecialMatch([
      [player("a", { rank: 6, rating: 3.4 }), player("b", { rank: 4, rating: 3.6 })],
      [player("c", { rank: 5, rating: 3.43 }), player("d", { rank: 3, rating: 3.63 })],
    ]);
    expect(result?.challengePairs).toEqual([
      { attackerId: "b", defenderId: "d" },
      { attackerId: "a", defenderId: "c" },
    ]);
    expect(result?.protagonistIds).toEqual(["b", "d"]);
    expect(result?.defendingTeamIndex).toBe(1);
  });

  it("공격자가 양쪽 팀에 다 있으면 지키는 팀이 없다", () => {
    const result = judgeRecommendedSpecialMatch([
      [player("a", { rank: 2, rating: 4.0 }), player("b", { rank: 7, rating: 3.3 })],
      [player("c", { rank: 3, rating: 3.98 }), player("d", { rank: 6, rating: 3.31 })],
    ]);
    expect(result?.challengePairs).toEqual([
      { attackerId: "b", defenderId: "d" },
      { attackerId: "c", defenderId: "a" },
    ]);
    expect(result?.defendingTeamIndex).toBeNull();
    expect(result?.protagonistIds).toEqual(["b", "d"]);
  });

  it("연승이 도전보다 먼저다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b")],
        [player("c", { rank: 3, rating: 3.52 }), player("d", { winStreak: 5 })],
      ])?.kind,
    ).toBe("streak_stopper");
  });

  it("게스트가 한 명이라도 있으면 연승·도전 모두 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("g", { isGuest: true })],
        [player("c", { rank: 3, rating: 3.52 }), player("d", { winStreak: 9 })],
      ]),
    ).toBeNull();
  });
});

const previousMatch = (
  teams: [string[], string[]],
  scores: Match["scores"],
  status: Match["status"] = "completed",
): Pick<Match, "status" | "teams" | "scores"> => ({
  status,
  teams: teams.map((ids, index) => ({
    id: `t${index}`,
    name: `팀 ${index}`,
    players: ids.map((id) => ({ id }) as Match["teams"][number]["players"][number]),
  })) as Match["teams"],
  scores,
});

describe("judgeRematchSpecialMatch", () => {
  const previous = previousMatch(
    [
      ["a", "b"],
      ["c", "d"],
    ],
    [{ scoreA: 11, scoreB: 7 }],
  );

  it("같은 멤버면 리벤지이고 원래 이긴 팀이 지킨다", () => {
    expect(
      judgeRematchSpecialMatch(
        [
          ["b", "a"],
          ["c", "d"],
        ],
        previous,
      ),
    ).toEqual({
      kind: "revenge",
      defendingTeamIndex: 0,
      protagonistIds: [null, null],
      challengePairs: [],
      outcome: null,
    });
  });

  it("팀 순서가 바뀌면 지키는 팀 index도 따라간다", () => {
    expect(
      judgeRematchSpecialMatch(
        [
          ["d", "c"],
          ["a", "b"],
        ],
        previous,
      )?.defendingTeamIndex,
    ).toBe(1);
  });

  it("멤버나 팀 구성이 다르면 null이다", () => {
    expect(
      judgeRematchSpecialMatch(
        [
          ["a", "c"],
          ["b", "d"],
        ],
        previous,
      ),
    ).toBeNull();
    expect(
      judgeRematchSpecialMatch(
        [
          ["a", "b"],
          ["c", "e"],
        ],
        previous,
      ),
    ).toBeNull();
  });

  it("원래 경기가 완료 전이거나 승패가 갈리지 않았으면 null이다", () => {
    const teams: [string[], string[]] = [
      ["a", "b"],
      ["c", "d"],
    ];
    expect(
      judgeRematchSpecialMatch(teams, previousMatch(teams, [], "created")),
    ).toBeNull();
    expect(
      judgeRematchSpecialMatch(
        teams,
        previousMatch(teams, [{ scoreA: 10, scoreB: 10 }]),
      ),
    ).toBeNull();
  });
});
