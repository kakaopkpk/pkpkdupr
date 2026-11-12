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
const thursdayAfternoon = new Date("2026-11-12T15:00:00+09:00");
const thursdayEvening = new Date("2026-11-12T19:00:00+09:00");

const makePlayer = (id: string, gender: Player["gender"]): Player => ({
  id,
  username: id.toLowerCase(),
  gender,
  status: "active",
  duprRating: null,
  createdAt: thursdayAfternoon,
  updatedAt: thursdayAfternoon,
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
  date: new Date("2026-11-12T00:00:00+09:00"),
  location: "탄천",
  participantIds: [],
  matchCount: 0,
  kind: "custom",
  createdAt: thursdayAfternoon,
  updatedAt: thursdayAfternoon,
  ...overrides,
});

const pastSession = makeSession({
  id: "Spast001",
  date: new Date("2026-11-11T00:00:00+09:00"),
});

const regularSession = makeSession({
  id: "Sregular",
  name: "목요 정기운동",
  date: new Date("2026-11-12T18:00:00+09:00"),
  location: "야탑초등학교",
  kind: "regular",
});

const doublesTeams = [
  { playerIds: [playerA.id, playerB.id] },
  { playerIds: [playerC.id, playerD.id] },
];

describe("POST /api/matches/start", () => {
  let createInProgress: MockInstance<MatchRepository["createInProgress"]>;
  let findOrCreateRegularSession: MockInstance<
    MatchRepository["findOrCreateRegularSession"]
  >;

  const startMatch = (body: object) =>
    request(app)
      .post("/api/matches/start")
      .set("Authorization", "Bearer token")
      .send(body);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(thursdayAfternoon);
    const sessions = [makeSession(), pastSession, regularSession];

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
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) => sessions.find((session) => session.id === sessionId),
    );
    findOrCreateRegularSession = vi
      .spyOn(MatchRepository.prototype, "findOrCreateRegularSession")
      .mockResolvedValue(regularSession);
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

  it("세션 없이 점수 없는 진행 중 경기를 만들고 201로 돌려준다", async () => {
    const response = await startMatch({ teams: doublesTeams });

    expect(response.status).toBe(201);
    const [input, now] = createInProgress.mock.calls[0]!;
    expect(now).toEqual(thursdayAfternoon);
    expect(input).toMatchObject({
      type: "mixed-doubles",
      status: "created",
      scores: [],
      source: "player_created",
      creatorPlayerId: requester.id,
      completedAt: null,
      location: "야탑초등학교",
    });
    expect(input.session).toBeUndefined();
    expect(input.matchStartsAt).toEqual(thursdayAfternoon);
    expect(findOrCreateRegularSession).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      id: "Mstarted",
      status: "created",
      scores: [],
    });
  });

  it("오늘 회원 세션 id면 그 세션에 넣고 세션 장소를 쓴다", async () => {
    const response = await startMatch({
      teams: doublesTeams,
      sessionId: "Scustom1",
    });

    expect(response.status).toBe(201);
    const [input] = createInProgress.mock.calls[0]!;
    expect(input.session?.id).toBe("Scustom1");
    expect(input.location).toBe("탄천");
  });

  it("장소를 주면 그 값을 쓴다", async () => {
    const response = await startMatch({
      teams: doublesTeams,
      sessionId: "Scustom1",
      location: "  다른 코트 ",
    });

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].location).toBe("다른 코트");
  });

  it("지난 세션 id면 시간 규칙을 따른다(정기 시간 아니면 세션 없음)", async () => {
    const response = await startMatch({
      teams: doublesTeams,
      sessionId: pastSession.id,
    });

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].session).toBeUndefined();
  });

  it("지난 세션 id라도 정기 시간이면 오늘 정기 세션에 넣는다", async () => {
    vi.setSystemTime(thursdayEvening);

    const response = await startMatch({
      teams: doublesTeams,
      sessionId: pastSession.id,
    });

    expect(response.status).toBe(201);
    expect(findOrCreateRegularSession).toHaveBeenCalledWith("2026-11-12");
    expect(createInProgress.mock.calls[0]![0].session?.id).toBe("Sregular");
  });

  it("없는 세션 id도 404 없이 시간 규칙을 따른다", async () => {
    const response = await startMatch({
      teams: doublesTeams,
      sessionId: "Smissing",
    });

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].session).toBeUndefined();
  });

  it("선수가 이미 다른 진행 중 경기에 있으면 409와 그 선수 아이디 문구를 돌려준다", async () => {
    createInProgress.mockResolvedValue({ conflictPlayerId: playerB.id });

    const response = await startMatch({ teams: doublesTeams });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "pplayerb님이 다른 경기 중이에요" });
  });

  it("두 팀 구성이 없으면 400을 반환한다", async () => {
    const response = await startMatch({ teams: [doublesTeams[0]] });

    expect(response.status).toBe(400);
    expect(createInProgress).not.toHaveBeenCalled();
  });

  it("유형에 맞지 않는 팀 구성이면 400을 반환한다", async () => {
    const response = await startMatch({
      teams: doublesTeams,
      type: "men-doubles",
    });

    expect(response.status).toBe(400);
    expect(createInProgress).not.toHaveBeenCalled();
  });
});
