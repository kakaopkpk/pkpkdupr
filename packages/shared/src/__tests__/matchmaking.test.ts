import { describe, expect, it } from "vitest";
import {
  MATCHMAKING_ALL_NR_FALLBACK_RATING,
  MATCHMAKING_GUEST_RATING,
  MATCHMAKING_CANDIDATE_PENALTY_MARGIN,
  MATCHMAKING_DEFAULT_COURTS,
  MATCHMAKING_MIN_CANDIDATES,
  clampMatchmakingCourts,
  getMatchmakingSeed,
  getSpecialMatchRecommendationBonus,
  recommendDoublesMatches,
  type DoublesRecommendationPlan,
  type MatchmakingParticipant,
  type MatchmakingPlayedMatch,
  type RecommendDoublesMatchesInput,
} from "../matchmaking";
import {
  judgeRecommendedSpecialMatch,
  SPECIAL_MATCH_RECOMMENDATION_BONUS,
  type SpecialMatchCandidatePlayer,
} from "../specialMatch";

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

  it("게스트는 평점과 상관없이 2.5로 치고 NR 중앙값 계산에서 뺀다", () => {
    const plan = recommend({
      participants: [
        { id: "a", doublesRating: 3 },
        { id: "b", doublesRating: 4 },
        { id: "c", doublesRating: null },
        { id: "guest", doublesRating: 5, isGuest: true },
        { id: "guest2", doublesRating: null, isGuest: true },
      ],
      busyPlayerIds: ["guest2"],
      courts: 1,
    });
    // 게스트를 뺀 non-null [3, 4]의 중앙값 3.5가 c의 평점, 게스트는 2.5다
    const [averageA, averageB] = plan.courts[0].teamAverages;
    expect(averageA + averageB).toBeCloseTo(
      (3 + 4 + 3.5 + MATCHMAKING_GUEST_RATING) / 2,
    );
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
    const completedMatches: MatchmakingPlayedMatch[] = [
      { teams: [["p01", "p02"], ["p03", "p04"]] },
      { teams: [["p05", "p06"], ["p07", "p08"]] },
    ];
    const input = { participants: players(12), completedMatches, courts: 3 };
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
    const participants = [
      { id: "a", doublesRating: 5 },
      { id: "b", doublesRating: 2 },
      { id: "c", doublesRating: 3.5 },
      { id: "d", doublesRating: 3.5 },
    ];
    const plan = recommend({ participants, courts: 1 });
    expect(plan.candidateCount).toBe(3);
    expect(plan.penalty).toBeCloseTo(15);

    const second = recommend({ participants, courts: 1, rank: 1 });
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

  it("탐색 seed는 세션과 완료 경기 수가 같으면 같고, 경기가 끝나면 바뀐다", () => {
    expect(getMatchmakingSeed("Sabc", 3)).toBe(getMatchmakingSeed("Sabc", 3));
    expect(getMatchmakingSeed("Sabc", 4)).not.toBe(getMatchmakingSeed("Sabc", 3));
    expect(getMatchmakingSeed("Sxyz", 3)).not.toBe(getMatchmakingSeed("Sabc", 3));
    expect(Number.isInteger(getMatchmakingSeed("Sabc", 0))).toBe(true);
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

describe("recommendDoublesMatches 특수 유형 가산점", () => {
  /** 평점 내림차순으로 순위를 매긴 판정 입력. winStreaks로 연승을, guestIds로 게스트를 지정한다 */
  const toSpecialPlayers = (
    participants: MatchmakingParticipant[],
    winStreaks: Record<string, number> = {},
    guestIds: string[] = [],
  ): Map<string, SpecialMatchCandidatePlayer> => {
    const ranked = [...participants]
      .filter((participant) => participant.doublesRating !== null)
      .sort((a, b) => b.doublesRating! - a.doublesRating!);
    return new Map(
      participants.map((participant) => {
        const isGuest = guestIds.includes(participant.id);
        const rankIndex = ranked.findIndex(
          (entry) => entry.id === participant.id,
        );
        return [
          participant.id,
          {
            id: participant.id,
            isGuest,
            rank: isGuest || rankIndex < 0 ? null : rankIndex + 1,
            rating: isGuest ? null : participant.doublesRating,
            winStreak: winStreaks[participant.id] ?? 0,
          },
        ];
      }),
    );
  };

  /** 가산점 없이 계산한 대진별 감점 */
  const basePenaltyByMatchup = (
    input: Partial<RecommendDoublesMatchesInput>,
  ): Map<string, number> => {
    const first = recommend({ ...input, specialPlayers: undefined });
    const penalties = new Map<string, number>();
    for (let rank = 0; rank < first.candidateCount; rank += 1) {
      const plan = recommend({ ...input, specialPlayers: undefined, rank });
      penalties.set(matchupKey(plan), plan.penalty);
    }
    return penalties;
  };

  /** 고른 대진의 코트마다 판정한 가산점 중 최대값 */
  const expectedBonus = (
    plan: DoublesRecommendationPlan,
    specialPlayers: Map<string, SpecialMatchCandidatePlayer>,
  ): number =>
    Math.max(
      0,
      ...plan.courts.map((court) => {
        const [teamA, teamB] = court.teams.map((team) =>
          team.map((id) => specialPlayers.get(id)!),
        );
        const special = judgeRecommendedSpecialMatch([teamA, teamB]);
        return special ? getSpecialMatchRecommendationBonus(special.kind) : 0;
      }),
    );

  it("유형별 가산점은 최강자전 2, 라이벌전 1.5, 연승 저지·리벤지 0이다", () => {
    expect(getSpecialMatchRecommendationBonus("champions")).toBe(2);
    expect(getSpecialMatchRecommendationBonus("challenge")).toBe(1.5);
    expect(getSpecialMatchRecommendationBonus("streak_stopper")).toBe(0);
    expect(getSpecialMatchRecommendationBonus("revenge")).toBe(0);
    expect(SPECIAL_MATCH_RECOMMENDATION_BONUS).toEqual({
      challenge: 1.5,
      streak_stopper: 0,
      champions: 2,
      revenge: 0,
    });
  });

  it("특수 유형 판정 입력이 없거나 아무도 해당하지 않으면 기존과 같은 결과이고 specialMatch는 모두 null이다", () => {
    const participants = players(10);
    const input = { participants, courts: 2, seed: 7 };
    for (let rank = 0; rank < 5; rank += 1) {
      const withoutSpecial = recommend({ ...input, rank });
      const allGuests = recommend({
        ...input,
        rank,
        specialPlayers: toSpecialPlayers(
          participants,
          { p01: 6 },
          participants.map((participant) => participant.id),
        ),
      });
      expect(allGuests).toEqual(withoutSpecial);
      expect(
        withoutSpecial.courts.every((court) => court.specialMatch === null),
      ).toBe(true);
    }
  });

  it("연승 회원이 있는 코트는 감점을 그대로 두고 연승 저지로 판정해 표시한다", () => {
    const participants = players(4);
    const specialPlayers = toSpecialPlayers(participants, { p02: 5 });
    const input = { participants, courts: 1, specialPlayers };
    const base = basePenaltyByMatchup(input);
    const plan = recommend(input);

    expect(plan.penalty).toBeCloseTo(base.get(matchupKey(plan))!);
    const [court] = plan.courts;
    expect(court.specialMatch).toMatchObject({
      kind: "streak_stopper",
      outcome: null,
    });
    const streakTeam = court.teams.findIndex((team) => team.includes("p02"));
    expect(court.specialMatch?.defendingTeamIndex).toBe(streakTeam);
    expect(court.specialMatch?.protagonistIds[streakTeam]).toBe("p02");
  });

  it("라이벌전이 되는 대진만 감점에서 1.5를 빼고, 후보는 뺀 감점순이다", () => {
    const participants: MatchmakingParticipant[] = [
      { id: "a", doublesRating: 3 },
      { id: "b", doublesRating: 3.02 },
      { id: "c", doublesRating: 4 },
      { id: "d", doublesRating: 4.02 },
    ];
    const specialPlayers = toSpecialPlayers(participants);
    const input = { participants, courts: 1, specialPlayers };
    const base = basePenaltyByMatchup(input);
    const first = recommend(input);
    const penalties: number[] = [];
    for (let rank = 0; rank < first.candidateCount; rank += 1) {
      const plan = recommend({ ...input, rank });
      const [court] = plan.courts;
      // 같은 실력끼리 한 팀(a+b vs c+d)이면 평점 0.05 이내 맞상대가 없다
      const isChallenge = !court.teams.some(
        (team) => team.includes("a") && team.includes("b"),
      );
      expect(court.specialMatch?.kind ?? null).toBe(
        isChallenge ? "challenge" : null,
      );
      expect(plan.penalty).toBeCloseTo(
        base.get(matchupKey(plan))! - (isChallenge ? 1.5 : 0),
      );
      penalties.push(plan.penalty);
    }
    expect(penalties).toEqual([...penalties].sort((a, b) => a - b));
  });

  it("게스트가 낀 코트는 연승 회원이 있어도 특수 유형이 아니다", () => {
    const participants = players(4);
    const plan = recommend({
      participants,
      courts: 1,
      specialPlayers: toSpecialPlayers(participants, { p01: 7 }, ["p04"]),
    });
    expect(plan.courts[0].specialMatch).toBeNull();
    expect(plan.penalty).toBeCloseTo(
      recommend({ participants, courts: 1 }).penalty,
    );
  });

  /** 코트별 판정 결과 */
  const judgeCourts = (
    plan: DoublesRecommendationPlan,
    specialPlayers: Map<string, SpecialMatchCandidatePlayer>,
  ) =>
    plan.courts.map((court) => {
      const [teamA, teamB] = court.teams.map((team) =>
        team.map((id) => specialPlayers.get(id)!),
      );
      return judgeRecommendedSpecialMatch([teamA, teamB]);
    });

  it("여러 코트가 해당해도 특수 유형은 한 코트이고 가산점이 가장 큰 코트(없으면 앞 연승 저지 코트)가 보이며 가산점은 한 번만 뺀다", () => {
    const participants = players(12);
    const specialPlayers = toSpecialPlayers(participants, {
      p01: 5,
      p05: 6,
      p09: 8,
    });
    const input = { participants, courts: 3, seed: 3, specialPlayers };
    const base = basePenaltyByMatchup(input);
    const { candidateCount } = recommend(input);
    for (let rank = 0; rank < candidateCount; rank += 1) {
      const plan = recommend({ ...input, rank });
      const judged = judgeCourts(plan, specialPlayers);
      const bonus = expectedBonus(plan, specialPlayers);
      const specialCourts = plan.courts.filter(
        (court) => court.specialMatch !== null,
      );
      expect(specialCourts).toHaveLength(judged.some(Boolean) ? 1 : 0);
      if (specialCourts[0]?.specialMatch) {
        // 가산점 코트가 있으면 가산점이 가장 큰 앞 코트, 없으면 앞 연승 저지 코트
        const bonuses = judged.map((match) =>
          match ? getSpecialMatchRecommendationBonus(match.kind) : 0,
        );
        const expectedCourt =
          bonus > 0 ? bonuses.indexOf(bonus) : judged.findIndex(Boolean);
        expect(plan.courts[expectedCourt].specialMatch).not.toBeNull();
        expect(
          getSpecialMatchRecommendationBonus(specialCourts[0].specialMatch.kind),
        ).toBe(bonus);
      }
      const basePenalty = base.get(matchupKey(plan));
      if (basePenalty !== undefined) {
        expect(plan.penalty).toBeCloseTo(basePenalty - bonus);
      }
    }
  });

  it("같은 대진에 연승 저지 코트와 최강자전·라이벌전 코트가 함께 있으면 가산점 코트가 표시된다", () => {
    // p01·p02(5연승)·p07(6연승)을 연승 회원으로 두고, 연승 저지 코트와 최강자전·라이벌전 코트가 함께 나오는 대진을 모두 훑는다
    const participants = players(12);
    const specialPlayers = toSpecialPlayers(participants, {
      p01: 5,
      p02: 5,
      p07: 6,
    });
    const input = { participants, courts: 3, seed: 5, specialPlayers };
    const { candidateCount } = recommend(input);
    let mixed = 0;
    for (let rank = 0; rank < candidateCount; rank += 1) {
      const plan = recommend({ ...input, rank });
      const kinds = judgeCourts(plan, specialPlayers).map(
        (match) => match?.kind ?? null,
      );
      if (
        kinds.includes("streak_stopper") &&
        (kinds.includes("champions") || kinds.includes("challenge"))
      ) {
        mixed += 1;
        const shown = plan.courts.findIndex(
          (court) => court.specialMatch !== null,
        );
        expect(kinds[shown]).not.toBe("streak_stopper");
        expect(plan.courts[shown].specialMatch?.kind).toBe(kinds[shown]);
      }
    }
    expect(mixed).toBeGreaterThan(0);
  });

  it("특수 유형 판정 입력이 있어도 같은 입력·같은 seed면 결과가 같다", () => {
    const participants = players(10);
    const input = {
      participants,
      courts: 2,
      seed: 11,
      rank: 2,
      specialPlayers: toSpecialPlayers(participants, { p03: 5 }),
    };
    expect(recommend(input)).toEqual(recommend(input));
  });
});
