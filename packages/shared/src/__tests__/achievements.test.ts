import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATEGORY_LABEL,
  ACHIEVEMENTS,
  computeAchievements,
  findNewAchievements,
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
  type,
  sessionId,
  status = "completed",
  completedAt,
}: {
  won?: boolean;
  scoreA?: number;
  scoreB?: number;
  partnerId?: string;
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
        players: (doubles ? ["opp-1", "opp-2"] : ["opp-1"]).map((id) => ({
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
  it("업적 18개를 표 순서로 정의한다", () => {
    expect(ACHIEVEMENTS.map((definition) => definition.id)).toEqual([
      "matches-1",
      "matches-10",
      "matches-50",
      "matches-100",
      "matches-300",
      "wins-1",
      "wins-10",
      "wins-50",
      "wins-100",
      "streak-3",
      "streak-5",
      "streak-10",
      "perfect-win",
      "hard-won-10",
      "partner-20",
      "attendance-10",
      "attendance-30",
      "iron-8",
    ]);
    expect(new Set(ACHIEVEMENTS.map((item) => item.id)).size).toBe(18);
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

describe("computeAchievements", () => {
  it("경기가 없으면 18개 모두 진행도 0으로 받지 않은 상태다", () => {
    const progress = compute([]);
    expect(progress).toHaveLength(18);
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
