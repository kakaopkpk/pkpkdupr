import { describe, expect, it } from "vitest";
import type { Match } from "../match.js";
import {
  CHALLENGE_MIN_RATING_GAP,
  judgeChallengeMatch,
  judgeRecommendedSpecialMatch,
  judgeRematchSpecialMatch,
  resolveSessionStartSpecialMatch,
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
  gender: null,
  ...overrides,
});

describe("judgeRecommendedSpecialMatch 남복·여복 매치", () => {
  const team = (gender: "M" | "F" | null, ids: [string, string], extra: Partial<SpecialMatchCandidatePlayer> = {}) =>
    ids.map((id) => player(id, { gender, ...extra }));

  it("네 명 모두 남자면 남복 매치, 모두 여자면 여복 매치이고 결과·주인공이 없다", () => {
    const expected = {
      defendingTeamIndex: null,
      protagonistIds: [null, null],
      rivalPairs: [],
      outcome: null,
    };
    expect(
      judgeRecommendedSpecialMatch([team("M", ["a", "b"]), team("M", ["c", "d"])]),
    ).toEqual({ kind: "men_doubles", ...expected });
    expect(
      judgeRecommendedSpecialMatch([team("F", ["a", "b"]), team("F", ["c", "d"])]),
    ).toEqual({ kind: "women_doubles", ...expected });
  });

  it("성별이 섞이거나 성별 없는 게스트가 끼면 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([team("F", ["a", "b"]), [player("c", { gender: "F" }), player("d", { gender: "M" })]]),
    ).toBeNull();
    expect(
      judgeRecommendedSpecialMatch([
        team("F", ["a", "b"]),
        [player("c", { gender: "F" }), player("d", { gender: null, isGuest: true })],
      ]),
    ).toBeNull();
  });

  it("성별이 있는 게스트는 같은 성별이면 남복·여복 매치에 든다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        team("F", ["a", "b"]),
        [player("c", { gender: "F" }), player("d", { gender: "F", isGuest: true })],
      ])?.kind,
    ).toBe("women_doubles");
  });

  it("연승 매치·라이벌전이 남복·여복 매치보다 먼저다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { gender: "M", winStreak: 3 }), player("b", { gender: "M" })],
        team("M", ["c", "d"]),
      ])?.kind,
    ).toBe("streak_stopper");
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { gender: "F", rank: 9, rating: 3.011 }), player("b", { gender: "F", rank: 18, rating: 2.889 })],
        [player("c", { gender: "F", rank: 10, rating: 3.007 }), player("d", { gender: "F", rank: 14, rating: 2.969 })],
      ])?.kind,
    ).toBe("rival");
  });
});

describe("judgeRecommendedSpecialMatch", () => {
  it("해당 유형이 없으면 null이다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 1, rating: 3.1 }), player("b", { winStreak: 2 })],
        [player("c", { rank: 5, rating: 3.05 }), player("d")],
      ]),
    ).toBeNull();
  });

  it("한 팀에만 3연승 이상 회원이 있으면 연승 매치이고 그 팀이 지킨다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a"), player("b")],
        [player("c", { winStreak: 3 }), player("d")],
      ]),
    ).toEqual({
      kind: "streak_stopper",
      defendingTeamIndex: 1,
      protagonistIds: [null, "c"],
      rivalPairs: [],
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
        [player("a", { winStreak: 3 }), player("b")],
        [player("c"), player("d", { winStreak: 7 })],
      ]),
    ).toEqual({
      kind: "champions",
      defendingTeamIndex: null,
      protagonistIds: ["a", "d"],
      rivalPairs: [],
      outcome: null,
    });
  });

  it("상대로 만나는 두 랭킹 회원의 평점 차가 0.02 이하이고 팀 평균 차가 0.1 이하면 라이벌전이고 순위가 낮은 쪽이 공격이다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b", { rank: 8, rating: 3.0 })],
        [player("c", { rank: 3, rating: 3.52 }), player("d", { rank: 9, rating: 2.95 })],
      ]),
    ).toEqual({
      kind: "rival",
      defendingTeamIndex: 1,
      protagonistIds: ["a", "c"],
      rivalPairs: [{ attackerId: "a", defenderId: "c" }],
      outcome: null,
    });
  });

  it("평점 차가 0.02를 넘거나 랭킹에 없는 회원이면 라이벌전이 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b", { rating: 3.6 })],
        [player("c", { rank: 3, rating: 3.53 }), player("d", { rank: 9, rating: 3.57 })],
      ]),
    ).toBeNull();
  });

  it("두 팀 평균 평점 차가 0.1을 넘으면 개인 평점이 비슷해도 라이벌전이 아니다(도전 매치가 된다)", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b", { rank: 10, rating: 3.2 })],
        [player("c", { rank: 3, rating: 3.51 }), player("d", { rank: 12, rating: 2.9 })],
      ])?.kind,
    ).toBe("challenge");
  });

  it("평점 없는 선수가 있으면 팀 평균을 알 수 없어 라이벌전이 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b", { rank: 8, rating: 3.0 })],
        [player("c", { rank: 3, rating: 3.51 }), player("d")],
      ]),
    ).toBeNull();
  });

  it("같은 팀 두 사람은 라이벌 쌍이 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b", { rank: 3, rating: 3.52 })],
        [player("c", { rank: 1, rating: 4.2 }), player("d", { rank: 9, rating: 2.8 })],
      ]),
    ).toBeNull();
  });

  it("라이벌 쌍이 여럿이면 평점 차가 가장 작은 쌍, 같으면 순위가 높은 쌍이 대표다", () => {
    const result = judgeRecommendedSpecialMatch([
      [player("a", { rank: 6, rating: 3.4 }), player("b", { rank: 4, rating: 3.6 })],
      [player("c", { rank: 5, rating: 3.41 }), player("d", { rank: 3, rating: 3.61 })],
    ]);
    expect(result?.rivalPairs).toEqual([
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
    expect(result?.rivalPairs).toEqual([
      { attackerId: "b", defenderId: "d" },
      { attackerId: "c", defenderId: "a" },
    ]);
    expect(result?.defendingTeamIndex).toBeNull();
    expect(result?.protagonistIds).toEqual(["b", "d"]);
  });

  it("연승이 라이벌전보다 먼저다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b")],
        [player("c", { rank: 3, rating: 3.52 }), player("d", { winStreak: 5 })],
      ])?.kind,
    ).toBe("streak_stopper");
  });

  it("게스트가 낀 코트도 정회원 연승 회원이 있으면 연승 매치다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("g", { isGuest: true })],
        [player("c", { rank: 3, rating: 3.52 }), player("d", { winStreak: 9 })],
      ]),
    ).toEqual({
      kind: "streak_stopper",
      defendingTeamIndex: 1,
      protagonistIds: [null, "d"],
      rivalPairs: [],
      outcome: null,
    });
  });

  it("게스트가 낀 코트도 양 팀에 정회원 연승 회원이 있으면 최강자전이다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { winStreak: 5 }), player("g", { isGuest: true })],
        [player("c"), player("d", { winStreak: 6 })],
      ]),
    ).toMatchObject({
      kind: "champions",
      defendingTeamIndex: null,
      protagonistIds: ["a", "d"],
    });
  });

  it("게스트는 winStreak과 상관없이 연승 주인공이 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a"), player("g", { isGuest: true, winStreak: 9 })],
        [player("c"), player("d")],
      ]),
    ).toBeNull();
    // 게스트 팀 쪽은 연승 회원이 없어 최강자전이 아니라 연승 매치다
    expect(
      judgeRecommendedSpecialMatch([
        [player("a"), player("g", { isGuest: true, winStreak: 9 })],
        [player("c", { winStreak: 5 }), player("d")],
      ]),
    ).toMatchObject({
      kind: "streak_stopper",
      defendingTeamIndex: 1,
      protagonistIds: [null, "c"],
    });
  });

  it("게스트가 한 명이라도 있으면 정회원끼리도 라이벌전이 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("g", { isGuest: true })],
        [player("c", { rank: 3, rating: 3.52 }), player("d")],
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
      rivalPairs: [],
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

describe("도전 매치", () => {
  it("기준은 평균 평점 차 0.1이다", () => {
    expect(CHALLENGE_MIN_RATING_GAP).toBe(0.1);
  });

  it("두 팀 평균 평점 차가 0.1 이상이면 도전 매치이고 높은 팀이 지키며 주인공은 없다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 9, rating: 2.947 }), player("b", { rank: 8, rating: 2.979 })],
        [player("c", { rank: 1, rating: 3.272 }), player("d", { rank: 3, rating: 3.044 })],
      ]),
    ).toEqual({
      kind: "challenge",
      defendingTeamIndex: 1,
      protagonistIds: [null, null],
      rivalPairs: [],
      ratingGap: 0.195,
      outcome: null,
    });
  });

  it("부동소수 오차가 있어도 차가 정확히 0.1이면 도전 매치다", () => {
    const judged = judgeChallengeMatch([
      [player("a", { rating: 3.55 }), player("b", { rating: 3.25 })],
      [player("c", { rating: 3.3 }), player("d", { rating: 3.3 })],
    ]);
    expect(judged?.defendingTeamIndex).toBe(0);
    expect(judged?.ratingGap).toBe(0.1);
  });

  it("차가 0.1보다 작으면 도전 매치가 아니다", () => {
    expect(
      judgeChallengeMatch([
        [player("a", { rating: 3.2 }), player("b", { rating: 3.0 })],
        [player("c", { rating: 3.1 }), player("d", { rating: 2.91 })],
      ]),
    ).toBeNull();
  });

  it("평점 없는 정회원은 3.0으로 친다", () => {
    expect(
      judgeChallengeMatch([
        [player("a"), player("b")],
        [player("c", { rating: 3.2 }), player("d")],
      ])?.ratingGap,
    ).toBe(0.1);
  });

  it("단식은 두 사람 평점 차로 본다", () => {
    expect(
      judgeChallengeMatch([[player("a", { rating: 3.5 })], [player("b", { rating: 3.3 })]]),
    ).toMatchObject({ kind: "challenge", defendingTeamIndex: 0, ratingGap: 0.2 });
  });

  it("게스트가 한 명이라도 있으면 도전 매치가 아니다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rating: 3.8 }), player("b", { rating: 3.6 })],
        [player("c", { rating: 3.0 }), player("g", { isGuest: true })],
      ]),
    ).toBeNull();
  });

  it("연승 매치가 도전 매치보다 먼저다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rating: 3.8 }), player("b", { rating: 3.6 })],
        [player("c", { rating: 3.0, winStreak: 3 }), player("d", { rating: 3.0 })],
      ])?.kind,
    ).toBe("streak_stopper");
  });

  it("팀 평균 차가 정확히 0.1이고 라이벌 쌍이 있으면 라이벌전이 먼저다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rank: 4, rating: 3.5 }), player("b", { rank: 10, rating: 3.3 })],
        [player("c", { rank: 3, rating: 3.51 }), player("d", { rank: 12, rating: 3.09 })],
      ])?.kind,
    ).toBe("rival");
  });

  it("도전 매치가 남복·여복 매치보다 먼저다", () => {
    expect(
      judgeRecommendedSpecialMatch([
        [player("a", { rating: 3.8, gender: "M" }), player("b", { rating: 3.6, gender: "M" })],
        [player("c", { rating: 3.0, gender: "M" }), player("d", { rating: 3.0, gender: "M" })],
      ])?.kind,
    ).toBe("challenge");
  });
});

describe("resolveSessionStartSpecialMatch", () => {
  const challenge = judgeChallengeMatch([
    [player("a", { rating: 3.8 }), player("b", { rating: 3.6 })],
    [player("c", { rating: 3.0 }), player("d", { rating: 3.0 })],
  ]);
  const streak = judgeRecommendedSpecialMatch([
    [player("a", { winStreak: 3 }), player("b")],
    [player("c"), player("d")],
  ]);

  it("재판정 유형이 카드 유형과 같으면 그 유형이다", () => {
    expect(resolveSessionStartSpecialMatch(streak, "streak_stopper")).toBe(streak);
  });

  it("카드 유형과 달라도 재판정이 도전 매치면 도전 매치다(카드 없이 시작한 경기 포함)", () => {
    expect(resolveSessionStartSpecialMatch(challenge, "rival")).toBe(challenge);
    expect(resolveSessionStartSpecialMatch(challenge, null)).toBe(challenge);
  });

  it("카드 없이 시작했는데 연승 매치 등 다른 유형이면 저장하지 않는다", () => {
    expect(resolveSessionStartSpecialMatch(streak, null)).toBeNull();
    expect(resolveSessionStartSpecialMatch(null, "challenge")).toBeNull();
  });
});
