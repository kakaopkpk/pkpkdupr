import type { ManagedMatchSession, Match, Team } from "@pkpkdupr/shared/match";
import type { MatchSessionRecommendationResponse } from "@pkpkdupr/shared/matchmaking";
import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const thursdayEvening = new Date("2026-11-12T19:00:00+09:00");

const makePlayer = (id: string, doubles: number | null): Player => ({
  id,
  username: `user-${id}`,
  gender: "M",
  status: "active",
  duprRating: doubles === null ? null : { singles: doubles, doubles },
  createdAt: thursdayEvening,
  updatedAt: thursdayEvening,
});

const players = Array.from({ length: 10 }, (_, index) =>
  makePlayer(`Pplayer${index}`, index === 9 ? null : 3 + index * 0.1),
);
const playerIds = players.map((player) => player.id);

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Stoday00",
  name: "정기 세션",
  date: new Date("2026-11-12T18:00:00+09:00"),
  location: "야탑초등학교",
  participantIds: playerIds,
  matchCount: 0,
  kind: "regular",
  startTime: null,
  endTime: null,
  createdAt: thursdayEvening,
  updatedAt: thursdayEvening,
  ...overrides,
});

const makeTeam = (name: string, ids: string[]): Team => ({
  id: name,
  name,
  players: ids.map((id) => players.find((player) => player.id === id)!),
});

const completedMatch = {
  id: "Mdone",
  status: "completed",
  teams: [
    makeTeam("Team A", [playerIds[0], playerIds[1]]),
    makeTeam("Team B", [playerIds[2], playerIds[3]]),
  ],
} as Match;

const collectIds = (body: MatchSessionRecommendationResponse) => ({
  courtIds: body.courts.flatMap((court) =>
    court.teams.flatMap((team) => team.players.map((player) => player.id)),
  ),
  restingIds: body.restingPlayers.map((player) => player.id),
});

describe("GET /api/match-sessions/:sessionId/recommendations", () => {
  let sessions: ManagedMatchSession[];
  let cleanupExpired: MockInstance<MatchRepository["cleanupExpired"]>;
  let findInProgressPlayerIds: MockInstance<
    MatchRepository["findInProgressPlayerIds"]
  >;

  const recommend = (sessionId: string, query = "") =>
    request(app)
      .get(`/api/match-sessions/${sessionId}/recommendations${query}`)
      .set("Authorization", "Bearer token");

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(thursdayEvening);
    sessions = [
      makeSession(),
      makeSession({
        id: "Spast000",
        date: new Date("2026-11-09T18:00:00+09:00"),
      }),
    ];

    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue({
      payload: { playerId: playerIds[0], isAdmin: false },
      player: players[0],
      isFirstLogin: false,
    } satisfies AuthenticatedSession);
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue(
      players,
    );
    cleanupExpired = vi
      .spyOn(MatchRepository.prototype, "cleanupExpired")
      .mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) => sessions.find((session) => session.id === sessionId),
    );
    findInProgressPlayerIds = vi
      .spyOn(MatchRepository.prototype, "findInProgressPlayerIds")
      .mockResolvedValue([]);
    vi.spyOn(MatchRepository.prototype, "findBySession").mockResolvedValue([
      completedMatch,
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("courts 생략 시 기본 3코트를 요청하고 서버가 정한 seed를 돌려준다", async () => {
    const response = await recommend("Stoday00");

    expect(response.status).toBe(200);
    const body = response.body as MatchSessionRecommendationResponse;
    expect(body.sessionId).toBe("Stoday00");
    expect(body.requestedCourts).toBe(3);
    expect(Number.isInteger(body.seed)).toBe(true);
    // 10명이라 2코트만 채워지고 2명이 쉰다
    expect(body.courts).toHaveLength(2);
    expect(body.restingPlayers).toHaveLength(2);
    expect(cleanupExpired).toHaveBeenCalled();

    const team = body.courts[0].teams[0];
    expect(typeof team.averageRating).toBe("number");
    expect(team.players[0]).toEqual({
      id: expect.any(String),
      username: expect.stringMatching(/^user-/),
      doublesRating: expect.toSatisfy(
        (value: unknown) => value === null || typeof value === "number",
      ),
    });
  });

  it("같은 courts·seed면 같은 결과를 낸다", async () => {
    const first = await recommend("Stoday00", "?courts=2&seed=42");
    const second = await recommend("Stoday00", "?courts=2&seed=42");

    expect(first.status).toBe(200);
    expect(first.body.seed).toBe(42);
    expect(second.body).toEqual(first.body);
  });

  it("진행 중 경기에 들어간 선수는 코트와 쉬는 사람 모두에서 뺀다", async () => {
    const busy = [playerIds[4], playerIds[5]];
    findInProgressPlayerIds.mockResolvedValue(busy);

    const response = await recommend("Stoday00", "?courts=4&seed=7");

    expect(response.status).toBe(200);
    const { courtIds, restingIds } = collectIds(response.body);
    expect(response.body.courts).toHaveLength(2);
    expect(restingIds).toEqual([]);
    expect(new Set(courtIds).size).toBe(8);
    for (const id of busy) {
      expect(courtIds).not.toContain(id);
      expect(restingIds).not.toContain(id);
    }
  });

  it("범위 밖 courts는 1~4로 자른다", async () => {
    const low = await recommend("Stoday00", "?courts=0&seed=1");
    const high = await recommend("Stoday00", "?courts=9&seed=1");

    expect(low.status).toBe(200);
    expect(low.body.requestedCourts).toBe(1);
    expect(low.body.courts).toHaveLength(1);
    expect(low.body.restingPlayers).toHaveLength(6);
    expect(high.status).toBe(200);
    expect(high.body.requestedCourts).toBe(4);
  });

  it.each([
    ["courts가 숫자가 아니면", "?courts=abc"],
    ["courts가 비어 있으면", "?courts="],
    ["seed가 정수가 아니면", "?seed=1.5"],
    ["seed가 숫자가 아니면", "?seed=abc"],
  ])("%s 400", async (_label, query) => {
    const response = await recommend("Stoday00", query);
    expect(response.status).toBe(400);
  });

  it("지난 세션이면 403, 없는 세션이면 404", async () => {
    expect((await recommend("Spast000")).status).toBe(403);
    expect((await recommend("Smissing")).status).toBe(404);
  });
});
