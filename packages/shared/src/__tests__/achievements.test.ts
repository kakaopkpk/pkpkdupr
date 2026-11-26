import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATEGORY_LABEL,
  ACHIEVEMENT_MAX_POINTS,
  ACHIEVEMENTS,
  computeAchievements,
  findNewAchievements,
  findUnseenAchievements,
  getAchievementPoints,
  isBestStreakAchievement,
  isLowRatingAchievement,
  isRatingAchievement,
  RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES,
  RULES_GUIDE_ACHIEVEMENT_ID,
  sumAchievementPoints,
  toEarnedAchievements,
  type AchievementMatch,
  type AchievementProgress,
  type EarnedAchievement,
  type EndedSessions,
} from "../achievements";
import { ACHIEVEMENT_COUNT_START } from "../achievementCountStart";
import { kstDateKeyTimeToDate } from "../session";
import type { MatchStatus, MatchType } from "../match";

const ME = "player-me";
const BASE_MS = Date.parse("2026-12-01T00:00:00.000Z");

let sequence = 0;

/** 나는 항상 0번 팀이다. won이면 11:5, 아니면 5:11 */
const makeMatch = ({
  won = true,
  scoreA,
  scoreB,
  partnerId,
  opponentIds,
  type,
  sessionId,
  regular,
  tournament,
  ratingBefore,
  status = "completed",
  completedAt,
}: {
  won?: boolean;
  scoreA?: number;
  scoreB?: number;
  partnerId?: string;
  /** 기본은 복식 opp-1·opp-2, 단식 opp-1 */
  opponentIds?: string[];
  type?: MatchType;
  sessionId?: string;
  /** 정기 세션 경기 */
  regular?: boolean;
  /** 대회 세션 경기 */
  tournament?: boolean;
  ratingBefore?: Record<string, number | null>;
  status?: MatchStatus;
  completedAt?: Date | null;
} = {}): AchievementMatch => {
  sequence += 1;
  const doubles = partnerId !== undefined;
  const myTeam =
    partnerId !== undefined ? [{ id: ME }, { id: partnerId }] : [{ id: ME }];
  return {
    id: `match-${String(sequence).padStart(4, "0")}`,
    type: type ?? (doubles ? "mixed-doubles" : "singles"),
    status,
    completedAt:
      completedAt === undefined
        ? new Date(BASE_MS + sequence * 60_000)
        : completedAt,
    teams: [
      { players: myTeam },
      {
        players: (
          opponentIds ?? (doubles ? ["opp-1", "opp-2"] : ["opp-1"])
        ).map((id) => ({
          id,
        })),
      },
    ],
    scores: [
      {
        scoreA: scoreA ?? (won ? 11 : 5),
        scoreB: scoreB ?? (won ? 5 : 11),
      },
    ],
    session: sessionId ? { id: sessionId, regular, tournament } : null,
    ratingBefore,
  };
};

/** 내가 뛰지 않은 경기. winner 팀이 11:5로 이긴다 */
const makeOthersMatch = ({
  teamA,
  teamB,
  winner = 0,
  sessionId,
  regular,
}: {
  teamA: string[];
  teamB: string[];
  winner?: 0 | 1;
  sessionId?: string;
  regular?: boolean;
}): AchievementMatch => {
  sequence += 1;
  return {
    id: `match-${String(sequence).padStart(4, "0")}`,
    type: teamA.length > 1 ? "mixed-doubles" : "singles",
    status: "completed",
    completedAt: new Date(BASE_MS + sequence * 60_000),
    teams: [
      { players: teamA.map((id) => ({ id })) },
      { players: teamB.map((id) => ({ id })) },
    ],
    scores: [
      winner === 0 ? { scoreA: 11, scoreB: 5 } : { scoreA: 5, scoreB: 11 },
    ],
    session: sessionId ? { id: sessionId, regular } : null,
  };
};

const repeat = (count: number, build: () => AchievementMatch) =>
  Array.from({ length: count }, build);

const progressOf = (
  progress: AchievementProgress[],
  id: string,
): AchievementProgress => {
  const item = progress.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`업적 ${id}가 없습니다.`);
  return item;
};

const compute = (matches: AchievementMatch[]) =>
  computeAchievements(ME, matches);

/** 만료된 세션 id로 업적 계산 입력을 만든다. dominatedSessionIds 세션은 내가 지배자다 */
const endedSessions = (
  endedSessionIds: string[],
  dominatedSessionIds: string[] = [],
): EndedSessions =>
  new Map([
    ...endedSessionIds.map((id) => [id, null] as const),
    ...dominatedSessionIds.map((id) => [id, ME] as const),
  ]);

describe("ACHIEVEMENTS", () => {
  it("업적 57개를 표 순서로 정의한다", () => {
    expect(ACHIEVEMENTS.map((definition) => definition.id)).toEqual([
      "rules-guide",
      "matches-1",
      "matches-10",
      "matches-50",
      "matches-100",
      "matches-300",
      "matches-1000",
      "wins-1",
      "wins-10",
      "wins-50",
      "wins-100",
      "wins-500",
      "wins-1000",
      "singles-wins-1",
      "singles-wins-10",
      "streak-3",
      "streak-5",
      "streak-10",
      "streak-20",
      "streak-breaker",
      "streak-breaker-10",
      "rating-3.0",
      "rating-3.5",
      "rating-4.0",
      "rating-4.5",
      "rating-low-2.5",
      "rating-low-2.0",
      "perfect-win",
      "hard-won",
      "deuce-master",
      "partner-20",
      "partner-50",
      "combo-5",
      "social-10",
      "welcome",
      "rival-20",
      "nemesis-10",
      "dojo-15",
      "underdog",
      "revenge",
      "revenge-10",
      "attendance-10",
      "attendance-30",
      "attendance-100",
      "regular-streak-8",
      "iron-8",
      "unbeaten-session",
      "dominator-1",
      "dominator-10",
      "dominator-25",
      "dominator-50",
      "praised-1",
      "praised-10",
      "tournament-entry",
      "tournament-podium",
      "tournament-champion-1",
      "tournament-champion-3",
    ]);
    expect(new Set(ACHIEVEMENTS.map((item) => item.id)).size).toBe(57);
  });

  it("분류 이름은 입문·경기 수·승리·연승·평점·특별·세션·대회다", () => {
    expect(ACHIEVEMENT_CATEGORY_LABEL).toEqual({
      intro: "입문",
      matches: "경기 수",
      wins: "승리",
      streak: "연승",
      rating: "평점",
      special: "특별",
      session: "세션",
      tournament: "대회",
    });
  });
});

describe("isBestStreakAchievement", () => {
  it("연승·환상의 콤비·개근상만 최고 연속 기록 업적이다", () => {
    expect(
      ACHIEVEMENTS.filter((definition) =>
        isBestStreakAchievement(definition.id),
      ).map((definition) => definition.id),
    ).toEqual([
      "streak-3",
      "streak-5",
      "streak-10",
      "streak-20",
      "combo-5",
      "regular-streak-8",
    ]);
  });
});

describe("computeAchievements", () => {
  it("경기가 없으면 57개 모두 진행도 0으로 받지 않은 상태다", () => {
    const progress = compute([]);
    expect(progress).toHaveLength(57);
    expect(progress.map((item) => item.id)).toEqual(
      ACHIEVEMENTS.map((definition) => definition.id),
    );
    for (const item of progress) {
      expect(item).toMatchObject({
        earned: false,
        earnedAt: null,
        earnedMatchId: null,
        current: 0,
      });
      expect(item.target).toBe(
        ACHIEVEMENTS.find((definition) => definition.id === item.id)?.target,
      );
    }
  });

  it("게스트가 낀 경기(평점 미반영)도 경기 수·승 수·연승에 센다", () => {
    const matches = repeat(3, () => ({
      ...makeMatch({ partnerId: "guest" }),
      ratingExcluded: true,
    }));
    const progress = compute(matches);
    expect(progressOf(progress, "matches-1")).toMatchObject({
      earned: true,
      earnedMatchId: matches[0].id,
    });
    expect(progressOf(progress, "wins-1").earned).toBe(true);
    expect(progressOf(progress, "streak-3")).toMatchObject({
      earned: true,
      earnedMatchId: matches[2].id,
    });
  });

  it.each([
    ["matches-1", 1],
    ["matches-10", 10],
    ["matches-50", 50],
    ["matches-100", 100],
    ["matches-300", 300],
    ["matches-1000", 1000],
  ])("%s는 경기 %i개 완료에서 받는다(단식+복식, 승패 무관)", (id, target) => {
    // 단식 진 경기와 복식 진 경기를 번갈아 넣어 분류·승패와 무관함을 확인한다.
    const build = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        makeMatch({
          won: false,
          partnerId: index % 2 ? `partner-${index}` : undefined,
        }),
      );

    const below = build(target - 1);
    expect(progressOf(compute(below), id)).toMatchObject({
      earned: false,
      current: target - 1,
    });

    const reached = build(target);
    const last = reached[target - 1];
    expect(progressOf(compute(reached), id)).toEqual({
      id,
      earned: true,
      earnedAt: last.completedAt,
      earnedMatchId: last.id,
      current: target,
      target,
    });
  });

  it.each([
    ["wins-1", 1],
    ["wins-10", 10],
    ["wins-50", 50],
    ["wins-100", 100],
    ["wins-500", 500],
    ["wins-1000", 1000],
  ])("%s는 이긴 경기 %i개에서 받는다", (id, target) => {
    // 진 경기를 사이사이 넣어도 승리 수만 센다.
    const build = (wins: number) =>
      Array.from({ length: wins }, (_, index) => [
        makeMatch({ won: false, partnerId: index % 2 ? "p" : undefined }),
        makeMatch({ won: true, partnerId: index % 2 ? "p" : undefined }),
      ]).flat();

    expect(progressOf(compute(build(target - 1)), id)).toMatchObject({
      earned: false,
      current: target - 1,
    });

    const reached = build(target);
    expect(progressOf(compute(reached), id)).toMatchObject({
      earned: true,
      earnedMatchId: reached.at(-1)?.id,
      current: target,
    });
  });

  it.each([
    ["streak-3", 3],
    ["streak-5", 5],
    ["streak-10", 10],
    ["streak-20", 20],
  ])("%s는 %i연승에서 받는다", (id, target) => {
    const below = [
      ...repeat(target - 1, () => makeMatch({ won: true })),
      makeMatch({ won: false }),
      ...repeat(target - 1, () => makeMatch({ won: true })),
    ];
    expect(progressOf(compute(below), id)).toMatchObject({
      earned: false,
      current: target - 1,
    });

    const reached = repeat(target, () => makeMatch({ won: true }));
    expect(progressOf(compute(reached), id)).toMatchObject({
      earned: true,
      earnedMatchId: reached.at(-1)?.id,
      current: target,
    });
  });

  it("연승은 진 경기에서 끊기고 진행도는 지금까지 최고 연승이다", () => {
    const matches = [
      ...repeat(2, () => makeMatch({ won: true })),
      makeMatch({ won: false }),
      ...repeat(5, () => makeMatch({ won: true })),
      makeMatch({ won: false }),
      makeMatch({ won: true }),
    ];
    const progress = compute(matches);
    expect(progressOf(progress, "streak-3")).toMatchObject({
      earned: true,
      // 첫 두 연승 뒤 끊겼으므로 두 번째 연승의 세 번째 경기(index 5)에서 받는다.
      earnedMatchId: matches[5].id,
      current: 5,
    });
    expect(progressOf(progress, "streak-5")).toMatchObject({
      earned: true,
      earnedMatchId: matches[7].id,
      current: 5,
    });
    expect(progressOf(progress, "streak-10")).toMatchObject({
      earned: false,
      current: 5,
    });
  });

  it("연승은 입력 순서가 아니라 완료 시각 순으로 센다", () => {
    const win1 = makeMatch({ won: true });
    const loss = makeMatch({ won: false });
    const win2 = makeMatch({ won: true });
    const win3 = makeMatch({ won: true });
    // 시간순으로는 승·패·승·승이라 최고 2연승이다.
    expect(
      progressOf(compute([win3, win1, win2, loss]), "streak-3"),
    ).toMatchObject({ earned: false, current: 2 });
  });

  it("퍼펙트 승리는 상대가 0점일 때 이긴 경기에서 받는다", () => {
    const notPerfect = [
      makeMatch({ won: true, scoreA: 11, scoreB: 1 }),
      // 내가 0점으로 진 경기는 퍼펙트 승리가 아니다.
      makeMatch({ won: false, scoreA: 0, scoreB: 11 }),
    ];
    expect(progressOf(compute(notPerfect), "perfect-win")).toMatchObject({
      earned: false,
      current: 0,
    });

    const perfect = makeMatch({ won: true, scoreA: 11, scoreB: 0 });
    expect(
      progressOf(compute([...notPerfect, perfect]), "perfect-win"),
    ).toMatchObject({
      earned: true,
      earnedMatchId: perfect.id,
      current: 1,
    });
  });

  it("듀스 승부사는 양 팀 10점 이상 경기에서 10번 이기면 받는다", () => {
    const hardWin = () => makeMatch({ won: true, scoreA: 12, scoreB: 10 });
    const noise = [
      // 상대가 9점이면 해당하지 않는다.
      makeMatch({ won: true, scoreA: 11, scoreB: 9 }),
      // 양 팀 10점 이상이어도 진 경기는 세지 않는다.
      makeMatch({ won: false, scoreA: 10, scoreB: 12 }),
    ];

    const below = [...noise, ...repeat(9, hardWin)];
    expect(progressOf(compute(below), "deuce-master")).toMatchObject({
      earned: false,
      current: 9,
    });

    const tenth = hardWin();
    expect(
      progressOf(compute([...below, tenth]), "deuce-master"),
    ).toMatchObject({
      earned: true,
      earnedMatchId: tenth.id,
      current: 10,
    });
  });

  it("힘겹게 쟁취한 승리는 듀스 끝에 15:14로 이긴 경기에서 받는다", () => {
    const notHardWon = [
      // 듀스 승리지만 15점 상한까지 가지 않았다.
      makeMatch({ won: true, scoreA: 14, scoreB: 12 }),
      // 15점을 냈어도 14점 상대가 아니면 듀스 상한 승리가 아니다.
      makeMatch({ won: true, scoreA: 15, scoreB: 7 }),
      makeMatch({ won: true, scoreA: 15, scoreB: 13 }),
      makeMatch({ won: true, scoreA: 16, scoreB: 14 }),
      // 15:14여도 진 경기는 세지 않는다.
      makeMatch({ won: false, scoreA: 14, scoreB: 15 }),
    ];
    expect(progressOf(compute(notHardWon), "hard-won")).toMatchObject({
      earned: false,
      current: 0,
    });

    const hardWon = makeMatch({ won: true, scoreA: 15, scoreB: 14 });
    expect(
      progressOf(compute([...notHardWon, hardWon]), "hard-won"),
    ).toMatchObject({ earned: true, earnedMatchId: hardWon.id, current: 1 });
  });

  it("단짝은 같은 파트너와 복식 20경기에서 받고 진행도는 한 파트너 최대 경기 수다", () => {
    const withA = () => makeMatch({ won: false, partnerId: "partner-a" });
    const others = [
      ...repeat(10, () => makeMatch({ won: true, partnerId: "partner-b" })),
      // 단식은 파트너가 없어 세지 않는다.
      ...repeat(5, () => makeMatch({ won: true })),
    ];

    const below = [...others, ...repeat(19, withA)];
    expect(progressOf(compute(below), "partner-20")).toMatchObject({
      earned: false,
      current: 19,
    });

    const twentieth = withA();
    expect(
      progressOf(compute([...below, twentieth]), "partner-20"),
    ).toMatchObject({
      earned: true,
      earnedMatchId: twentieth.id,
      current: 20,
    });
  });

  it.each([
    ["attendance-10", 10],
    ["attendance-30", 30],
    ["attendance-100", 100],
  ])("%s는 경기를 1개 이상 한 서로 다른 세션 %i개에서 받는다", (id, target) => {
    const build = (sessionCount: number) =>
      Array.from({ length: sessionCount }, (_, index) => [
        makeMatch({ won: false, sessionId: `session-${index}` }),
        // 같은 세션의 두 번째 경기는 개근 수를 늘리지 않는다.
        makeMatch({ won: true, sessionId: `session-${index}` }),
      ]).flat();
    // 세션 없는 경기는 개근에 세지 않는다.
    const outside = repeat(3, () => makeMatch());

    expect(
      progressOf(compute([...outside, ...build(target - 1)]), id),
    ).toMatchObject({ earned: false, current: target - 1 });

    const reached = build(target);
    expect(progressOf(compute([...outside, ...reached]), id)).toMatchObject({
      earned: true,
      // 마지막 세션의 첫 경기에서 받는다.
      earnedMatchId: reached.at(-2)?.id,
      current: target,
    });
  });

  it("철인은 한 세션에서 8경기를 하면 받고 진행도는 한 세션 최대 경기 수다", () => {
    const below = [
      ...repeat(7, () => makeMatch({ sessionId: "session-a" })),
      ...repeat(7, () => makeMatch({ sessionId: "session-b" })),
    ];
    expect(progressOf(compute(below), "iron-8")).toMatchObject({
      earned: false,
      current: 7,
    });

    const eighth = makeMatch({ sessionId: "session-b" });
    expect(progressOf(compute([...below, eighth]), "iron-8")).toMatchObject({
      earned: true,
      earnedMatchId: eighth.id,
      current: 8,
    });
  });

  it.each([
    ["singles-wins-1", 1],
    ["singles-wins-10", 10],
  ])("%s는 단식에서 이긴 경기 %i개에서 받는다", (id, target) => {
    // 복식 승리와 단식 패배는 세지 않는다.
    const noise = [
      ...repeat(target, () => makeMatch({ won: true, partnerId: "p" })),
      makeMatch({ won: false }),
    ];
    const below = [...noise, ...repeat(target - 1, () => makeMatch())];
    expect(progressOf(compute(below), id)).toMatchObject({
      earned: false,
      current: target - 1,
    });

    const last = makeMatch();
    expect(progressOf(compute([...below, last]), id)).toMatchObject({
      earned: true,
      earnedMatchId: last.id,
      current: target,
    });
  });

  it("찰떡궁합은 같은 파트너와 복식 50경기에서 받는다", () => {
    const below = repeat(49, () => makeMatch({ partnerId: "partner-a" }));
    expect(progressOf(compute(below), "partner-50")).toMatchObject({
      earned: false,
      current: 49,
    });

    const fiftieth = makeMatch({ won: false, partnerId: "partner-a" });
    expect(
      progressOf(compute([...below, fiftieth]), "partner-50"),
    ).toMatchObject({ earned: true, earnedMatchId: fiftieth.id, current: 50 });
  });

  it("환상의 콤비는 같은 파트너와 함께한 경기끼리 5연승이면 받는다", () => {
    const withA = (won: boolean) => makeMatch({ won, partnerId: "partner-a" });
    const matches = [
      ...repeat(3, () => withA(true)),
      // 다른 파트너·단식 경기는 partner-a와의 연승을 끊지 않는다.
      makeMatch({ won: false, partnerId: "partner-b" }),
      makeMatch({ won: false }),
      withA(true),
    ];
    expect(progressOf(compute(matches), "combo-5")).toMatchObject({
      earned: false,
      current: 4,
    });

    const fifth = withA(true);
    expect(progressOf(compute([...matches, fifth]), "combo-5")).toMatchObject({
      earned: true,
      earnedMatchId: fifth.id,
      current: 5,
    });

    // partner-a와 진 경기는 연승을 끊는다.
    expect(
      progressOf(compute([...matches, withA(false), withA(true)]), "combo-5"),
    ).toMatchObject({ earned: false, current: 4 });
  });

  it("사교왕은 서로 다른 파트너 10명과 복식을 하면 받는다", () => {
    const below = [
      ...Array.from({ length: 9 }, (_, index) =>
        makeMatch({ won: false, partnerId: `partner-${index}` }),
      ),
      // 같은 파트너와 다시 한 경기, 단식 경기는 늘리지 않는다.
      makeMatch({ partnerId: "partner-0" }),
      makeMatch({ opponentIds: ["solo"] }),
    ];
    expect(progressOf(compute(below), "social-10")).toMatchObject({
      earned: false,
      current: 9,
    });

    const tenth = makeMatch({ partnerId: "partner-9" });
    expect(progressOf(compute([...below, tenth]), "social-10")).toMatchObject({
      earned: true,
      earnedMatchId: tenth.id,
      current: 10,
    });
  });

  it("라이벌은 같은 상대와 맞대결 20번에서 받는다(단식·복식, 승패 무관)", () => {
    const build = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        index % 2
          ? makeMatch({ won: false, opponentIds: ["rival"] })
          : makeMatch({
              won: true,
              partnerId: `partner-${index}`,
              opponentIds: ["rival", `other-${index}`],
            }),
      );
    expect(progressOf(compute(build(19)), "rival-20")).toMatchObject({
      earned: false,
      current: 19,
    });

    const reached = build(20);
    expect(progressOf(compute(reached), "rival-20")).toMatchObject({
      earned: true,
      earnedMatchId: reached.at(-1)?.id,
      current: 20,
    });
  });

  it("도장깨기는 서로 다른 상대 15명에게 이기면 받는다(복식은 상대 팀 각 선수)", () => {
    const below = [
      // 복식 승리 한 번에 상대 두 명을 센다: 7경기로 14명.
      ...Array.from({ length: 7 }, (_, index) =>
        makeMatch({
          partnerId: "mate",
          opponentIds: [`opp-${index * 2}`, `opp-${index * 2 + 1}`],
        }),
      ),
      // 이미 이긴 상대에게 또 이기거나, 진 상대는 세지 않는다.
      makeMatch({ opponentIds: ["opp-0"] }),
      makeMatch({ won: false, opponentIds: ["opp-14"] }),
    ];
    expect(progressOf(compute(below), "dojo-15")).toMatchObject({
      earned: false,
      current: 14,
    });

    const fifteenth = makeMatch({ opponentIds: ["opp-14"] });
    expect(progressOf(compute([...below, fifteenth]), "dojo-15")).toMatchObject(
      { earned: true, earnedMatchId: fifteenth.id, current: 15 },
    );
  });

  describe("리벤지(리벤지 매치 기준 전, 옛 조건)", () => {
    /** KST 2026-11-20 hh:mm 완료 시각. REVENGE_MATCH_ACHIEVEMENT_COUNT_START 전이라 옛 조건으로 센다 */
    const kst = (time: string, day = "2026-11-20") =>
      kstDateKeyTimeToDate(day, time);
    const lineup = (
      won: boolean,
      completedAt: Date,
      opponentIds = ["opp-1", "opp-2"],
    ) => makeMatch({ won, partnerId: "mate", opponentIds, completedAt });
    const revengeOf = (matches: AchievementMatch[]) =>
      progressOf(compute(matches), "revenge");

    it("같은 날 진 조합 그대로 바로 다음 경기에서 이기면 받는다(상대 순서 무관)", () => {
      const win = lineup(true, kst("19:20"), ["opp-2", "opp-1"]);
      expect(revengeOf([lineup(false, kst("19:00")), win])).toMatchObject({
        earned: true,
        earnedMatchId: win.id,
        current: 1,
      });
    });

    it("같은 조합으로 연달아 진 뒤 이겨도 받는다", () => {
      const matches = [
        lineup(false, kst("19:00")),
        lineup(false, kst("19:20")),
        lineup(true, kst("19:40")),
      ];
      expect(revengeOf(matches)).toMatchObject({
        earned: true,
        earnedMatchId: matches[2].id,
      });
    });

    it("사이에 이 회원이 뛰지 않은 경기는 무시한다", () => {
      const othersMatch: AchievementMatch = {
        ...makeMatch({ completedAt: kst("19:10") }),
        teams: [{ players: [{ id: "x" }] }, { players: [{ id: "y" }] }],
      };
      expect(
        revengeOf([
          lineup(false, kst("19:00")),
          othersMatch,
          lineup(true, kst("19:20")),
        ]).earned,
      ).toBe(true);
    });

    it("게스트가 낀 경기도 같은 조합이면 리벤지로 센다", () => {
      const win = {
        ...lineup(true, kst("19:20")),
        ratingExcluded: true,
      };
      expect(revengeOf([lineup(false, kst("19:00")), win])).toMatchObject({
        earned: true,
        earnedMatchId: win.id,
      });
    });

    it("사이에 이 회원이 다른 조합으로 뛰었으면 받지 않는다", () => {
      for (const between of [
        makeMatch({ partnerId: "other", completedAt: kst("19:10") }),
        lineup(true, kst("19:10"), ["opp-1", "opp-3"]),
      ]) {
        expect(
          revengeOf([
            lineup(false, kst("19:00")),
            between,
            lineup(true, kst("19:20")),
          ]),
        ).toMatchObject({ earned: false, current: 0 });
      }
    });

    it("사이에 같은 조합으로 승부가 갈리지 않은 경기가 있으면 받지 않는다", () => {
      const draw = makeMatch({
        partnerId: "mate",
        scoreA: 11,
        scoreB: 11,
        completedAt: kst("19:10"),
      });
      expect(
        revengeOf([
          lineup(false, kst("19:00")),
          draw,
          lineup(true, kst("19:20")),
        ]).earned,
      ).toBe(false);
    });

    it("KST 날짜가 다르면 받지 않는다", () => {
      expect(
        revengeOf([
          lineup(false, kst("23:50")),
          lineup(true, kst("00:10", "2026-11-21")),
        ]).earned,
      ).toBe(false);
    });

    it("직전 같은 조합 경기가 승리였으면 리벤지가 아니다", () => {
      expect(
        revengeOf([
          lineup(false, kst("19:00")),
          lineup(true, kst("19:20")),
          lineup(true, kst("19:40")),
        ]).current,
      ).toBe(1);
    });

    it("단식에서 같은 상대에게 진 뒤 바로 이겨도 받는다", () => {
      const matches = [
        makeMatch({
          won: false,
          opponentIds: ["rival"],
          completedAt: kst("19:00"),
        }),
        makeMatch({
          won: true,
          opponentIds: ["rival"],
          completedAt: kst("19:20"),
        }),
      ];
      expect(revengeOf(matches)).toMatchObject({
        earned: true,
        earnedMatchId: matches[1].id,
      });
    });

    it("뒤끝 작렬은 열 번째 리벤지 경기로 받는다", () => {
      const revenges = (count: number) =>
        Array.from({ length: count }, (_, index) => {
          const day = `2026-11-${String(17 + index).padStart(2, "0")}`;
          return [
            lineup(false, kst("19:00", day)),
            lineup(true, kst("19:20", day)),
          ];
        }).flat();
      const nine = compute(revenges(9));
      expect(progressOf(nine, "revenge-10")).toMatchObject({
        earned: false,
        current: 9,
        target: 10,
      });

      const ten = revenges(10);
      expect(progressOf(compute(ten), "revenge-10")).toMatchObject({
        earned: true,
        earnedMatchId: ten[19].id,
        current: 10,
      });
    });
  });

  describe("리벤지(리벤지 매치 기준)", () => {
    /** KST 2026-12-03 hh:mm 완료 시각. REVENGE_MATCH_ACHIEVEMENT_COUNT_START 뒤 */
    const kst = (time: string) => kstDateKeyTimeToDate("2026-12-03", time);
    const lineup = (
      won: boolean,
      completedAt: Date,
      specialMatchOutcome: AchievementMatch["specialMatchOutcome"] = null,
    ): AchievementMatch => ({
      ...makeMatch({ won, partnerId: "mate", opponentIds: ["opp-1", "opp-2"], completedAt }),
      specialMatchOutcome,
    });
    const revengeOf = (matches: AchievementMatch[]) =>
      progressOf(compute(matches), "revenge");

    it("리벤지 매치에서 이기면(revenge_success) 받는다", () => {
      const win = lineup(true, kst("19:40"), "revenge_success");
      expect(
        revengeOf([lineup(false, kst("19:00")), lineup(true, kst("19:20")), win]),
      ).toMatchObject({ earned: true, earnedMatchId: win.id, current: 1 });
    });

    it("리벤지 매치가 아니면 진 조합 그대로 바로 다음 경기에서 이겨도 받지 않는다", () => {
      expect(
        revengeOf([lineup(false, kst("19:00")), lineup(true, kst("19:20"))]),
      ).toMatchObject({ earned: false, current: 0 });
    });

    it("방어한 팀(revenge_defended)·리벤지 매치에서 진 팀은 받지 않는다", () => {
      expect(
        revengeOf([
          lineup(true, kst("19:00"), "revenge_defended"),
          lineup(false, kst("19:20"), "revenge_success"),
        ]).current,
      ).toBe(0);
    });
  });

  it("무패 세션은 만료된 세션에서 4경기 이상 모두 이기면 받고, 같은 세션에서 지면 받지 않은 상태다", () => {
    const inSession = (won: boolean, sessionId = "session-a") =>
      makeMatch({ won, sessionId });
    const computeEnded = (matches: AchievementMatch[]) =>
      computeAchievements(
        ME,
        matches,
        endedSessions(["session-a", "session-b"]),
      );

    const three = repeat(3, () => inSession(true));
    expect(progressOf(computeEnded(three), "unbeaten-session")).toMatchObject({
      earned: false,
      current: 0,
    });

    const fourth = inSession(true);
    const unbeaten = [...three, fourth, inSession(true)];
    // 아직 만료되지 않은 세션은 이후 경기로 결과가 바뀔 수 있어 세지 않는다.
    expect(progressOf(compute(unbeaten), "unbeaten-session")).toMatchObject({
      earned: false,
      current: 0,
    });
    expect(progressOf(computeEnded(unbeaten), "unbeaten-session")).toMatchObject({
      earned: true,
      // 네 번째 경기에서 조건을 채운다.
      earnedMatchId: fourth.id,
      earnedAt: fourth.completedAt,
      current: 1,
    });

    // 같은 세션에서 한 번이라도 지면 무패 세션이 아니다.
    expect(
      progressOf(
        computeEnded([...unbeaten, inSession(false)]),
        "unbeaten-session",
      ),
    ).toMatchObject({
      earned: false,
      earnedAt: null,
      earnedMatchId: null,
      current: 0,
    });

    // 다른 세션의 패배는 영향이 없다.
    expect(
      progressOf(
        computeEnded([...unbeaten, inSession(false, "session-b")]),
        "unbeaten-session",
      ),
    ).toMatchObject({ earned: true, earnedMatchId: fourth.id });
  });

  it("업적 기준 시각(2026-11-17 00:00 KST) 전 경기는 경기 수·승 수·출석에만 센다", () => {
    const startMs = ACHIEVEMENT_COUNT_START.getTime();
    expect(ACHIEVEMENT_COUNT_START.toISOString()).toBe("2026-11-16T15:00:00.000Z");
    const before = [3, 2, 1].map((offset) =>
      makeMatch({
        partnerId: "partner-old",
        sessionId: "session-old",
        completedAt: new Date(startMs - offset),
      }),
    );
    const atStart = makeMatch({
      partnerId: "partner-new",
      sessionId: "session-new",
      completedAt: new Date(startMs),
    });

    const progress = computeAchievements(
      ME,
      [...before, atStart],
      endedSessions([], ["session-old", "session-new"]),
    );
    // 경기 수·승 수·출석은 기준 시각 전 경기도 세고, 받은 경기도 그 경기다
    expect(progressOf(progress, "matches-1")).toMatchObject({
      earned: true,
      earnedMatchId: before[0].id,
      earnedAt: before[0].completedAt,
      current: 4,
    });
    expect(progressOf(progress, "wins-1")).toMatchObject({
      earned: true,
      earnedMatchId: before[0].id,
      current: 4,
    });
    expect(progressOf(progress, "attendance-10")).toMatchObject({ current: 2 });
    // 나머지 지표는 기준 시각 이후 경기만 센다
    expect(progressOf(progress, "streak-3")).toMatchObject({
      earned: false,
      current: 1,
    });
    expect(progressOf(progress, "partner-20")).toMatchObject({ current: 1 });
    expect(progressOf(progress, "social-10")).toMatchObject({ current: 1 });
    expect(progressOf(progress, "rival-20")).toMatchObject({ current: 1 });
    expect(progressOf(progress, "iron-8")).toMatchObject({ current: 1 });
    expect(progressOf(progress, "dominator-1")).toMatchObject({
      earnedMatchId: atStart.id,
      current: 1,
    });

    // 기준 시각 전 경기만 있어도 경기 수·승 수는 받는다
    const onlyBefore = computeAchievements(ME, before);
    expect(progressOf(onlyBefore, "matches-1")).toMatchObject({
      earned: true,
      earnedMatchId: before[0].id,
      current: 3,
    });
    expect(progressOf(onlyBefore, "streak-3")).toMatchObject({
      earned: false,
      current: 0,
    });
  });

  it("개근은 기준 시각 전후에 걸친 세션을 한 번만 센다", () => {
    const startMs = ACHIEVEMENT_COUNT_START.getTime();
    const matches = [
      makeMatch({ sessionId: "session-a", completedAt: new Date(startMs - 1) }),
      makeMatch({ sessionId: "session-a", completedAt: new Date(startMs + 1) }),
    ];
    const progress = compute(matches);
    expect(progressOf(progress, "attendance-10")).toMatchObject({ current: 1 });
    // 철인은 기준 시각 이후 경기만 센다
    expect(progressOf(progress, "iron-8")).toMatchObject({ current: 1 });
  });

  it("세션 지배자는 지배 세션 수로 세고, 그 세션에서 내 마지막 경기를 받은 경기로 정한다", () => {
    const sessionA = [
      makeMatch({ sessionId: "session-a" }),
      makeMatch({ won: false, sessionId: "session-a" }),
    ];
    const sessionB = [makeMatch({ sessionId: "session-b" })];
    const matches = [...sessionA, ...sessionB];

    // 지배 세션이 없으면(기본값) 받지 않는다.
    expect(progressOf(compute(matches), "dominator-1")).toMatchObject({
      earned: false,
      current: 0,
    });

    // 경기를 하지 않은 세션 id는 세지 않는다.
    const progress = computeAchievements(
      ME,
      matches,
      endedSessions([], ["session-b", "session-a", "session-none"]),
    );
    expect(progressOf(progress, "dominator-1")).toMatchObject({
      earned: true,
      // 시간순으로 먼저인 session-a의 내 마지막 경기
      earnedMatchId: sessionA[1].id,
      earnedAt: sessionA[1].completedAt,
      current: 2,
    });
    expect(progressOf(progress, "dominator-10")).toMatchObject({
      earned: false,
      current: 2,
    });
  });

  it("세션 왕·세션 황제·세션 절대 군주는 열·스물다섯·쉰 번째 지배 세션에서 받는다", () => {
    const matches = Array.from({ length: 50 }, (_, index) =>
      makeMatch({ sessionId: `session-${index}` }),
    );
    const dominatedUpTo = (count: number) =>
      endedSessions(
        [],
        matches.slice(0, count).map((_, index) => `session-${index}`),
      );
    const progressAt = (count: number, id: string) =>
      progressOf(computeAchievements(ME, matches, dominatedUpTo(count)), id);

    expect(progressAt(10, "dominator-10")).toMatchObject({
      earned: true,
      earnedMatchId: matches[9].id,
      current: 10,
    });
    expect(progressAt(24, "dominator-25")).toMatchObject({
      earned: false,
      current: 24,
      target: 25,
    });
    expect(progressAt(25, "dominator-25")).toMatchObject({
      earned: true,
      earnedMatchId: matches[24].id,
    });
    expect(progressAt(49, "dominator-50").earned).toBe(false);
    expect(progressAt(50, "dominator-50")).toMatchObject({
      earned: true,
      earnedMatchId: matches[49].id,
      current: 50,
    });
  });

  it("진행 중·취소 경기와 완료 시각이 없는 경기, 참가하지 않은 경기는 세지 않는다", () => {
    const notMine: AchievementMatch = {
      ...makeMatch(),
      teams: [{ players: [{ id: "x" }] }, { players: [{ id: "y" }] }],
    };
    const progress = compute([
      makeMatch({ status: "created" }),
      makeMatch({ status: "cancelled" }),
      makeMatch({ completedAt: null }),
      notMine,
    ]);
    expect(progressOf(progress, "matches-1")).toMatchObject({
      earned: false,
      current: 0,
    });
  });

  it("경기를 지워 조건이 깨지면 다시 계산할 때 받지 않은 상태가 된다", () => {
    const matches = repeat(10, () => makeMatch());
    expect(progressOf(compute(matches), "matches-10").earned).toBe(true);
    expect(progressOf(compute(matches.slice(1)), "matches-10")).toMatchObject({
      earned: false,
      earnedAt: null,
      earnedMatchId: null,
      current: 9,
    });
  });
});

describe("findNewAchievements", () => {
  it("저장 전후 계산 차이로 참가자 전원이 새로 받은 업적만 돌려준다", () => {
    const before = repeat(2, () => makeMatch({ won: true, partnerId: "mate" }));
    const saved = makeMatch({ won: true, partnerId: "mate" });

    const result = findNewAchievements({
      playerIds: [ME, "mate", "opp-1"],
      before,
      after: [...before, saved],
    });

    expect(result).toEqual([
      {
        playerId: ME,
        achievementId: "streak-3",
        earnedMatchId: saved.id,
        earnedAt: saved.completedAt,
      },
      {
        playerId: "mate",
        achievementId: "streak-3",
        earnedMatchId: saved.id,
        earnedAt: saved.completedAt,
      },
    ]);
  });

  it("세션 안 4경기 전승을 기록해도 무패 세션은 새 업적이 아니다(세션 만료 뒤 정해진다)", () => {
    const before = repeat(3, () => makeMatch({ sessionId: "session-a" }));
    const saved = makeMatch({ sessionId: "session-a" });
    expect(
      findNewAchievements({ playerIds: [ME], before, after: [...before, saved] })
        .map((item) => item.achievementId),
    ).not.toContain("unbeaten-session");
  });

  it("새로 받은 업적이 없으면 빈 배열이다", () => {
    const before = [makeMatch({ won: true })];
    expect(
      findNewAchievements({
        playerIds: [ME],
        before,
        after: [...before, makeMatch({ won: false })],
      }),
    ).toEqual([]);
  });

  it("업적 기준 시각 전 경기로 받은 업적은 넣지 않는다", () => {
    // 기준 시각 전 경기를 고쳐 경기 수·승 수 업적을 그 경기로 받게 돼도 새 업적이 아니다
    const saved = makeMatch({
      completedAt: new Date(ACHIEVEMENT_COUNT_START.getTime() - 1),
    });
    expect(
      findNewAchievements({ playerIds: [ME], before: [], after: [saved] }),
    ).toEqual([]);
  });
});

describe("findUnseenAchievements", () => {
  const earned = (
    achievementId: string,
    earnedMatchId: string,
    earnedAtMs: number,
  ): EarnedAchievement => ({
    playerId: ME,
    achievementId,
    earnedMatchId,
    earnedAt: new Date(BASE_MS + earnedAtMs),
  });

  it("확인 기록이 없는 업적을 받은 시각 → 업적 정의 순서로 돌려준다", () => {
    const wins = earned("wins-1", "m1", 0);
    const matches = earned("matches-1", "m1", 0);
    const streak = earned("streak-3", "m3", -1);

    expect(findUnseenAchievements([wins, matches, streak], [])).toEqual([
      streak,
      matches,
      wins,
    ]);
  });

  it("같은 획득 경기로 확인한 업적은 빼고, 다른 경기로 다시 받은 업적은 다시 돌려준다", () => {
    const first = earned("matches-1", "m1", 0);
    const regained = earned("unbeaten-session", "m9", 1);

    expect(
      findUnseenAchievements(
        [first, regained],
        [
          { achievementId: "matches-1", earnedMatchId: "m1" },
          { achievementId: "unbeaten-session", earnedMatchId: "m4" },
        ],
      ),
    ).toEqual([regained]);
  });
});

describe("평점 업적", () => {
  const MIN = RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES;

  /** 복식 경기에 경기 직후 내 복식 평점을 붙인다. completedAt을 주면 그 시각에 완료한 경기다 */
  const ratedDoubles = (
    rating: number | null,
    { won = true, completedAt }: { won?: boolean; completedAt?: Date } = {},
  ): AchievementMatch => {
    const match = makeMatch({ won, partnerId: "partner-1", completedAt });
    return rating == null
      ? match
      : { ...match, doublesRatingAfter: { [ME]: rating } };
  };

  /** 평점 없는 복식 경기 count개. 복식 경기 수만 채운다 */
  const warmUp = (count: number) => repeat(count, () => ratedDoubles(null));

  const beforeStart = (ms: number) =>
    new Date(ACHIEVEMENT_COUNT_START.getTime() - ms);

  /** 업적 기준 시각 전 평점 없는 복식 경기 count개(기준 시각에서 먼 순, 마지막이 100초 전) */
  const warmUpBeforeStart = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      ratedDoubles(null, {
        completedAt: beforeStart(100_000 + (count - index) * 1_000),
      }),
    );

  const RATING_IDS = ACHIEVEMENTS.filter((definition) =>
    isRatingAchievement(definition.id),
  ).map((definition) => definition.id);

  it("평점 업적은 6개이고 꼬리표는 소수 한 자리까지 쓴다", () => {
    expect(
      ACHIEVEMENTS.filter((definition) => isRatingAchievement(definition.id)).map(
        ({ id, name, badgeNumber, target }) => ({ id, name, badgeNumber, target }),
      ),
    ).toEqual([
      { id: "rating-3.0", name: "수면 위로", badgeNumber: "3.0", target: 3 },
      { id: "rating-3.5", name: "구름 위 산책", badgeNumber: "3.5", target: 3.5 },
      { id: "rating-4.0", name: "성층권", badgeNumber: "4.0", target: 4 },
      { id: "rating-4.5", name: "궤도 진입", badgeNumber: "4.5", target: 4.5 },
      { id: "rating-low-2.5", name: "심해 탐사", badgeNumber: "2.5", target: 2.5 },
      { id: "rating-low-2.0", name: "마리아나 해구", badgeNumber: "2.0", target: 2 },
    ]);
    expect(
      ACHIEVEMENTS.filter((definition) => isLowRatingAchievement(definition.id)).map(
        (definition) => definition.id,
      ),
    ).toEqual(["rating-low-2.5", "rating-low-2.0"]);
  });

  it("복식 10경기를 채운 뒤 평점이 처음 기준 이상이 된 경기로 받고, 진행도는 최고 복식 평점이다", () => {
    const matches = [
      ...repeat(MIN - 1, () => ratedDoubles(3.6)),
      ratedDoubles(3.2),
      ratedDoubles(3.4999),
      ratedDoubles(3.7),
    ];
    const tenth = matches[MIN - 1];
    const progress = compute(matches);
    expect(progressOf(progress, "rating-3.0")).toMatchObject({
      earned: true,
      earnedMatchId: tenth.id,
    });
    expect(progressOf(progress, "rating-3.5")).toEqual({
      id: "rating-3.5",
      earned: true,
      earnedAt: matches[MIN].completedAt,
      earnedMatchId: matches[MIN].id,
      current: 3.7,
      target: 3.5,
      ratedDoublesMatches: MIN + 2,
    });
    expect(progressOf(progress, "rating-4.0")).toMatchObject({
      earned: false,
      current: 3.7,
    });
  });

  it("복식 10경기 전 평점은 세지 않고, 단식은 경기 수에 들지 않는다", () => {
    const singles = { ...makeMatch(), doublesRatingAfter: { [ME]: 4.6 } };
    const progress = compute([
      ...repeat(MIN - 1, () => ratedDoubles(4.6)),
      singles,
    ]);
    for (const id of RATING_IDS) {
      expect(progressOf(progress, id)).toMatchObject({
        earned: false,
        current: 0,
        ratedDoublesMatches: MIN - 1,
      });
    }
  });

  it("받은 뒤 평점이 내려가도 유지한다", () => {
    const matches = [
      ...warmUp(MIN - 1),
      ratedDoubles(4.05),
      ratedDoubles(3.6, { won: false }),
    ];
    const peak = matches[MIN - 1];
    const progress = compute(matches);
    expect(progressOf(progress, "rating-4.0")).toMatchObject({
      earned: true,
      earnedMatchId: peak.id,
      current: 4.05,
    });
    expect(progressOf(progress, "rating-3.5")).toMatchObject({
      earned: true,
      earnedMatchId: peak.id,
    });
  });

  it("낮은 평점은 복식 10경기를 채운 뒤 처음 기준 이하가 된 경기로 받고, 다시 올라가도 유지한다", () => {
    const matches = [
      ...repeat(MIN - 1, () => ratedDoubles(1.9, { won: false })),
      ratedDoubles(2.8, { won: false }),
      ratedDoubles(2.45, { won: false }),
      ratedDoubles(2.9),
    ];
    const low = matches[MIN];
    const progress = compute(matches);
    expect(progressOf(progress, "rating-low-2.5")).toEqual({
      id: "rating-low-2.5",
      earned: true,
      earnedAt: low.completedAt,
      earnedMatchId: low.id,
      current: 2.45,
      target: 2.5,
      ratedDoublesMatches: MIN + 2,
    });
    // 10경기 전 1.9는 세지 않는다
    expect(progressOf(progress, "rating-low-2.0")).toMatchObject({
      earned: false,
      current: 2.45,
    });
    expect(progressOf(progress, "rating-3.0")).toMatchObject({
      earned: false,
      current: 2.9,
    });
  });

  it("평점 미반영 경기·평점이 없는 경기·다른 회원 평점은 세지 않는다", () => {
    const excluded = { ...ratedDoubles(4.6), ratingExcluded: true };
    const othersOnly = {
      ...makeMatch({ partnerId: "partner-1" }),
      doublesRatingAfter: { "partner-1": 1.9 },
    };
    const progress = compute([...warmUp(MIN), excluded, othersOnly]);
    for (const id of RATING_IDS) {
      expect(progressOf(progress, id)).toMatchObject({
        earned: false,
        current: 0,
      });
    }
    // 평점 미반영 경기는 복식 경기 수에도 들지 않는다
    expect(progressOf(progress, "rating-3.0").ratedDoublesMatches).toBe(MIN + 1);
  });

  it("업적 기준 시각 시점에 복식 10경기를 채웠고 평점이 기준을 넘으면 그 전 마지막 경기로 받는다", () => {
    const older = ratedDoubles(3.3, { completedAt: beforeStart(2_000) });
    const last = ratedDoubles(3.8, { completedAt: beforeStart(1_000) });
    const progress = compute([last, older, ...warmUpBeforeStart(MIN - 2)]);
    expect(progressOf(progress, "rating-3.5")).toEqual({
      id: "rating-3.5",
      earned: true,
      earnedAt: last.completedAt,
      earnedMatchId: last.id,
      current: 3.8,
      target: 3.5,
      ratedDoublesMatches: MIN,
    });
    expect(progressOf(progress, "rating-4.0")).toMatchObject({
      earned: false,
      current: 3.8,
    });
    // 평점 업적과 경기 수·승 수·출석 말고는 기준 시각 전 경기를 세지 않는다
    expect(progressOf(progress, "streak-3")).toMatchObject({
      earned: false,
      current: 0,
    });
  });

  it("업적 기준 시각 시점 낮은 평점도 바로 받는다", () => {
    const last = ratedDoubles(2.4, { completedAt: beforeStart(1_000) });
    expect(
      progressOf(compute([...warmUpBeforeStart(MIN - 1), last]), "rating-low-2.5"),
    ).toMatchObject({ earned: true, earnedMatchId: last.id, current: 2.4 });
  });

  it("업적 기준 시각 전 최고치는 세지 않고, 기준 시각 이후 경기로 넘으면 그 경기로 받는다", () => {
    const peak = ratedDoubles(4.1, { completedAt: beforeStart(2_000) });
    const last = ratedDoubles(3.6, { completedAt: beforeStart(1_000) });
    const afterStart = ratedDoubles(4.02);
    const before = [...warmUpBeforeStart(MIN - 2), peak, last];
    const progress = compute([...before, afterStart]);
    expect(progressOf(progress, "rating-3.5")).toMatchObject({
      earned: true,
      earnedMatchId: last.id,
    });
    expect(progressOf(progress, "rating-4.0")).toMatchObject({
      earned: true,
      earnedMatchId: afterStart.id,
      current: 4.02,
    });
    expect(progressOf(compute(before), "rating-4.0")).toMatchObject({
      earned: false,
      current: 3.6,
    });
  });

  it("업적 기준 시각 시점에 복식 10경기가 안 되면 기준 시각 이후 경기로 10경기를 채울 때 센다", () => {
    const matches = [
      ...warmUpBeforeStart(4),
      ratedDoubles(3.9, { completedAt: beforeStart(1_000) }),
      ...warmUp(3),
      ratedDoubles(3.4),
      ratedDoubles(3.6),
    ];
    const tenth = matches[MIN - 1];
    const progress = compute(matches);
    expect(progressOf(progress, "rating-3.5")).toMatchObject({
      earned: true,
      earnedMatchId: tenth.id,
      current: 3.6,
      ratedDoublesMatches: MIN,
    });
  });

  it("업적 기준 시각 시점 평점은 평점 미반영·단식·평점이 없는 경기를 건너뛴다", () => {
    const counted = ratedDoubles(3.55, { completedAt: beforeStart(4_000) });
    const excluded = {
      ...ratedDoubles(3.2, { completedAt: beforeStart(3_000) }),
      ratingExcluded: true,
    };
    const singles = {
      ...makeMatch({ completedAt: beforeStart(2_000) }),
      doublesRatingAfter: { [ME]: 3.2 },
    };
    const unrated = ratedDoubles(null, { completedAt: beforeStart(1_000) });
    expect(
      progressOf(
        compute([
          ...warmUpBeforeStart(MIN - 2),
          counted,
          excluded,
          singles,
          unrated,
        ]),
        "rating-3.5",
      ),
    ).toMatchObject({
      earned: true,
      earnedMatchId: counted.id,
      current: 3.55,
      // 평점이 없는 복식 경기도 경기 수에는 든다
      ratedDoublesMatches: MIN,
    });
  });

  it("업적 기준 시각 시점 평점으로 받은 업적은 새 경기를 저장해도 새 업적으로 나오지 않는다", () => {
    const before = [
      ...warmUpBeforeStart(MIN - 1),
      ratedDoubles(3.7, { completedAt: beforeStart(1_000) }),
    ];
    const saved = ratedDoubles(3.75);
    expect(
      findNewAchievements({
        playerIds: [ME],
        before,
        after: [...before, saved],
      }).filter((item) => isRatingAchievement(item.achievementId)),
    ).toEqual([]);
  });

  it("저장 전 상태에 평점이 없으면 이번 경기로 넘긴 기준을 새 업적으로 준다", () => {
    const earlier = [...warmUp(MIN - 1), ratedDoubles(3.4)];
    const saved = ratedDoubles(3.55);
    const { doublesRatingAfter: _ignored, ...savedBefore } = saved;
    expect(
      findNewAchievements({
        playerIds: [ME],
        before: [...earlier, savedBefore],
        after: [...earlier, saved],
      })
        .filter((item) => isRatingAchievement(item.achievementId))
        .map((item) => [item.achievementId, item.earnedMatchId]),
    ).toEqual([["rating-3.5", saved.id]]);
  });
});

describe("업적 점수", () => {
  it("업적마다 10·25·50·100점이다", () => {
    for (const definition of ACHIEVEMENTS) {
      expect([10, 25, 50, 100]).toContain(definition.points);
    }
    expect(ACHIEVEMENT_MAX_POINTS).toBe(2345);
  });

  it("받은 업적 점수만 더하고 모르는 업적은 0점이다", () => {
    expect(getAchievementPoints("unknown")).toBe(0);
    expect(
      sumAchievementPoints([
        { id: "matches-1", earned: true },
        { id: "perfect-win", earned: true },
        { id: "streak-20", earned: false },
        { id: "rating-low-2.5", earned: true },
      ]),
    ).toBe(60);
  });
});

describe("도전자", () => {
  const RATED = { [ME]: 3.0, partner: 3.0, "opp-1": 3.1, "opp-2": 3.1 };

  it("이름은 도전자, 25점이다", () => {
    expect(ACHIEVEMENTS.find((definition) => definition.id === "underdog")).toMatchObject({
      name: "도전자",
      condition: "평균 평점이 0.1 이상 높은 팀에게 승리",
      points: 25,
    });
  });

  it("경기 직전 상대 팀 평균 평점이 0.1 이상 높은데 이기면 받는다", () => {
    const match = makeMatch({ partnerId: "partner", ratingBefore: RATED });
    expect(progressOf(compute([match]), "underdog")).toMatchObject({
      earned: true,
      earnedMatchId: match.id,
      current: 1,
    });
  });

  it("차이가 0.1보다 작거나, 지거나, 경기 직전 평점이 없으면 받지 않는다", () => {
    const matches = [
      makeMatch({
        partnerId: "partner",
        ratingBefore: { ...RATED, "opp-2": 3.08 },
      }),
      makeMatch({ partnerId: "partner", won: false, ratingBefore: RATED }),
      makeMatch({ partnerId: "partner" }),
    ];
    expect(progressOf(compute(matches), "underdog")).toMatchObject({
      earned: false,
      current: 0,
    });
  });

  it("평점이 없는 선수는 3.0으로 친다", () => {
    const match = makeMatch({
      partnerId: "partner",
      ratingBefore: { [ME]: null, "opp-1": 3.1, "opp-2": 3.1 },
    });
    expect(progressOf(compute([match]), "underdog").earned).toBe(true);
  });

  it("단식은 두 선수 평점을 비교한다", () => {
    const match = makeMatch({ ratingBefore: { [ME]: 2.9, "opp-1": 3.0 } });
    expect(progressOf(compute([match]), "underdog").earned).toBe(true);
  });

  it("집계 시작 시각(2026-11-25 00:00 KST) 전 경기는 세지 않는다", () => {
    const before = makeMatch({
      partnerId: "partner",
      ratingBefore: RATED,
      completedAt: new Date("2026-11-24T14:59:00.000Z"),
    });
    expect(progressOf(compute([before]), "underdog").earned).toBe(false);
    const after = makeMatch({
      partnerId: "partner",
      ratingBefore: RATED,
      completedAt: new Date("2026-11-24T15:00:00.000Z"),
    });
    expect(progressOf(compute([after]), "underdog").earned).toBe(true);
  });
  it("게스트가 낀 경기(평점 미반영)는 평점에 묶인 업적이라 세지 않는다", () => {
    const match = {
      ...makeMatch({ partnerId: "partner", ratingBefore: RATED }),
      ratingExcluded: true,
    };
    expect(progressOf(compute([match]), "underdog")).toMatchObject({
      earned: false,
      current: 0,
    });
  });
});

describe("연승 저지", () => {
  const winStreakOf = (playerId: string, count: number) =>
    repeat(count, () =>
      makeOthersMatch({ teamA: [playerId], teamB: ["someone"] }),
    );

  it("경기 직전 3연승 이상이던 상대를 이기면 받는다", () => {
    const streak = winStreakOf("hot", 3);
    const breaker = makeMatch({ opponentIds: ["hot"] });
    const progress = compute([...streak, breaker]);
    expect(progressOf(progress, "streak-breaker")).toMatchObject({
      earned: true,
      earnedMatchId: breaker.id,
    });
  });

  it("상대 팀 중 한 명만 3연승이어도 받는다", () => {
    const streak = winStreakOf("hot", 6);
    const breaker = makeMatch({
      partnerId: "partner",
      opponentIds: ["cold", "hot"],
    });
    const progress = compute([...streak, breaker]);
    expect(progressOf(progress, "streak-breaker").earned).toBe(true);
  });

  it("2연승인 상대를 이기거나 3연승인 상대에게 지면 받지 않는다", () => {
    const progress = compute([
      ...winStreakOf("two", 2),
      makeMatch({ opponentIds: ["two"] }),
      ...winStreakOf("three", 3),
      makeMatch({ opponentIds: ["three"], won: false }),
    ]);
    expect(progressOf(progress, "streak-breaker").earned).toBe(false);
  });

  it("상대의 연승은 게스트가 낀 경기도 세서 정한다", () => {
    const streak = winStreakOf("hot", 5).map((match, index) =>
      index % 2 === 0 ? { ...match, ratingExcluded: true } : match,
    );
    const breaker = { ...makeMatch({ opponentIds: ["hot"] }), ratingExcluded: true };
    expect(progressOf(compute([...streak, breaker]), "streak-breaker")).toMatchObject({
      earned: true,
      earnedMatchId: breaker.id,
    });
  });

  it("상대의 연승은 중간에 진 경기에서 끊긴다", () => {
    const progress = compute([
      ...winStreakOf("hot", 3),
      makeOthersMatch({ teamA: ["hot"], teamB: ["someone"], winner: 1 }),
      ...winStreakOf("hot", 2),
      makeMatch({ opponentIds: ["hot"] }),
    ]);
    expect(progressOf(progress, "streak-breaker").earned).toBe(false);
  });

  it("수문장은 열 번째 연승 저지 경기로 받는다", () => {
    const breaks = (count: number) =>
      Array.from({ length: count }, () => [
        ...winStreakOf("hot", 3),
        makeMatch({ opponentIds: ["hot"] }),
      ]).flat();
    const nine = breaks(9);
    expect(progressOf(compute(nine), "streak-breaker-10")).toMatchObject({
      earned: false,
      current: 9,
      target: 10,
    });

    const ten = breaks(10);
    expect(progressOf(compute(ten), "streak-breaker-10")).toMatchObject({
      earned: true,
      earnedMatchId: ten[ten.length - 1].id,
      current: 10,
    });
  });
});

describe("환영 인사", () => {
  it("파트너의 첫 경기에 같은 팀으로 뛰면 지더라도 받는다", () => {
    const match = makeMatch({ partnerId: "newbie", won: false });
    expect(progressOf(compute([match]), "welcome")).toMatchObject({
      earned: true,
      earnedMatchId: match.id,
    });
  });

  it("파트너가 전에 경기를 했거나 상대가 첫 경기면 받지 않는다", () => {
    const progress = compute([
      makeOthersMatch({ teamA: ["veteran"], teamB: ["someone"] }),
      makeMatch({ partnerId: "veteran" }),
      makeMatch({ opponentIds: ["rookie"] }),
    ]);
    expect(progressOf(progress, "welcome").earned).toBe(false);
  });

  it("게스트가 낀 경기도 파트너의 첫 경기로 본다", () => {
    const guestMatch = {
      ...makeOthersMatch({ teamA: ["newbie", "guest"], teamB: ["a", "b"] }),
      ratingExcluded: true,
    };
    const match = makeMatch({ partnerId: "newbie" });
    expect(
      progressOf(compute([guestMatch, match]), "welcome").earned,
    ).toBe(false);

    const firstWithGuest = {
      ...makeMatch({ partnerId: "rookie", opponentIds: ["guest", "opp-1"] }),
      ratingExcluded: true,
    };
    expect(progressOf(compute([firstWithGuest]), "welcome")).toMatchObject({
      earned: true,
      earnedMatchId: firstWithGuest.id,
    });
  });
});

describe("개근상", () => {
  const playRegular = (sessionId: string) =>
    makeMatch({ sessionId, regular: true });

  it("경기가 열린 정기 회차에 8번 연달아 참여하면 8번째 회차 첫 경기로 받는다", () => {
    const matches = Array.from({ length: 8 }, (_, index) =>
      playRegular(`regular-${index}`),
    );
    const progress = compute(matches);
    expect(progressOf(progress, "regular-streak-8")).toMatchObject({
      earned: true,
      earnedMatchId: matches[7].id,
      current: 8,
    });
  });

  it("빠진 정기 회차가 있으면 1부터 다시 센다", () => {
    const matches = [
      ...Array.from({ length: 4 }, (_, index) => playRegular(`r-${index}`)),
      makeOthersMatch({
        teamA: ["a"],
        teamB: ["b"],
        sessionId: "r-skipped",
        regular: true,
      }),
      ...Array.from({ length: 5 }, (_, index) => playRegular(`r-${index + 5}`)),
    ];
    expect(progressOf(compute(matches), "regular-streak-8")).toMatchObject({
      earned: false,
      current: 5,
    });
  });

  it("회원 세션은 연속에 세지도 끊지도 않는다", () => {
    const matches = Array.from({ length: 8 }, (_, index) => [
      playRegular(`regular-${index}`),
      makeOthersMatch({ teamA: ["a"], teamB: ["b"], sessionId: `custom-${index}` }),
    ]).flat();
    expect(progressOf(compute(matches), "regular-streak-8").earned).toBe(true);
  });
});

describe("천적", () => {
  it("같은 상대에게 10번 이기면 받는다", () => {
    const matches = repeat(10, () => makeMatch({ opponentIds: ["prey"] }));
    expect(progressOf(compute(matches), "nemesis-10")).toMatchObject({
      earned: true,
      earnedMatchId: matches[9].id,
      current: 10,
    });
  });

  it("진 경기와 다른 상대는 세지 않는다", () => {
    const progress = compute([
      ...repeat(9, () => makeMatch({ opponentIds: ["prey"] })),
      makeMatch({ opponentIds: ["prey"], won: false }),
      makeMatch({ opponentIds: ["other"] }),
    ]);
    expect(progressOf(progress, "nemesis-10")).toMatchObject({
      earned: false,
      current: 9,
    });
  });
});

describe("업적 이름", () => {
  it("개근 업적은 출석 N회로 부른다", () => {
    expect(
      ["attendance-10", "attendance-30", "attendance-100"].map(
        (id) => ACHIEVEMENTS.find((definition) => definition.id === id)?.name,
      ),
    ).toEqual(["출석 10회", "출석 30회", "출석 100회"]);
  });
});

describe("칭찬 업적", () => {
  const praisedEndedSessions = (
    sessions: { sessionId: string; matchId: string; reachedAt: Date }[],
  ): EndedSessions =>
    Object.assign(new Map<string, string | null>(), {
      praisedSessionsByPlayerId: new Map([[ME, sessions]]),
    });

  const progressOf = (endedSessions: EndedSessions, id: string) =>
    computeAchievements(ME, [], endedSessions).find((item) => item.id === id)!;

  it("칭찬 5개 이상 받은 첫 세션으로 이쁨받기를 받는다(받은 시각은 닿은 칭찬 시각)", () => {
    const reachedAt = new Date(BASE_MS + 60_000);
    const progress = progressOf(
      praisedEndedSessions([
        { sessionId: "s-2", matchId: "m-2", reachedAt: new Date(BASE_MS + 120_000) },
        { sessionId: "s-1", matchId: "m-1", reachedAt },
      ]),
      "praised-1",
    );
    expect(progress).toMatchObject({
      earned: true,
      earnedMatchId: "m-1",
      earnedAt: reachedAt,
      current: 2,
    });
  });

  it("이 구역 사랑둥이는 10번째 세션으로 받고, 그 전에는 진행도만 쌓인다", () => {
    const sessions = Array.from({ length: 10 }, (_, index) => ({
      sessionId: `s-${index}`,
      matchId: `m-${index}`,
      reachedAt: new Date(BASE_MS + index * 60_000),
    }));
    expect(
      progressOf(praisedEndedSessions(sessions.slice(0, 9)), "praised-10"),
    ).toMatchObject({ earned: false, current: 9 });
    expect(
      progressOf(praisedEndedSessions(sessions), "praised-10"),
    ).toMatchObject({ earned: true, earnedMatchId: "m-9", current: 10 });
  });

  it("칭찬 기록이 없으면 받지 않은 상태다", () => {
    expect(progressOf(new Map(), "praised-1")).toMatchObject({
      earned: false,
      current: 0,
    });
  });
});

describe("대회 업적", () => {
  const placedEndedSessions = (
    sessions: { sessionId: string; place: number; matchId: string; completedAt: Date }[],
  ): EndedSessions =>
    Object.assign(new Map<string, string | null>(), {
      placedSessionsByPlayerId: new Map([[ME, sessions]]),
    });

  const placementProgressOf = (endedSessions: EndedSessions, id: string) =>
    computeAchievements(ME, [], endedSessions).find((item) => item.id === id)!;

  it("대회 세션에서 한 첫 경기로 출사표를 받고, 대회가 아닌 세션 경기는 세지 않는다", () => {
    const regular = makeMatch({ sessionId: "s-regular", regular: true });
    const first = makeMatch({ won: false, sessionId: "s-cup", tournament: true });
    const second = makeMatch({ sessionId: "s-cup", tournament: true });
    expect(progressOf(compute([regular]), "tournament-entry")).toMatchObject({
      earned: false,
      current: 0,
    });
    expect(
      progressOf(compute([regular, first, second]), "tournament-entry"),
    ).toMatchObject({
      earned: true,
      earnedMatchId: first.id,
      earnedAt: first.completedAt,
      current: 1,
    });
  });

  it("출사표는 경기 저장으로 새로 받은 업적에 나온다", () => {
    const match = makeMatch({ sessionId: "s-cup", tournament: true });
    expect(
      findNewAchievements({ playerIds: [ME], before: [], after: [match] })
        .filter((item) => item.achievementId.startsWith("tournament-"))
        .map((item) => item.achievementId),
    ).toEqual(["tournament-entry"]);
  });

  it("3위 이내에 든 첫 대회로 포디움을, 1위인 첫 대회로 우승을 받는다(받은 경기·시각은 그 대회 내 마지막 경기)", () => {
    const thirdAt = new Date(BASE_MS + 60_000);
    const firstAt = new Date(BASE_MS + 120_000);
    const endedSessions = placedEndedSessions([
      { sessionId: "s-2", place: 1, matchId: "m-2", completedAt: firstAt },
      { sessionId: "s-1", place: 3, matchId: "m-1", completedAt: thirdAt },
    ]);
    expect(placementProgressOf(endedSessions, "tournament-podium")).toMatchObject({
      earned: true,
      earnedMatchId: "m-1",
      earnedAt: thirdAt,
      current: 2,
    });
    expect(
      placementProgressOf(endedSessions, "tournament-champion-1"),
    ).toMatchObject({
      earned: true,
      earnedMatchId: "m-2",
      earnedAt: firstAt,
      current: 1,
    });
  });

  it("3관왕은 세 번째 우승 대회로 받고, 그 전에는 진행도만 쌓인다", () => {
    const wins = Array.from({ length: 3 }, (_, index) => ({
      sessionId: `s-${index}`,
      place: 1,
      matchId: `m-${index}`,
      completedAt: new Date(BASE_MS + index * 60_000),
    }));
    expect(
      placementProgressOf(placedEndedSessions(wins.slice(0, 2)), "tournament-champion-3"),
    ).toMatchObject({ earned: false, current: 2 });
    expect(
      placementProgressOf(placedEndedSessions(wins), "tournament-champion-3"),
    ).toMatchObject({ earned: true, earnedMatchId: "m-2", current: 3 });
  });

  it("집계 시작 전 경기로 든 순위는 세지 않는다", () => {
    expect(
      placementProgressOf(
        placedEndedSessions([
          {
            sessionId: "s-old",
            place: 1,
            matchId: "m-old",
            completedAt: new Date("2026-11-20T00:00:00.000Z"),
          },
        ]),
        "tournament-champion-1",
      ),
    ).toMatchObject({ earned: false, current: 0 });
  });

  it("순위 업적은 경기 저장으로 새로 받은 업적에 나오지 않는다", () => {
    expect(
      findNewAchievements({
        playerIds: [ME],
        before: [],
        after: [makeMatch({ sessionId: "s-cup", tournament: true })],
      }).some((item) =>
        ["tournament-podium", "tournament-champion-1"].includes(item.achievementId),
      ),
    ).toBe(false);
  });
});

describe("모범생(규칙 안내 완독)", () => {
  const COMPLETED_AT = new Date("2026-11-26T09:00:00.000Z");
  const withRulesGuide = (
    completedAtByPlayerId: ReadonlyMap<string, Date>,
  ): EndedSessions =>
    Object.assign(new Map<string, string | null>(), {
      rulesGuideCompletedAtByPlayerId: completedAtByPlayerId,
    });

  it("입문 분류 10점이고 목표는 15장이다", () => {
    expect(
      ACHIEVEMENTS.find((item) => item.id === RULES_GUIDE_ACHIEVEMENT_ID),
    ).toMatchObject({
      category: "intro",
      name: "모범생",
      condition: "피클볼 기본 규칙 15장 모두 읽기",
      target: 15,
      points: 10,
    });
  });

  it("완독 시각이 있으면 경기 없이 그 시각에 받고 받은 경기는 없다", () => {
    const progress = computeAchievements(
      ME,
      [],
      withRulesGuide(new Map([[ME, COMPLETED_AT]])),
    );
    expect(progressOf(progress, RULES_GUIDE_ACHIEVEMENT_ID)).toMatchObject({
      earned: true,
      earnedAt: COMPLETED_AT,
      earnedMatchId: null,
      current: 15,
    });
    expect(toEarnedAchievements(ME, progress)).toEqual([
      {
        playerId: ME,
        achievementId: RULES_GUIDE_ACHIEVEMENT_ID,
        earnedMatchId: null,
        earnedAt: COMPLETED_AT,
      },
    ]);
  });

  it("다른 회원의 완독이나 완독 기록이 없으면 받지 않는다", () => {
    const progress = computeAchievements(
      ME,
      [makeMatch({})],
      withRulesGuide(new Map([["player-other", COMPLETED_AT]])),
    );
    expect(progressOf(progress, RULES_GUIDE_ACHIEVEMENT_ID)).toMatchObject({
      earned: false,
      current: 0,
    });
  });

  it("경기 저장으로 새로 받은 업적에는 나오지 않는다", () => {
    const match = makeMatch({});
    const earned = findNewAchievements({
      playerIds: [ME],
      before: [],
      after: [match],
    });
    expect(earned.map((item) => item.achievementId)).not.toContain(
      RULES_GUIDE_ACHIEVEMENT_ID,
    );
  });

  it("받은 경기 없이(null) 확인하면 확인한 것이고, 확인 기록이 없으면 미확인이다", () => {
    const earned: EarnedAchievement[] = [
      {
        playerId: ME,
        achievementId: RULES_GUIDE_ACHIEVEMENT_ID,
        earnedMatchId: null,
        earnedAt: COMPLETED_AT,
      },
    ];
    expect(findUnseenAchievements(earned, [])).toEqual(earned);
    expect(
      findUnseenAchievements(earned, [
        { achievementId: RULES_GUIDE_ACHIEVEMENT_ID, earnedMatchId: null },
      ]),
    ).toEqual([]);
  });
});
