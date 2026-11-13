import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATEGORY_LABEL,
  ACHIEVEMENTS,
  computeAchievements,
  findNewAchievements,
  isBestStreakAchievement,
  type AchievementMatch,
  type AchievementProgress,
} from "../achievements";
import type { MatchStatus, MatchType } from "../match";

const ME = "player-me";
const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z");

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
    session: sessionId ? { id: sessionId } : null,
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

describe("ACHIEVEMENTS", () => {
  it("업적 34개를 표 순서로 정의한다", () => {
    expect(ACHIEVEMENTS.map((definition) => definition.id)).toEqual([
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
      "perfect-win",
      "hard-won-10",
      "partner-20",
      "partner-50",
      "combo-5",
      "social-10",
      "rival-20",
      "dojo-15",
      "revenge",
      "attendance-10",
      "attendance-30",
      "attendance-100",
      "iron-8",
      "unbeaten-session",
      "dominator-1",
      "dominator-10",
    ]);
    expect(new Set(ACHIEVEMENTS.map((item) => item.id)).size).toBe(34);
  });

  it("분류 이름은 경기 수·승리·연승·특별·세션이다", () => {
    expect(ACHIEVEMENT_CATEGORY_LABEL).toEqual({
      matches: "경기 수",
      wins: "승리",
      streak: "연승",
      special: "특별",
      session: "세션",
    });
  });
});

describe("isBestStreakAchievement", () => {
  it("연승과 환상의 콤비만 최고 연승 기록 업적이다", () => {
    expect(
      ACHIEVEMENTS.filter((definition) =>
        isBestStreakAchievement(definition.id),
      ).map((definition) => definition.id),
    ).toEqual(["streak-3", "streak-5", "streak-10", "streak-20", "combo-5"]);
  });
});

describe("computeAchievements", () => {
  it("경기가 없으면 34개 모두 진행도 0으로 받지 않은 상태다", () => {
    const progress = compute([]);
    expect(progress).toHaveLength(34);
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

  it("힘겹게 쟁취한 승리는 양 팀 10점 이상 경기에서 10번 이기면 받는다", () => {
    const hardWin = () => makeMatch({ won: true, scoreA: 12, scoreB: 10 });
    const noise = [
      // 상대가 9점이면 해당하지 않는다.
      makeMatch({ won: true, scoreA: 11, scoreB: 9 }),
      // 양 팀 10점 이상이어도 진 경기는 세지 않는다.
      makeMatch({ won: false, scoreA: 10, scoreB: 12 }),
    ];

    const below = [...noise, ...repeat(9, hardWin)];
    expect(progressOf(compute(below), "hard-won-10")).toMatchObject({
      earned: false,
      current: 9,
    });

    const tenth = hardWin();
    expect(
      progressOf(compute([...below, tenth]), "hard-won-10"),
    ).toMatchObject({
      earned: true,
      earnedMatchId: tenth.id,
      current: 10,
    });
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

  it("단짝 50경기는 같은 파트너와 복식 50경기에서 받는다", () => {
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

  it("리벤지는 파트너·상대가 같은 조합의 직전 경기에서 지고 다음 같은 조합 경기에서 이기면 받는다", () => {
    const lineup = (won: boolean) =>
      makeMatch({ won, partnerId: "mate", opponentIds: ["opp-1", "opp-2"] });
    const loss = lineup(false);
    const notRevenge = [
      loss,
      // 파트너가 다르거나 상대가 한 명이라도 다르면 다른 조합이다.
      makeMatch({ partnerId: "other", opponentIds: ["opp-1", "opp-2"] }),
      makeMatch({ partnerId: "mate", opponentIds: ["opp-1", "opp-3"] }),
    ];
    expect(progressOf(compute(notRevenge), "revenge")).toMatchObject({
      earned: false,
      current: 0,
    });

    // 상대 팀 선수 순서가 바뀌어도 같은 조합이다.
    const revenge = makeMatch({
      partnerId: "mate",
      opponentIds: ["opp-2", "opp-1"],
    });
    expect(
      progressOf(compute([...notRevenge, revenge]), "revenge"),
    ).toMatchObject({ earned: true, earnedMatchId: revenge.id, current: 1 });

    // 같은 조합의 직전 경기가 승리였으면 리벤지가 아니다.
    expect(
      progressOf(
        compute([lineup(false), lineup(true), lineup(true)]),
        "revenge",
      ).current,
    ).toBe(1);
  });

  it("리벤지는 단식에서 같은 상대에게 진 뒤 이겨도 받는다", () => {
    const matches = [
      makeMatch({ won: false, opponentIds: ["rival"] }),
      makeMatch({ won: true, opponentIds: ["rival"] }),
    ];
    expect(progressOf(compute(matches), "revenge")).toMatchObject({
      earned: true,
      earnedMatchId: matches[1].id,
    });
  });

  it("무패 세션은 한 세션에서 4경기 이상 모두 이기면 받고, 같은 세션에서 지면 받지 않은 상태다", () => {
    const inSession = (won: boolean, sessionId = "session-a") =>
      makeMatch({ won, sessionId });

    const three = repeat(3, () => inSession(true));
    expect(progressOf(compute(three), "unbeaten-session")).toMatchObject({
      earned: false,
      current: 0,
    });

    const fourth = inSession(true);
    const unbeaten = [...three, fourth, inSession(true)];
    expect(progressOf(compute(unbeaten), "unbeaten-session")).toMatchObject({
      earned: true,
      // 네 번째 경기에서 조건을 채운다.
      earnedMatchId: fourth.id,
      earnedAt: fourth.completedAt,
      current: 1,
    });

    // 같은 세션에서 한 번이라도 지면 무패 세션이 아니다.
    expect(
      progressOf(compute([...unbeaten, inSession(false)]), "unbeaten-session"),
    ).toMatchObject({
      earned: false,
      earnedAt: null,
      earnedMatchId: null,
      current: 0,
    });

    // 다른 세션의 패배는 영향이 없다.
    expect(
      progressOf(
        compute([...unbeaten, inSession(false, "session-b")]),
        "unbeaten-session",
      ),
    ).toMatchObject({ earned: true, earnedMatchId: fourth.id });
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
      new Set(["session-b", "session-a", "session-none"]),
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

  it("세션 지배자 10회는 열 번째 지배 세션에서 받는다", () => {
    const matches = Array.from({ length: 10 }, (_, index) =>
      makeMatch({ sessionId: `session-${index}` }),
    );
    const dominated = new Set(matches.map((_, index) => `session-${index}`));
    expect(
      progressOf(computeAchievements(ME, matches, dominated), "dominator-10"),
    ).toMatchObject({
      earned: true,
      earnedMatchId: matches[9].id,
      current: 10,
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
});
