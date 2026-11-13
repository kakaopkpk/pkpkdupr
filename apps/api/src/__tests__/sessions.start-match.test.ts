import type { ManagedMatchSession, Match } from "@pkpkdupr/shared/match";
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

// 2026-11-12는 목요일(정기 세션 요일)이다.
const thursdayEvening = new Date("2026-11-12T19:00:00+09:00");
const thursdayLateNight = new Date("2026-11-12T22:30:00+09:00");

const makePlayer = (id: string, gender: Player["gender"]): Player => ({
  id,
  username: id,
  gender,
  status: "active",
  duprRating: null,
  createdAt: thursdayEvening,
  updatedAt: thursdayEvening,
});

const requester = makePlayer("Prequest", "M");
const playerA = makePlayer("Pplayera", "M");
const playerB = makePlayer("Pplayerb", "F");
const playerC = makePlayer("Pplayerc", "M");
const playerD = makePlayer("Pplayerd", "F");
const activePlayers = [requester, playerA, playerB, playerC, playerD];

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Scustom1",
  name: "번개",
  date: new Date("2026-11-12T09:00:00+09:00"),
  location: "탄천",
  participantIds: [],
  matchCount: 0,
  kind: "custom",
  startTime: null,
  endTime: null,
  createdAt: thursdayEvening,
  updatedAt: thursdayEvening,
  ...overrides,
});

const regularSession = makeSession({
  id: "Sregular",
  name: "정기 세션",
  date: new Date("2026-11-12T18:00:00+09:00"),
  location: "야탑초등학교",
  kind: "regular",
  startTime: null,
  endTime: null,
});

const doublesBody = {
  teams: [
    { playerIds: [playerA.id, playerB.id] },
    { playerIds: [playerC.id, playerD.id] },
  ],
};

describe("POST /api/match-sessions/:sessionId/matches", () => {
  let sessions: ManagedMatchSession[];
  let cleanupExpired: MockInstance<MatchRepository["cleanupExpired"]>;
  let createInProgress: MockInstance<MatchRepository["createInProgress"]>;
  let applyMatchResult: MockInstance<AuthService["applyMatchResultToRatings"]>;

  const startMatch = (sessionId: string, body: object = doublesBody) =>
    request(app)
      .post(`/api/match-sessions/${sessionId}/matches`)
      .set("Authorization", "Bearer token")
      .send(body);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(thursdayEvening);
    sessions = [makeSession(), regularSession];

    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue({
      payload: { playerId: requester.id, isAdmin: false },
      player: requester,
      isFirstLogin: false,
    } satisfies AuthenticatedSession);
    vi.spyOn(AuthService.prototype, "getPlayerById").mockImplementation(
      async (playerId) => activePlayers.find((player) => player.id === playerId),
    );
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue(
      activePlayers,
    );
    applyMatchResult = vi.spyOn(
      AuthService.prototype,
      "applyMatchResultToRatings",
    );
    cleanupExpired = vi
      .spyOn(MatchRepository.prototype, "cleanupExpired")
      .mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) => sessions.find((session) => session.id === sessionId),
    );
    vi.spyOn(
      MatchRepository.prototype,
      "findOrCreateRegularSession",
    ).mockResolvedValue(regularSession);
    createInProgress = vi
      .spyOn(MatchRepository.prototype, "createInProgress")
      .mockImplementation(async (input) => ({
        match: {
          ...input,
          id: "Mstarted",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Match,
      }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("점수 없는 진행 중 경기를 서버 시각으로 만들고 선수를 참여자로 추가한다", async () => {
    const response = await startMatch("Scustom1", {
      ...doublesBody,
      courtName: "코트 1",
    });

    expect(response.status).toBe(201);
    expect(cleanupExpired).toHaveBeenCalledWith(thursdayEvening);
    expect(cleanupExpired.mock.invocationCallOrder[0]).toBeLessThan(
      createInProgress.mock.invocationCallOrder[0]!,
    );
    const [input, now] = createInProgress.mock.calls[0]!;
    expect(now).toEqual(thursdayEvening);
    expect(input).toMatchObject({
      type: "mixed-doubles",
      status: "created",
      scores: [],
      source: "player_created",
      creatorPlayerId: requester.id,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      completedAt: null,
      location: "탄천",
      courtName: "코트 1",
      session: { id: "Scustom1" },
    });
    expect(input.matchStartsAt).toEqual(thursdayEvening);
    expect(
      input.teams.flatMap((team) => team.players.map((player) => player.id)),
    ).toEqual([playerA.id, playerB.id, playerC.id, playerD.id]);
    expect(applyMatchResult).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      id: "Mstarted",
      status: "created",
      scores: [],
      completedAt: null,
    });
  });

  it("장소를 주면 세션 장소 대신 그 값을 쓴다", async () => {
    const response = await startMatch("Scustom1", {
      ...doublesBody,
      location: "  다른 코트  ",
    });

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].location).toBe("다른 코트");
  });

  it("오늘 정기 세션 시간대면 정기 세션에 저장한다", async () => {
    const response = await startMatch("Sregular");

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].session?.id).toBe("Sregular");
  });

  it("22:00 KST 이후 정기 세션에서 시작하면 세션 없이 저장한다", async () => {
    vi.setSystemTime(thursdayLateNight);

    const response = await startMatch("Sregular");

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].session).toBeUndefined();
    expect(createInProgress.mock.calls[0]![0].location).toBe("야탑초등학교");
  });

  it("세션이 없으면 404를 반환한다", async () => {
    const response = await startMatch("Smissing");

    expect(response.status).toBe(404);
    expect(createInProgress).not.toHaveBeenCalled();
  });

  it("오늘 세션이 아니면 정기·회원 세션 모두 403을 반환한다", async () => {
    sessions = [
      makeSession({ date: new Date("2026-11-11T09:00:00+09:00") }),
      { ...regularSession, date: new Date("2026-11-09T18:00:00+09:00") },
    ];

    const custom = await startMatch("Scustom1");
    const regular = await startMatch("Sregular");

    expect(custom.status).toBe(403);
    expect(regular.status).toBe(403);
    expect(createInProgress).not.toHaveBeenCalled();
  });

  it("유효하지 않은 세션 ID면 400을 반환한다", async () => {
    const response = await startMatch("not-a-session");

    expect(response.status).toBe(400);
  });

  it("요청자가 팀에 없어도 시작할 수 있다", async () => {
    const response = await startMatch("Scustom1");

    expect(response.status).toBe(201);
    expect(
      createInProgress.mock.calls[0]![0].teams.flatMap((team) =>
        team.players.map((player) => player.id),
      ),
    ).not.toContain(requester.id);
  });

  it("이미 진행 중인 경기에 들어간 선수가 있으면 409를 반환한다", async () => {
    createInProgress.mockResolvedValue({ conflictPlayerId: playerC.id });

    const response = await startMatch("Scustom1");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Pplayerc님이 다른 경기 중이에요" });
  });

  it("유형에 맞지 않는 팀 구성이면 400을 반환한다", async () => {
    const response = await startMatch("Scustom1", {
      ...doublesBody,
      type: "men-doubles",
    });

    expect(response.status).toBe(400);
    expect(createInProgress).not.toHaveBeenCalled();
  });

  it("활성 회원이 아닌 선수가 있으면 400을 반환한다", async () => {
    const response = await startMatch("Scustom1", {
      teams: [
        { playerIds: [playerA.id, playerB.id] },
        { playerIds: [playerC.id, "Pinactiv"] },
      ],
    });

    expect(response.status).toBe(400);
    expect(createInProgress).not.toHaveBeenCalled();
  });
});
