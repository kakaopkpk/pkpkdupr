import { describe, expect, it } from "vitest";
import {
  MATCHMAKING_ALL_NR_FALLBACK_RATING,
  MATCHMAKING_SAME_GENDER_COURT_BONUS,
  MATCHMAKING_GUEST_RATING,
  MATCHMAKING_CANDIDATE_PENALTY_MARGIN,
  MATCHMAKING_DEFAULT_COURTS,
  MATCHMAKING_REPEAT_DECAY,
  MATCHMAKING_REROLL_CYCLE,
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
    reroll: 0,
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

/** 대진의 코트 키 목록(팀 순서·팀 안 순서 무시) */
const courtKeys = (plan: DoublesRecommendationPlan): string[] =>
  plan.courts.map((court) =>
    court.teams
      .map((team) => [...team].sort().join("+"))
      .sort()
      .join(" vs "),
  );

/** reroll 0~CYCLE 결과 */
const rerollPlans = (
  input: Partial<RecommendDoublesMatchesInput>,
): DoublesRecommendationPlan[] =>
  Array.from({ length: MATCHMAKING_REROLL_CYCLE + 1 }, (_, reroll) =>
    recommend({ ...input, reroll }),
  );

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
      reroll: 2,
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
    expect(tooFew.reroll).toBe(0);
    expect(tooFew.candidateCount).toBe(0);
  });

  it("오늘 경기 수가 적은 사람은 어떤 seed·reroll에서도 많이 친 사람보다 늦게 뽑히지 않는다(1판 차이 포함)", () => {
    const participants = players(5);
    for (const games of [1, 2]) {
      const completedMatches = gamesFor("p05", games);
      for (let seed = 0; seed < 100; seed += 1) {
        for (const reroll of [0, 1, 3]) {
          const plan = recommend({
            participants,
            completedMatches,
            courts: 1,
            seed,
            reroll,
          });
          expect(plan.restingPlayerIds).toEqual(["p05"]);
        }
      }
    }
  });

  it("오늘 경기 수가 같은 사람끼리만 reroll에 따라 쉬는 사람이 바뀐다", () => {
    // 10명 2코트. p09·p10만 1판을 쳐서 0판 8명이 늘 뽑힌다
    const completedMatches = [...gamesFor("p09", 1), ...gamesFor("p10", 1)];
    for (const plan of rerollPlans({
      participants: players(10),
      completedMatches,
      courts: 2,
    })) {
      expect(plan.restingPlayerIds).toEqual(["p09", "p10"]);
    }
    // 9명이 모두 0판이면 경계 동점자 중 누가 쉴지가 reroll마다 바뀐다
    const resting = new Set(
      rerollPlans({ participants: players(9), courts: 2 }).map((plan) =>
        plan.restingPlayerIds.join(","),
      ),
    );
    expect(resting.size).toBeGreaterThan(1);
  });

  it("오늘 경기 수가 같은 사람끼리의 선발 순서는 seed에 따라 바뀐다", () => {
    const resting = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      resting.add(
        recommend({ participants: players(5), courts: 1, seed }).restingPlayerIds[0],
      );
    }
    expect(resting.size).toBeGreaterThan(1);
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

  it("reroll 0은 여유폭 안 후보 중 감점이 가장 낮은 대진이다", () => {
    // 4명 1코트는 팀 나누기가 3가지뿐이다. a+b vs c+d(15점)만 여유폭 안이고 나머지 둘은 60점이다
    const participants = [
      { id: "a", doublesRating: 5 },
      { id: "b", doublesRating: 2 },
      { id: "c", doublesRating: 3.5 },
      { id: "d", doublesRating: 3.5 },
    ];
    for (let seed = 0; seed < 20; seed += 1) {
      const plan = recommend({ participants, courts: 1, seed });
      expect(plan.reroll).toBe(0);
      expect(plan.penalty).toBeCloseTo(15);
      expect(plan.candidateCount).toBe(1);
    }
  });

  it("다시 추천은 직전 대진과 다르고, 여유폭 안 후보에서만 고른다", () => {
    const completedMatches: MatchmakingPlayedMatch[] = [
      { teams: [["p01", "p02"], ["p03", "p04"]] },
      { teams: [["p05", "p06"], ["p07", "p08"]] },
    ];
    for (const seed of [1, 2]) {
      const plans = rerollPlans({
        participants: players(12),
        completedMatches,
        courts: 3,
        seed,
      });
      const best = plans[0].penalty;
      for (let reroll = 1; reroll < plans.length; reroll += 1) {
        const plan = plans[reroll];
        expect(plan.reroll).toBe(reroll);
        expect(plan.candidateCount).toBeGreaterThan(1);
        expect(matchupKey(plan)).not.toBe(matchupKey(plans[reroll - 1]));
        // 12명 3코트는 선발이 늘 같아 단계마다 최저 감점도 같다
        expect(plan.penalty).toBeLessThanOrEqual(
          best + MATCHMAKING_CANDIDATE_PENALTY_MARGIN + 1e-9,
        );
      }
    }
  });

  it("다시 추천은 직전 대진과 같은 코트가 가장 적은 후보를 고른다", () => {
    // 평점이 모두 같고 오늘 기록이 없으면 모든 대진의 감점이 0이라 직전 대진과 겹치는 코트가 없는 후보가 늘 있다
    const participants = Array.from({ length: 12 }, (_, index) => ({
      id: `p${index}`,
      doublesRating: 3,
    }));
    const plans = rerollPlans({ participants, courts: 3 });
    for (let reroll = 1; reroll < plans.length; reroll += 1) {
      const previous = new Set(courtKeys(plans[reroll - 1]));
      expect(courtKeys(plans[reroll]).filter((key) => previous.has(key))).toEqual(
        [],
      );
    }
  });

  it("여유폭 안 후보가 직전 대진 하나뿐이면 같은 대진을 돌려주고 여유폭 밖으로 가지 않는다", () => {
    const participants = [
      { id: "a", doublesRating: 5 },
      { id: "b", doublesRating: 2 },
      { id: "c", doublesRating: 3.5 },
      { id: "d", doublesRating: 3.5 },
    ];
    const plans = rerollPlans({ participants, courts: 1 });
    for (const plan of plans) {
      expect(plan.candidateCount).toBe(1);
      expect(plan.penalty).toBeCloseTo(15);
      expect(matchupKey(plan)).toBe(matchupKey(plans[0]));
    }
  });

  it("candidateCount는 여유폭 안 대진 수이고 최소 개수를 채우지 않는다", () => {
    // players(4)는 2.25점·6.75점·11.25점 대진이고 앞의 둘만 여유폭 안이다
    const plan = recommend({ participants: players(4), courts: 1 });
    expect(plan.penalty).toBeCloseTo(2.25);
    expect(plan.candidateCount).toBe(2);

    const next = recommend({ participants: players(4), courts: 1, reroll: 1 });
    expect(next.penalty).toBeCloseTo(6.75);
    expect(next.candidateCount).toBe(2);
  });

  it("reroll이 CYCLE을 넘으면 ((reroll - 1) mod CYCLE) + 1과 같다", () => {
    const input = { participants: players(10), courts: 2, seed: 9 };
    for (const reroll of [11, 12, 20, 21, 1_000_000]) {
      const expected = ((reroll - 1) % MATCHMAKING_REROLL_CYCLE) + 1;
      const plan = recommend({ ...input, reroll });
      expect(plan.reroll).toBe(expected);
      expect(plan).toEqual(recommend({ ...input, reroll: expected }));
    }
  });

  it("탐색 seed는 세션과 완료 경기 수가 같으면 같고, 경기가 끝나면 바뀐다", () => {
    expect(getMatchmakingSeed("Sabc", 3)).toBe(getMatchmakingSeed("Sabc", 3));
    expect(getMatchmakingSeed("Sabc", 4)).not.toBe(getMatchmakingSeed("Sabc", 3));
    expect(getMatchmakingSeed("Sxyz", 3)).not.toBe(getMatchmakingSeed("Sabc", 3));
    expect(Number.isInteger(getMatchmakingSeed("Sabc", 0))).toBe(true);
  });

  it("reroll이 음수·NaN·Infinity면 0, 소수면 내린다", () => {
    const participants = players(8);
    const at = (reroll: number) =>
      recommend({ participants, courts: 2, reroll });
    expect(at(-3)).toEqual(at(0));
    expect(at(Number.NaN)).toEqual(at(0));
    expect(at(Number.POSITIVE_INFINITY)).toEqual(at(0));
    expect(at(1.9)).toEqual(at(1));
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
            gender: participant.gender ?? null,
          },
        ];
      }),
    );
  };

  /** seed 0~14의 reroll 0~2 결과 중 대진이 서로 다른 것 */
  const distinctPlans = (
    input: Partial<RecommendDoublesMatchesInput>,
  ): DoublesRecommendationPlan[] => {
    const byMatchup = new Map<string, DoublesRecommendationPlan>();
    for (let seed = 0; seed < 15; seed += 1) {
      for (const plan of [0, 1, 2].map((reroll) =>
        recommend({ ...input, seed, reroll }),
      )) {
        if (!byMatchup.has(matchupKey(plan))) {
          byMatchup.set(matchupKey(plan), plan);
        }
      }
    }
    return [...byMatchup.values()];
  };

  /** 가산점 없이 계산한 대진별 감점 */
  const basePenaltyByMatchup = (
    input: Partial<RecommendDoublesMatchesInput>,
  ): Map<string, number> =>
    new Map(
      distinctPlans({ ...input, specialPlayers: undefined }).map((plan) => [
        matchupKey(plan),
        plan.penalty,
      ]),
    );

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

  it("유형별 가산점은 최강자전 2, 라이벌전 1.5, 연승 매치·리벤지·도전 매치 0이다", () => {
    expect(getSpecialMatchRecommendationBonus("champions")).toBe(2);
    expect(getSpecialMatchRecommendationBonus("rival")).toBe(1.5);
    expect(getSpecialMatchRecommendationBonus("streak_stopper")).toBe(0);
    expect(getSpecialMatchRecommendationBonus("revenge")).toBe(0);
    expect(SPECIAL_MATCH_RECOMMENDATION_BONUS).toEqual({
      rival: 1.5,
      streak_stopper: 0,
      champions: 2,
      revenge: 0,
      challenge: 0,
      men_doubles: 0,
      women_doubles: 0,
    });
  });

  it("특수 유형 판정 입력이 없거나 아무도 해당하지 않으면 기존과 같은 결과이고 specialMatch는 모두 null이다", () => {
    const participants = players(10);
    const input = { participants, courts: 2, seed: 7 };
    for (let reroll = 0; reroll < 5; reroll += 1) {
      const withoutSpecial = recommend({ ...input, reroll });
      const allGuests = recommend({
        ...input,
        reroll,
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

  it("연승 회원이 있는 코트는 감점을 그대로 두고 연승 매치로 판정해 표시한다", () => {
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

  it("라이벌전이 되는 대진만 감점에서 1.5를 빼고, 후보는 뺀 감점 기준이다", () => {
    const participants: MatchmakingParticipant[] = [
      { id: "a", doublesRating: 3 },
      { id: "b", doublesRating: 3.02 },
      { id: "c", doublesRating: 4 },
      { id: "d", doublesRating: 4.02 },
    ];
    const specialPlayers = toSpecialPlayers(participants);
    const input = { participants, courts: 1, specialPlayers };
    const base = basePenaltyByMatchup(input);
    // a+d vs b+c(5.1 - 1.5), a+c vs b+d(5.4 - 1.5)만 여유폭 안이고 a+b vs c+d(34.8)는 밖이다
    const plans = rerollPlans(input);
    expect(plans[0].penalty).toBeCloseTo(3.6);
    for (const plan of plans) {
      expect(plan.candidateCount).toBe(2);
      const [court] = plan.courts;
      // 같은 실력끼리 한 팀(a+b vs c+d)이면 평점 0.05 이내 맞상대가 없다
      const isRival = !court.teams.some(
        (team) => team.includes("a") && team.includes("b"),
      );
      expect(court.specialMatch?.kind ?? null).toBe(
        isRival ? "rival" : null,
      );
      expect(plan.penalty).toBeCloseTo(
        base.get(matchupKey(plan))! - (isRival ? 1.5 : 0),
      );
    }
  });

  it("게스트가 낀 코트도 연승 회원이 있으면 연승 매치다", () => {
    const participants = players(4);
    const plan = recommend({
      participants,
      courts: 1,
      specialPlayers: toSpecialPlayers(participants, { p01: 7 }, ["p04"]),
    });
    expect(plan.courts[0].specialMatch).toMatchObject({
      kind: "streak_stopper",
      protagonistIds: expect.arrayContaining(["p01"]),
    });
    // 연승 매치 가산점은 0이다
    expect(plan.penalty).toBeCloseTo(
      recommend({ participants, courts: 1 }).penalty,
    );
  });

  it("게스트가 낀 코트는 라이벌전이 아니다", () => {
    const participants: MatchmakingParticipant[] = [
      { id: "a", doublesRating: 3 },
      { id: "b", doublesRating: 3.02 },
      { id: "c", doublesRating: 4 },
      { id: "g", doublesRating: 4.02, isGuest: true },
    ];
    const specialPlayers = toSpecialPlayers(participants, {}, ["g"]);
    const input = { participants, courts: 1, specialPlayers };
    const first = recommend(input);
    for (const plan of rerollPlans(input)) {
      expect(plan.courts[0].specialMatch).toBeNull();
    }
    expect(first.penalty).toBeCloseTo(
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

  it("여러 코트가 해당하면 코트마다 판정한 유형이 보이고 가산점은 가장 큰 코트 하나만 뺀다", () => {
    const participants = players(12);
    const specialPlayers = toSpecialPlayers(participants, {
      p01: 5,
      p05: 6,
      p09: 8,
    });
    const input = { participants, courts: 3, seed: 3, specialPlayers };
    const base = basePenaltyByMatchup(input);
    let multiple = 0;
    for (const plan of distinctPlans(input)) {
      const judged = judgeCourts(plan, specialPlayers);
      const bonus = expectedBonus(plan, specialPlayers);
      expect(plan.courts.map((court) => court.specialMatch)).toEqual(judged);
      if (judged.filter(Boolean).length > 1) multiple += 1;
      const basePenalty = base.get(matchupKey(plan));
      if (basePenalty !== undefined) {
        expect(plan.penalty).toBeCloseTo(basePenalty - bonus);
      }
    }
    expect(multiple).toBeGreaterThan(0);
  });

  it("오늘 같은 두 팀이 붙었던 코트는 리벤지로 보이고, 가장 최근 그 경기에서 이긴 팀이 지킨다", () => {
    // a·b와 c·d 팀만 평균이 같아(다른 나누기는 평균 차 1 이상) 반복 감점이 있어도 같은 대진을 고른다
    const participants: MatchmakingParticipant[] = [
      { id: "a", doublesRating: 5 },
      { id: "b", doublesRating: 1 },
      { id: "c", doublesRating: 4 },
      { id: "d", doublesRating: 2 },
    ];
    const plan = recommend({
      participants,
      courts: 1,
      specialPlayers: toSpecialPlayers(participants),
      completedMatches: [
        {
          teams: [
            ["c", "d"],
            ["a", "b"],
          ],
          winningTeamIndex: 0,
        },
      ],
    });
    const court = plan.courts[0];
    expect(court.teams.map((team) => [...team].sort())).toEqual(
      expect.arrayContaining([
        ["a", "b"],
        ["c", "d"],
      ]),
    );
    expect(court.specialMatch?.kind).toBe("revenge");
    expect(
      [...court.teams[court.specialMatch!.defendingTeamIndex!]].sort(),
    ).toEqual(["c", "d"]);
  });

  it("특수 유형 판정 입력이 있어도 같은 입력·같은 seed면 결과가 같다", () => {
    const participants = players(10);
    const input = {
      participants,
      courts: 2,
      seed: 11,
      reroll: 2,
      specialPlayers: toSpecialPlayers(participants, { p03: 5 }),
    };
    expect(recommend(input)).toEqual(recommend(input));
  });
});

describe("recommendDoublesMatches 남복·여복", () => {
  /** 평점이 모두 같은 남녀 참여자. 평점 차 감점이 없어 성별 가산점만 대진을 가른다 */
  const genderedPlayers = (
    genders: readonly ("M" | "F" | null)[],
  ): MatchmakingParticipant[] =>
    genders.map((gender, index) => ({
      id: `g${String(index + 1).padStart(2, "0")}`,
      doublesRating: 3,
      gender,
    }));

  const courtGenders = (
    plan: DoublesRecommendationPlan,
    participants: MatchmakingParticipant[],
  ) => {
    const genderOf = new Map(participants.map((p) => [p.id, p.gender]));
    return plan.courts.map((court) =>
      court.teams.flat().map((id) => genderOf.get(id)),
    );
  };

  /** 랭킹·연승 없는 판정 입력(성별만) */
  const genderSpecialPlayers = (
    participants: MatchmakingParticipant[],
    winStreaks: Record<string, number> = {},
  ): Map<string, SpecialMatchCandidatePlayer> =>
    new Map(
      participants.map((p) => [
        p.id,
        {
          id: p.id,
          isGuest: false,
          rank: null,
          rating: null,
          winStreak: winStreaks[p.id] ?? 0,
          gender: p.gender ?? null,
        },
      ]),
    );

  it("가산점은 남복·여복 코트마다 2를 빼고 성별이 섞인 코트는 0이다", () => {
    const participants = genderedPlayers(["M", "M", "M", "M", "F", "F", "F", "F"]);
    const plan = recommend({ participants, courts: 2 });
    for (const genders of courtGenders(plan, participants)) {
      expect(new Set(genders).size).toBe(1);
    }
    expect(plan.penalty).toBeCloseTo(-2 * MATCHMAKING_SAME_GENDER_COURT_BONUS);
  });

  it("성별 없는 게스트가 낀 코트는 남복·여복 가산점이 없다", () => {
    const participants = genderedPlayers(["F", "F", "F", null]);
    expect(recommend({ participants, courts: 1 }).penalty).toBeCloseTo(0);
  });

  it("남복·여복 코트는 코트마다 남복·여복 매치로 보인다", () => {
    const participants = genderedPlayers(["M", "M", "M", "M", "F", "F", "F", "F"]);
    const plan = recommend({
      participants,
      courts: 2,
      specialPlayers: genderSpecialPlayers(participants),
    });
    const genders = courtGenders(plan, participants);
    plan.courts.forEach((court, index) => {
      expect(court.specialMatch?.kind).toBe(
        genders[index][0] === "M" ? "men_doubles" : "women_doubles",
      );
      expect(court.specialMatch).toMatchObject({
        defendingTeamIndex: null,
        protagonistIds: [null, null],
        rivalPairs: [],
        outcome: null,
      });
    });
  });

  it("연승 매치 코트와 남복·여복 코트가 함께 보인다", () => {
    const participants = genderedPlayers(["M", "M", "M", "M", "F", "F", "F", "F"]);
    const plan = recommend({
      participants,
      courts: 2,
      specialPlayers: genderSpecialPlayers(participants, { g08: 4 }),
    });
    const streakCourt = plan.courts.find((court) => court.teams.flat().includes("g08"));
    const otherCourt = plan.courts.find((court) => !court.teams.flat().includes("g08"));
    expect(streakCourt?.specialMatch?.kind).toBe("streak_stopper");
    expect(otherCourt?.specialMatch?.kind).toMatch(/^(men|women)_doubles$/);
  });
});

describe("recommendDoublesMatches 같은 팀·맞대결 감쇠", () => {
  // a+b vs c+d만 팀 평균이 같고(코트 평점 폭 3.0 → 15점) 나머지 팀 나누기는 60점이라 a·b가 늘 한 팀이다
  const lopsided: MatchmakingParticipant[] = [
    { id: "a", doublesRating: 5 },
    { id: "b", doublesRating: 2 },
    { id: "c", doublesRating: 3.5 },
    { id: "d", doublesRating: 3.5 },
  ];

  it("같은 쌍의 지난 경기는 그 뒤 경기 수만큼 0.5씩 줄여 더한다", () => {
    expect(MATCHMAKING_REPEAT_DECAY).toBe(0.5);
    const participants = ["a", "b", "c", "d"].map((id) => ({
      id,
      doublesRating: 4,
    }));
    const plan = recommend({
      participants,
      completedMatches: [
        { teams: [["a", "b"], ["c", "d"]] },
        { teams: [["a", "b"], ["c", "d"]] },
      ],
      courts: 1,
    });
    // a+c vs b+d: 맞대결 반복 a–d·c–b가 각각 직전 1 + 그 전 0.5 = 1.5 → 2쌍 × 1.5 × 3 = 9점(누적이면 12점)
    expect(plan.penalty).toBeCloseTo(9);
    expect(plan.courts[0].repeatedPartnerPairs).toEqual([]);
    expect(plan.courts[0].repeatedOpponentPairs).toHaveLength(2);
  });

  it("경과는 두 사람 중 그 뒤에 덜 뛴 사람 기준이다", () => {
    // a·b가 같은 팀이었던 뒤 a만 2경기 더 뛰었다. b에게는 방금 일이라 가중치 1(6점)
    const bRested = recommend({
      participants: lopsided,
      completedMatches: [
        { teams: [["a", "b"], ["x", "y"]] },
        { teams: [["a", "e"], ["z", "w"]] },
        { teams: [["a", "f"], ["u", "v"]] },
      ],
      courts: 1,
    });
    expect(bRested.penalty).toBeCloseTo(15 + 6);
    expect(
      bRested.courts[0].repeatedPartnerPairs.map((pair) => [...pair].sort()),
    ).toEqual([["a", "b"]]);

    // 둘 다 2경기 더 뛰었으면 0.25(1.5점). 오래된 반복도 repeatedPartnerPairs에는 그대로 보인다
    const bothPlayed = recommend({
      participants: lopsided,
      completedMatches: [
        { teams: [["a", "b"], ["x", "y"]] },
        { teams: [["a", "e"], ["b", "z"]] },
        { teams: [["a", "f"], ["b", "w"]] },
      ],
      courts: 1,
    });
    expect(bothPlayed.penalty).toBeCloseTo(15 + 1.5);
    expect(
      bothPlayed.courts[0].repeatedPartnerPairs.map((pair) => [...pair].sort()),
    ).toEqual([["a", "b"]]);
  });

  it("완료 경기 순서로 경과를 센다", () => {
    // 같은 경기들이라도 a·b가 함께한 경기가 마지막이면 방금 일이다
    const plan = recommend({
      participants: lopsided,
      completedMatches: [
        { teams: [["a", "e"], ["b", "z"]] },
        { teams: [["a", "f"], ["b", "w"]] },
        { teams: [["a", "b"], ["x", "y"]] },
      ],
      courts: 1,
    });
    expect(plan.penalty).toBeCloseTo(15 + 6);
  });

  it("세션이 길어져도 반복 회피가 팀 평균 균형을 크게 깨지 않는다", () => {
    // 2.5 넷을 섞으면 한 코트는 팀 평균 차 0.5가 생기는 구성. 반복을 누적으로 세면 후반에 1.0 차 대진을 고른다
    const ratings = [2.5, 2.5, 2.5, 2.5, 3, 3.5, 3.5, 4];
    const participants = ratings.map((doublesRating, index) => ({
      id: `p${index}`,
      doublesRating,
    }));
    const completedMatches: MatchmakingPlayedMatch[] = [];
    let maxGap = 0;
    for (let round = 0; round < 12; round += 1) {
      const plan = recommend({
        participants,
        completedMatches,
        courts: 2,
        seed: getMatchmakingSeed("session", completedMatches.length),
      });
      for (const court of plan.courts) {
        maxGap = Math.max(
          maxGap,
          Math.abs(court.teamAverages[0] - court.teamAverages[1]),
        );
        completedMatches.push({
          teams: [[...court.teams[0]], [...court.teams[1]]],
        });
      }
    }
    expect(maxGap).toBeLessThanOrEqual(0.5 + 1e-9);
  });
});
