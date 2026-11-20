import { describe, expect, it } from "vitest";
import {
  MATCHMAKING_ALL_NR_FALLBACK_RATING,
  MATCHMAKING_CANDIDATE_PENALTY_MARGIN,
  MATCHMAKING_DEFAULT_COURTS,
  MATCHMAKING_MIN_CANDIDATES,
  clampMatchmakingCourts,
  recommendDoublesMatches,
  type DoublesRecommendationPlan,
  type MatchmakingParticipant,
  type MatchmakingPlayedMatch,
  type RecommendDoublesMatchesInput,
} from "../matchmaking";

const players = (count: number, baseRating = 3): MatchmakingParticipant[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${String(index + 1).padStart(2, "0")}`,
    doublesRating: Number((baseRating + index * 0.15).toFixed(2)),
  }));

const recommend = (
  overrides: Partial<RecommendDoublesMatchesInput>,
): DoublesRecommendationPlan =>
  recommendDoublesMatches({
    participants: [],
    busyPlayerIds: [],
    completedMatches: [],
    courts: 3,
    seed: 1,
    rank: 0,
    ...overrides,
  });

const assignedIds = (plan: DoublesRecommendationPlan): string[] =>
  plan.courts.flatMap((court) => court.teams.flat());

const matchupKey = (plan: DoublesRecommendationPlan): string =>
  plan.courts
    .map((court) =>
      court.teams
        .map((team) => [...team].sort().join("+"))
        .sort()
        .join(" vs "),
    )
    .sort()
    .join(" | ");

/** 해당 선수가 한 판씩 뛴 완료 경기 목록(상대는 참여자가 아닌 선수) */
const gamesFor = (id: string, count: number): MatchmakingPlayedMatch[] =>
  Array.from({ length: count }, (_, index) => ({
    teams: [
      [id, `guest-${id}-${index}-a`],
      [`guest-${id}-${index}-b`, `guest-${id}-${index}-c`],
    ],
  }));

describe("recommendDoublesMatches", () => {
  it("같은 입력·같은 seed면 결과가 완전히 같다", () => {
    const input: RecommendDoublesMatchesInput = {
      participants: players(13),
      busyPlayerIds: [],
      completedMatches: [{ teams: [["p01", "p02"], ["p03", "p04"]] }],
      courts: 3,
      seed: 42,
      rank: 2,
    };
    expect(recommendDoublesMatches(input)).toEqual(
      recommendDoublesMatches(input),
    );
  });

  it("진행 중인 선수는 코트에도 쉬는 명단에도 나오지 않는다", () => {
    const plan = recommend({
      participants: players(10),
      busyPlayerIds: ["p01", "p02"],
      courts: 3,
    });
    const everyone = [...assignedIds(plan), ...plan.restingPlayerIds];
    expect(plan.courts).toHaveLength(2);
    expect(everyone).toHaveLength(8);
    expect(everyone).not.toContain("p01");
    expect(everyone).not.toContain("p02");
  });

  it("코트 수를 정수로 내리고 1~4로 자르며 인원이 부족하면 floor(n/4)면만 만든다", () => {
    expect(recommend({ participants: players(20), courts: 10 }).courts).toHaveLength(4);
    expect(recommend({ participants: players(20), courts: 0 }).courts).toHaveLength(1);
    expect(recommend({ participants: players(20), courts: 2.9 }).courts).toHaveLength(2);
    expect(clampMatchmakingCourts(Number.POSITIVE_INFINITY)).toBe(4);
    expect(clampMatchmakingCourts(Number.NEGATIVE_INFINITY)).toBe(1);
    expect(clampMatchmakingCourts(Number.NaN)).toBe(MATCHMAKING_DEFAULT_COURTS);

    const short = recommend({ participants: players(9), courts: 3 });
    expect(short.courts).toHaveLength(2);
    expect(short.restingPlayerIds).toHaveLength(1);

    const tooFew = recommend({ participants: players(3), courts: 3 });
    expect(tooFew.courts).toEqual([]);
    expect(tooFew.restingPlayerIds).toEqual(["p01", "p02", "p03"]);
    expect(tooFew.penalty).toBe(0);
    expect(tooFew.rank).toBe(0);
    expect(tooFew.candidateCount).toBe(0);
  });

  it("오늘 경기 수가 2판 이상 적은 사람은 어떤 seed에서도 더 많이 친 사람보다 늦게 뽑히지 않는다", () => {
    const participants = players(5);
    const completedMatches = gamesFor("p05", 2);
    for (let seed = 0; seed < 300; seed += 1) {
      const plan = recommend({ participants, completedMatches, courts: 1, seed });
      expect(plan.restingPlayerIds).toEqual(["p05"]);
    }
  });

  it("오늘 경기 수 1판 차이는 seed에 따라 뒤집히기도 한다", () => {
    const participants = players(5);
    const completedMatches = gamesFor("p05", 1);
    let reversed = 0;
    let kept = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const plan = recommend({ participants, completedMatches, courts: 1, seed });
      if (plan.restingPlayerIds[0] === "p05") {
        kept += 1;
      } else {
        reversed += 1;
      }
    }
    expect(reversed).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(reversed);
  });

  it("NR은 진행 중인 사람을 포함한 참여자 전체 평점의 중앙값으로 대체한다", () => {
    const plan = recommend({
      participants: [
        { id: "a", doublesRating: 3 },
        { id: "b", doublesRating: 4 },
        { id: "c", doublesRating: null },
        { id: "d", doublesRating: 5 },
        { id: "busy", doublesRating: 6 },
      ],
      busyPlayerIds: ["busy"],
      courts: 1,
    });
    // non-null [3, 4, 5, 6]의 중앙값 4.5가 c의 평점이 된다
    const [averageA, averageB] = plan.courts[0].teamAverages;
    expect(averageA + averageB).toBeCloseTo((3 + 4 + 4.5 + 5) / 2);
  });

  it("NR 중앙값은 같은 id가 중복돼도 한 번만 센다", () => {
    const plan = recommend({
      participants: [
        { id: "a", doublesRating: 3 },
        { id: "b", doublesRating: 4 },
        { id: "c", doublesRating: null },
        { id: "d", doublesRating: 5 },
        { id: "d", doublesRating: 5 },
      ],
      courts: 1,
    });
    // 중복을 빼면 non-null [3, 4, 5]의 중앙값 4가 c의 평점이 된다
    const [averageA, averageB] = plan.courts[0].teamAverages;
    expect(averageA + averageB).toBeCloseTo((3 + 4 + 4 + 5) / 2);
  });

  it("전원 NR이면 3.5로 계산한다", () => {
    const plan = recommend({
      participants: ["a", "b", "c", "d"].map((id) => ({
        id,
        doublesRating: null,
      })),
      courts: 1,
    });
    expect(plan.courts[0].teamAverages).toEqual([
      MATCHMAKING_ALL_NR_FALLBACK_RATING,
      MATCHMAKING_ALL_NR_FALLBACK_RATING,
    ]);
  });

  it("오늘 맞붙은 쌍이 다시 맞붙으면 repeatedOpponentPairs에 표시한다", () => {
    const participants = ["a", "b", "c", "d"].map((id) => ({
      id,
      doublesRating: 4,
    }));
    for (let seed = 0; seed < 10; seed += 1) {
      const plan = recommend({
        participants,
        completedMatches: [{ teams: [["a", "b"], ["c", "d"]] }],
        courts: 1,
        seed,
      });
      const court = plan.courts[0];
      // 같은 팀 반복(12점)보다 맞대결 반복 2쌍(6점)이 낫다
      expect(court.repeatedPartnerPairs).toEqual([]);
      expect(court.repeatedOpponentPairs).toHaveLength(2);
      expect(plan.penalty).toBeCloseTo(6);
    }
  });

  it("오늘 같은 팀이었던 쌍이 다시 한 팀이면 repeatedPartnerPairs에 표시한다", () => {
    const plan = recommend({
      participants: [
        { id: "a", doublesRating: 5 },
        { id: "b", doublesRating: 2 },
        { id: "c", doublesRating: 3.5 },
        { id: "d", doublesRating: 3.5 },
      ],
      completedMatches: [{ teams: [["a", "b"], ["x", "y"]] }],
      courts: 1,
    });
    const court = plan.courts[0];
    expect(court.repeatedPartnerPairs.map((pair) => [...pair].sort())).toEqual([
      ["a", "b"],
    ]);
    expect(court.repeatedOpponentPairs).toEqual([]);
  });

  it("rank를 올리면 감점이 줄지 않는 순서로 서로 다른 대진이 나오고, 후보 수를 넘으면 1등으로 돌아간다", () => {
    const input = {
      participants: players(12),
      completedMatches: [
        { teams: [["p01", "p02"], ["p03", "p04"]] as [string[], string[]] },
        { teams: [["p05", "p06"], ["p07", "p08"]] as [string[], string[]] },
      ],
      courts: 3,
    };
    const first = recommend({ ...input, rank: 0 });
    expect(first.rank).toBe(0);
    expect(first.candidateCount).toBeGreaterThanOrEqual(
      MATCHMAKING_MIN_CANDIDATES,
    );

    const plans = Array.from({ length: first.candidateCount }, (_, rank) =>
      recommend({ ...input, rank }),
    );
    expect(new Set(plans.map(matchupKey)).size).toBe(first.candidateCount);
    for (let rank = 1; rank < plans.length; rank += 1) {
      expect(plans[rank].rank).toBe(rank);
      expect(plans[rank].penalty).toBeGreaterThanOrEqual(
        plans[rank - 1].penalty - 1e-9,
      );
    }
    // 선발은 순번과 상관없이 같다
    for (const plan of plans) {
      expect(plan.restingPlayerIds).toEqual(first.restingPlayerIds);
    }

    const wrapped = recommend({ ...input, rank: first.candidateCount });
    expect(wrapped.rank).toBe(0);
    expect(matchupKey(wrapped)).toBe(matchupKey(first));
    expect(
      matchupKey(recommend({ ...input, rank: first.candidateCount + 1 })),
    ).toBe(matchupKey(plans[1]));
  });

  it("여유폭 안 후보가 적으면 감점순으로 최소 개수까지 채우고, 가능한 대진이 적으면 그만큼만 둔다", () => {
    // 4명 1코트는 팀 나누기가 3가지뿐이다. a+b vs c+d(15점)만 여유폭 안이고 나머지 둘은 60점이다
    const plan = recommend({
      participants: [
        { id: "a", doublesRating: 5 },
        { id: "b", doublesRating: 2 },
        { id: "c", doublesRating: 3.5 },
        { id: "d", doublesRating: 3.5 },
      ],
      courts: 1,
    });
    expect(plan.candidateCount).toBe(3);
    expect(plan.penalty).toBeCloseTo(15);

    const second = recommend({
      participants: [
        { id: "a", doublesRating: 5 },
        { id: "b", doublesRating: 2 },
        { id: "c", doublesRating: 3.5 },
        { id: "d", doublesRating: 3.5 },
      ],
      courts: 1,
      rank: 1,
    });
    expect(second.penalty).toBeCloseTo(60);
    expect(second.penalty - plan.penalty).toBeGreaterThan(
      MATCHMAKING_CANDIDATE_PENALTY_MARGIN,
    );
  });

  it("여유폭 안 대진이 최소 개수보다 많으면 모두 후보다", () => {
    // 평점이 모두 같고 오늘 기록이 없으면 모든 대진의 감점이 0이다
    const plan = recommend({
      participants: Array.from({ length: 8 }, (_, index) => ({
        id: `p${index}`,
        doublesRating: 3,
      })),
      courts: 2,
    });
    expect(plan.penalty).toBe(0);
    expect(plan.candidateCount).toBeGreaterThan(MATCHMAKING_MIN_CANDIDATES);
  });

  it("rank가 음수·NaN이면 0, 소수면 내린다", () => {
    const participants = players(8);
    const at = (rank: number) =>
      matchupKey(recommend({ participants, courts: 2, rank }));
    expect(at(-3)).toBe(at(0));
    expect(at(Number.NaN)).toBe(at(0));
    expect(at(1.9)).toBe(at(1));
  });
});
