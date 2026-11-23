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
  bestStreak: 1,
  streakBreaks: 0,
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
  it("세션 안 연승·승·득실을 세고, 승패가 안 갈린 경기는 연승을 끊는다", () => {
    const result = buildSessionPraisePlayerStats([
      match(["a"], ["b"], true),
      match(["a"], ["c"], true),
      match(["a"], ["b"], null),
      match(["a"], ["c"], true),
    ]);
    expect(result.get("a")).toEqual({
      matchCount: 4,
      wins: 3,
      bestStreak: 2,
      streakBreaks: 0,
      pointsFor: 11 + 11 + 9 + 11,
      pointsAgainst: 5 + 5 + 9 + 5,
    });
  });

  it("2연승 이상 중인 상대를 이기면 경기마다 한 번 연승 저지로 센다", () => {
    const result = buildSessionPraisePlayerStats([
      match(["x", "y"], ["p", "q"], true),
      match(["x", "y"], ["r", "s"], true),
      // x·y 둘 다 2연승 중: 한 경기라 한 번만 센다
      match(["g", "h"], ["x", "y"], true),
      match(["x", "z"], ["t", "u"], true),
      match(["x", "z"], ["v", "w"], true),
      match(["g", "k"], ["x", "z"], true),
    ]);
    expect(result.get("g")?.streakBreaks).toBe(2);
    expect(result.get("h")?.streakBreaks).toBe(1);
    expect(result.get("p")?.streakBreaks).toBe(0);
  });
});

describe("pickSessionPraiseCandidates", () => {
  it("우선순위대로 최대 3장을 고르고, 같은 사람은 높은 분류 한 장이다", () => {
    const picked = pickSessionPraiseCandidates({
      dominatorId: "dom",
      players: [
        input("dom", { ratingDelta: 0.1, stats: { bestStreak: 5, wins: 5 } }),
        input("streaker", { stats: { bestStreak: 4, wins: 4 } }),
        input("winner", { stats: { wins: 4, matchCount: 5 } }),
        input("scorer", { stats: { pointsFor: 99 } }),
      ],
    });
    expect(picked).toEqual([
      { playerId: "dom", category: "dominator", value: 0.1 },
      { playerId: "streaker", category: "winStreak", value: 4 },
      { playerId: "winner", category: "mostWins", value: 4 },
    ]);
  });

  it("문턱(3연승·저지 2번·3계단)을 넘지 못하면 그 분류는 건너뛴다", () => {
    const picked = pickSessionPraiseCandidates({
      dominatorId: null,
      players: [
        input("a", {
          rankBefore: 9,
          rankAfter: 7,
          stats: { bestStreak: 2, streakBreaks: 1, wins: 3, pointsFor: 40 },
        }),
        input("b", { stats: { wins: 1, pointsFor: 50 } }),
      ],
    });
    expect(picked.map((item) => item.category)).toEqual([
      "mostWins",
      "mostPoints",
    ]);
  });

  it("연승 문지기·순위 도약을 고른다", () => {
    const picked = pickSessionPraiseCandidates({
      dominatorId: null,
      players: [
        input("guard", { stats: { streakBreaks: 2, wins: 2 } }),
        input("jumper", { rankBefore: 10, rankAfter: 6, stats: { wins: 1 } }),
        input("other", { stats: { wins: 3 } }),
      ],
    });
    expect(picked).toEqual([
      { playerId: "guard", category: "streakGuard", value: 2 },
      { playerId: "other", category: "mostWins", value: 3 },
      { playerId: "jumper", category: "rankJump", value: 4 },
    ]);
  });

  it("최다 승리 동점은 승률 → 득실차 → 평점 변화 순으로 가린다", () => {
    const pick = (players: SessionPraisePlayerInput[]) =>
      pickSessionPraiseCandidates({ dominatorId: null, players })[0].playerId;
    expect(
      pick([
        input("many", { stats: { wins: 3, matchCount: 6 } }),
        input("few", { stats: { wins: 3, matchCount: 4 } }),
      ]),
    ).toBe("few");
    expect(
      pick([
        input("low", { stats: { wins: 3, pointsFor: 30, pointsAgainst: 20 } }),
        input("high", { stats: { wins: 3, pointsFor: 40, pointsAgainst: 20 } }),
      ]),
    ).toBe("high");
    expect(
      pick([
        input("flat", { ratingDelta: 0.01, stats: { wins: 3 } }),
        input("up", { ratingDelta: 0.05, stats: { wins: 3 } }),
      ]),
    ).toBe("up");
  });

  it("순위 도약 동점은 최종 순위가 높은 사람이다", () => {
    const picked = pickSessionPraiseCandidates({
      dominatorId: null,
      players: [
        input("a", { rankBefore: 12, rankAfter: 8, stats: { wins: 0, pointsFor: 0 } }),
        input("b", { rankBefore: 9, rankAfter: 5, stats: { wins: 0, pointsFor: 0 } }),
      ],
    });
    expect(picked).toEqual([{ playerId: "b", category: "rankJump", value: 4 }]);
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
