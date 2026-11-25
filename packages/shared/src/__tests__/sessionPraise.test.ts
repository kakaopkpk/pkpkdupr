import { describe, expect, it } from "vitest";
import {
  buildSessionPraisePlayerStats,
  findPraiseReachedSessions,
  getSessionPraiseStatus,
  pickSessionPraiseCandidates,
  type SessionPraiseMatch,
  type SessionPraisePlayerInput,
  type SessionPraisePlayerStats,
} from "../sessionPraise";

const BASE_MS = Date.parse("2026-12-01T10:00:00.000Z");
let sequence = 0;

/** a팀이 이기면 11:5, 지면 5:11 */
const match = (
  teamA: string[],
  teamB: string[],
  aWins: boolean | null,
): SessionPraiseMatch => {
  sequence += 1;
  return {
    id: `m-${String(sequence).padStart(3, "0")}`,
    completedAt: new Date(BASE_MS + sequence * 60_000),
    teamPlayerIds: [teamA, teamB],
    scores:
      aWins === null
        ? [{ scoreA: 9, scoreB: 9 }]
        : [aWins ? { scoreA: 11, scoreB: 5 } : { scoreA: 5, scoreB: 11 }],
  };
};

const stats = (
  overrides: Partial<SessionPraisePlayerStats> = {},
): SessionPraisePlayerStats => ({
  matchCount: 4,
  wins: 2,
  streakBreaks: 0,
  bestBrokenStreak: 0,
  clutchWins: 0,
  underdogGap: 0,
  revenges: 0,
  pointsFor: 30,
  pointsAgainst: 30,
  ...overrides,
});

const input = (
  playerId: string,
  overrides: Partial<Omit<SessionPraisePlayerInput, "stats">> & {
    stats?: Partial<SessionPraisePlayerStats>;
  } = {},
): SessionPraisePlayerInput => ({
  playerId,
  username: playerId,
  ratingDelta: 0,
  rankBefore: null,
  rankAfter: null,
  ...overrides,
  stats: stats(overrides.stats),
});

describe("buildSessionPraisePlayerStats", () => {
  it("세션 경기만 넘기면 세션 안 승·득실을 센다", () => {
    const result = buildSessionPraisePlayerStats([
      match(["a"], ["b"], true),
      match(["a"], ["c"], true),
      match(["a"], ["b"], null),
      match(["a"], ["c"], true),
    ]);
    expect(result.get("a")).toEqual(
      stats({
        matchCount: 4,
        wins: 3,
        pointsFor: 11 + 11 + 9 + 11,
        pointsAgainst: 5 + 5 + 9 + 5,
      }),
    );
  });

  it("승패가 안 갈린 경기는 연승을 끊어 다음 경기는 저지가 아니다", () => {
    const result = buildSessionPraisePlayerStats([
      match(["a"], ["b"], true),
      match(["a"], ["b"], true),
      match(["a"], ["b"], true),
      match(["a"], ["b"], null),
      match(["c"], ["a"], true),
    ]);
    expect(result.get("c")?.streakBreaks).toBe(0);
  });

  it("경기 직전 3연승 이상인 상대를 이기면 경기마다 한 번 연승 저지로 센다", () => {
    const result = buildSessionPraisePlayerStats([
      match(["x", "y"], ["p", "q"], true),
      match(["x", "y"], ["r", "s"], true),
      // x·y 둘 다 2연승 중: 기준점(3연승) 전이라 저지가 아니다
      match(["m", "n"], ["x", "y"], true),
      match(["x", "z"], ["t", "u"], true),
      match(["x", "z"], ["v", "w"], true),
      match(["x", "z"], ["t", "w"], true),
      // x·z 둘 다 3연승 중: 한 경기라 한 번만 센다
      match(["g", "h"], ["x", "z"], true),
    ]);
    expect(result.get("m")?.streakBreaks).toBe(0);
    expect(result.get("g")).toMatchObject({ streakBreaks: 1, bestBrokenStreak: 3 });
    expect(result.get("h")).toMatchObject({ streakBreaks: 1, bestBrokenStreak: 3 });
  });

  it("끊은 연승은 경기마다 상대 중 큰 쪽이고, 세션에서 가장 긴 것을 남긴다", () => {
    const wins = (player: string, count: number) =>
      Array.from({ length: count }, () => match([player], ["z"], true));
    const result = buildSessionPraisePlayerStats([
      ...wins("p", 3),
      ...wins("q", 5),
      match(["g"], ["p"], true),
      match(["g"], ["q"], true),
    ]);
    expect(result.get("g")).toMatchObject({ streakBreaks: 2, bestBrokenStreak: 5 });
  });

  it("승부사는 이긴 게임에서 이긴 팀 12점 이상인 승리를 센다", () => {
    const deuce = (scoreA: number, scoreB: number): SessionPraiseMatch => ({
      ...match(["a"], ["b"], true),
      scores: [{ scoreA, scoreB }],
    });
    const result = buildSessionPraisePlayerStats([
      deuce(12, 10),
      deuce(15, 14),
      deuce(11, 9),
      deuce(10, 12),
    ]);
    expect(result.get("a")?.clutchWins).toBe(2);
    expect(result.get("b")?.clutchWins).toBe(1);
  });

  it("언더독은 평점 반영 승리의 직전 평점 차 최댓값(0.01 내림)이고, 평점이 없으면 3.0이다", () => {
    const rated = (
      teamA: string[],
      teamB: string[],
      ratingBefore: Record<string, number | null> | undefined,
      ratingExcluded = false,
    ): SessionPraiseMatch => ({
      ...match(teamA, teamB, true),
      ratingBefore,
      ratingExcluded,
    });
    const result = buildSessionPraisePlayerStats([
      rated(["a", "b"], ["c", "d"], { a: 3.0, b: 3.2, c: 3.3, d: 3.4 }),
      // 게스트가 낀 경기는 세지 않는다
      rated(["a", "b"], ["c", "d"], { a: 2.0, b: 2.0, c: 4.0, d: 4.0 }, true),
      // 평점 입력이 없으면 세지 않는다
      rated(["a", "b"], ["c", "d"], undefined),
      // 로그가 없는 선수(e)는 3.0
      rated(["e"], ["c"], { c: 3.3456 }),
    ]);
    expect(result.get("a")?.underdogGap).toBe(0.25);
    expect(result.get("e")?.underdogGap).toBe(0.34);
    expect(result.get("c")?.underdogGap).toBe(0);
  });

  it("리벤지 성공 경기의 이긴 팀만 복수자 횟수를 센다", () => {
    const result = buildSessionPraisePlayerStats([
      { ...match(["a"], ["b"], true), revengeSucceeded: true },
      { ...match(["a"], ["b"], true), revengeSucceeded: false },
    ]);
    expect(result.get("a")?.revenges).toBe(1);
    expect(result.get("b")?.revenges).toBe(0);
  });

  it("연승은 세션 밖 경기까지 이어 센 누적 연승이고, 기록은 세션 경기만 쌓는다", () => {
    const before = [
      match(["a"], ["b"], true),
      match(["a"], ["c"], true),
      // b는 세션 전 3연승
      match(["b"], ["d"], true),
      match(["b"], ["d"], true),
      match(["b"], ["d"], true),
    ];
    const first = match(["a"], ["b"], true);
    // 세션 경기 사이 세션 밖 경기도 누적 연승에 든다
    const outside = match(["a"], ["d"], true);
    const second = match(["a"], ["c"], true);
    const after = match(["a"], ["c"], true);
    const result = buildSessionPraisePlayerStats(
      [first, second],
      [...before, first, outside, second, after],
    );
    expect(result.get("a")).toMatchObject({
      matchCount: 2,
      wins: 2,
      streakBreaks: 1,
      bestBrokenStreak: 3,
    });
    expect(result.has("d")).toBe(false);
  });
});

describe("pickSessionPraiseCandidates", () => {
  const pick = (
    players: SessionPraisePlayerInput[],
    dominatorId: string | null = null,
  ) => pickSessionPraiseCandidates({ dominatorId, players });

  it("분류별 점수를 매긴다", () => {
    expect(
      pick(
        [
          input("dom", { ratingDelta: 0.06 }),
          input("guard1", { stats: { streakBreaks: 1, bestBrokenStreak: 5 } }),
          input("guard2", { stats: { streakBreaks: 3, bestBrokenStreak: 4 } }),
        ],
        "dom",
      ),
    ).toEqual([
      { playerId: "guard2", category: "streakGuard", value: 4, streakBreaks: 3, score: 26 },
      { playerId: "dom", category: "dominator", value: 0.06, score: 0.06 / 0.012 },
    ]);
    expect(
      pick([
        input("jump", { rankBefore: 12, rankAfter: 7 }),
        input("wins", { stats: { wins: 4 } }),
        input("points", { stats: { pointsFor: 58 } }),
      ]),
    ).toEqual([
      { playerId: "jump", category: "rankJump", value: 5, score: 10 },
      { playerId: "points", category: "mostPoints", value: 58, score: 8 },
      { playerId: "wins", category: "mostWins", value: 4, score: 7 },
    ]);
    expect(
      pick([
        input("clutch", { stats: { clutchWins: 2 } }),
        input("underdog", { stats: { underdogGap: 0.25 } }),
        input("revenge", { stats: { revenges: 2 } }),
      ]),
    ).toEqual([
      { playerId: "revenge", category: "revenge", value: 2, score: 13 },
      { playerId: "underdog", category: "underdog", value: 0.25, score: 13 },
      { playerId: "clutch", category: "clutch", value: 2, score: 9 },
    ]);
  });

  it("후보 조건을 넘지 못하면 그 분류는 후보가 아니다", () => {
    expect(
      pick([
        input("a", {
          rankBefore: 9,
          rankAfter: 7,
          stats: { wins: 2, pointsFor: 39, underdogGap: 0.14 },
        }),
      ]),
    ).toEqual([]);
  });

  it("점수 순으로 한 사람 한 장·한 분류 한 사람씩 최대 3장을 고른다", () => {
    const picked = pick([
      // 최다 승리 9점·최다 득점 7점 → 최다 승리로 나온다
      input("ace", { stats: { wins: 5, pointsFor: 50 } }),
      // 최다 승리 7점은 ace가 가져가 최다 득점 6점으로 나온다
      input("second", { stats: { wins: 4, pointsFor: 45 } }),
      input("clutch", { stats: { clutchWins: 1 } }),
      input("revenge", { stats: { revenges: 1 } }),
    ]);
    expect(picked.map(({ playerId, category }) => [playerId, category])).toEqual([
      ["ace", "mostWins"],
      ["second", "mostPoints"],
      ["revenge", "revenge"],
    ]);
  });

  it("점수가 같으면 드문 분류가 먼저다", () => {
    const picked = pick([
      input("wins", { stats: { wins: 3 } }),
      input("revenge", { stats: { revenges: 1 } }),
      input("points", { stats: { pointsFor: 40 } }),
    ]);
    expect(picked.map((item) => item.category)).toEqual([
      "revenge",
      "mostWins",
      "mostPoints",
    ]);
  });

  it("같은 분류·같은 점수면 분류별 동점 규칙으로 가린다", () => {
    const first = (players: SessionPraisePlayerInput[]) => pick(players)[0].playerId;
    expect(
      first([
        input("many", { stats: { wins: 3, matchCount: 6 } }),
        input("few", { stats: { wins: 3, matchCount: 4 } }),
      ]),
    ).toBe("few");
    expect(
      first([
        input("low", { stats: { wins: 3, pointsFor: 30, pointsAgainst: 20 } }),
        input("high", { stats: { wins: 3, pointsFor: 35, pointsAgainst: 20 } }),
      ]),
    ).toBe("high");
    expect(
      first([
        input("flat", { ratingDelta: 0.01, stats: { wins: 3 } }),
        input("up", { ratingDelta: 0.05, stats: { wins: 3 } }),
      ]),
    ).toBe("up");
    expect(
      first([
        input("a", { rankBefore: 12, rankAfter: 8 }),
        input("b", { rankBefore: 9, rankAfter: 5 }),
      ]),
    ).toBe("b");
  });

  it("세션 지배자는 dominatorId 회원만이다", () => {
    expect(pick([input("a", { ratingDelta: 0.1 })], null)).toEqual([]);
    expect(pick([input("a", { ratingDelta: 0.1 })], "a")[0].category).toBe(
      "dominator",
    );
  });
});

describe("getSessionPraiseStatus", () => {
  const endsAt = new Date(BASE_MS);
  it("끝나기 전·1시간 안·그 뒤를 나눈다", () => {
    expect(getSessionPraiseStatus(endsAt, new Date(BASE_MS - 1))).toBe("upcoming");
    expect(getSessionPraiseStatus(endsAt, endsAt)).toBe("open");
    expect(
      getSessionPraiseStatus(endsAt, new Date(BASE_MS + 3600_000 - 1)),
    ).toBe("open");
    expect(
      getSessionPraiseStatus(endsAt, new Date(BASE_MS + 3600_000)),
    ).toBe("closed");
  });
});

describe("findPraiseReachedSessions", () => {
  it("5개째 칭찬 시각으로 세션별 도달을 모은다", () => {
    const praises = Array.from({ length: 6 }, (_, index) => ({
      sessionId: "s-1",
      voterPlayerId: `v-${index}`,
      targetPlayerId: "t",
      createdAt: new Date(BASE_MS + (6 - index) * 1000),
    }));
    praises.push({
      sessionId: "s-2",
      voterPlayerId: "v-0",
      targetPlayerId: "t",
      createdAt: new Date(BASE_MS),
    });
    expect(findPraiseReachedSessions(praises).get("t")).toEqual([
      { sessionId: "s-1", reachedAt: new Date(BASE_MS + 5000) },
    ]);
  });
});
