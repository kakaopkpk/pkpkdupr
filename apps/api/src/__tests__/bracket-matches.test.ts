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
import {
  MATCH_ALREADY_STARTED_MESSAGE,
  MatchRepository,
  MatchRepositoryError,
} from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

// 2026-11-21(토) 대회 날
const tournamentDayMorning = new Date("2026-11-21T10:00:00+09:00");

const makePlayer = (id: string, gender: Player["gender"]): Player => ({
  isGuest: false,
  id,
  username: id.toLowerCase(),
  gender,
  status: "active",
  duprRating: null,
  createdAt: tournamentDayMorning,
  updatedAt: tournamentDayMorning,
});

const admin = makePlayer("Padminxx", "M");
const member = makePlayer("Pmemberx", "F");
const playerA = makePlayer("Pplayera", "M");
const playerB = makePlayer("Pplayerb", "F");
const playerC = makePlayer("Pplayerc", "M");
const playerD = makePlayer("Pplayerd", "F");
const allPlayers = [admin, member, playerA, playerB, playerC, playerD];

const asSession = (player: Player, isAdmin: boolean): AuthenticatedSession => ({
  payload: { playerId: player.id, isAdmin },
  player,
  isFirstLogin: false,
});

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Stourney",
  name: "가을 대회",
  date: new Date("2026-11-21T00:00:00+09:00"),
  location: "탄천",
  participantIds: [],
  matchCount: 0,
  kind: "tournament",
  autoCreated: false,
  startTime: "09:00",
  endTime: "17:00",
  completedAt: null,
  createdAt: tournamentDayMorning,
  updatedAt: tournamentDayMorning,
  ...overrides,
});

const makeBracketMatch = (overrides: Partial<Match> = {}): Match => ({
  id: "Mbracket",
  type: "mixed-doubles",
  source: "admin_created",
  creatorPlayerId: admin.id,
  session: {
    id: "Stourney",
    name: "가을 대회",
    date: new Date("2026-11-21T00:00:00+09:00"),
    location: "탄천",
  },
  status: "scheduled",
  round: 1,
  teams: [
    { id: "team-a", name: "Team A", players: [playerA, playerB] },
    { id: "team-b", name: "Team B", players: [playerC, playerD] },
  ],
  scores: [],
  resultSubmittedByPlayerId: null,
  resultSubmittedAt: null,
  location: "탄천",
  matchStartsAt: new Date("2026-11-21T09:00:00+09:00"),
  createdAt: tournamentDayMorning,
  completedAt: null,
  updatedAt: tournamentDayMorning,
  ratingExcluded: false,
  ...overrides,
});

const doublesTeams = [
  { playerIds: [playerA.id, playerB.id] },
  { playerIds: [playerC.id, playerD.id] },
];

describe("대회 대진 예정 경기", () => {
  let authenticate: MockInstance<AuthService["authenticateAccessToken"]>;
  let sessions: ManagedMatchSession[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(tournamentDayMorning);
    sessions = [makeSession()];
    authenticate = vi
      .spyOn(AuthService.prototype, "authenticateAccessToken")
      .mockResolvedValue(asSession(admin, true));
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue(
      allPlayers,
    );
    vi.spyOn(AuthService.prototype, "getPlayerById").mockImplementation(
      async (playerId) => allPlayers.find((player) => player.id === playerId),
    );
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) => sessions.find((session) => session.id === sessionId),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("POST /api/admin/match-sessions/:sessionId/bracket-matches", () => {
    let create: MockInstance<MatchRepository["create"]>;
    let addSessionParticipants: MockInstance<
      MatchRepository["addSessionParticipants"]
    >;

    const createBracketMatch = (body: object, sessionId = "Stourney") =>
      request(app)
        .post(`/api/admin/match-sessions/${sessionId}/bracket-matches`)
        .set("Authorization", "Bearer token")
        .send(body);

    beforeEach(() => {
      addSessionParticipants = vi
        .spyOn(MatchRepository.prototype, "addSessionParticipants")
        .mockResolvedValue();
      create = vi
        .spyOn(MatchRepository.prototype, "create")
        .mockImplementation(async (input) => ({
          ...input,
          id: "Mbracket",
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
    });

    it("대회 세션에 세션 시작 시각의 점수 없는 예정 경기를 만들고 선수를 참여자로 넣는다", async () => {
      const response = await createBracketMatch({
        round: 2,
        teams: doublesTeams,
      });

      expect(response.status).toBe(201);
      const [input] = create.mock.calls[0]!;
      expect(input).toMatchObject({
        type: "mixed-doubles",
        status: "scheduled",
        source: "admin_created",
        round: 2,
        scores: [],
        creatorPlayerId: admin.id,
        completedAt: null,
        resultSubmittedByPlayerId: null,
        location: "탄천",
        session: { id: "Stourney" },
      });
      expect(input.matchStartsAt).toEqual(
        new Date("2026-11-21T09:00:00+09:00"),
      );
      expect(addSessionParticipants).toHaveBeenCalledWith("Stourney", [
        playerA.id,
        playerB.id,
        playerC.id,
        playerD.id,
      ]);
      expect(addSessionParticipants.mock.invocationCallOrder[0]).toBeLessThan(
        create.mock.invocationCallOrder[0]!,
      );
      expect(response.body).toMatchObject({
        id: "Mbracket",
        status: "scheduled",
        round: 2,
      });
    });

    it("시작 시각 없는 세션은 세션 date를 경기 시각으로 쓰고, 1:1이면 단식이다", async () => {
      sessions = [makeSession({ startTime: null, endTime: null })];

      const response = await createBracketMatch({
        round: 1,
        teams: [{ playerIds: [playerA.id] }, { playerIds: [playerB.id] }],
      });

      expect(response.status).toBe(201);
      const [input] = create.mock.calls[0]!;
      expect(input.type).toBe("singles");
      expect(input.matchStartsAt).toEqual(
        new Date("2026-11-21T00:00:00+09:00"),
      );
    });

    it("세션이 없으면 404다", async () => {
      const response = await createBracketMatch(
        { round: 1, teams: doublesTeams },
        "Snothere",
      );

      expect(response.status).toBe(404);
      expect(create).not.toHaveBeenCalled();
    });

    it.each(["regular", "custom"] as const)(
      "%s 세션이면 409다",
      async (kind) => {
        sessions = [makeSession({ kind })];

        const response = await createBracketMatch({
          round: 1,
          teams: doublesTeams,
        });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe(
          "대회 세션에만 대진을 만들 수 있어요.",
        );
        expect(create).not.toHaveBeenCalled();
      },
    );

    it("만료 시각이 지난 세션이면 409다", async () => {
      sessions = [
        makeSession({ date: new Date("2026-11-20T00:00:00+09:00") }),
      ];

      const response = await createBracketMatch({
        round: 1,
        teams: doublesTeams,
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("끝난 세션에는 대진을 만들 수 없어요.");
      expect(addSessionParticipants).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it.each([0, -1, 1.5, "1", null, undefined])(
      "라운드가 %s면 400이다",
      async (round) => {
        const response = await createBracketMatch({
          round,
          teams: doublesTeams,
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe(
          "라운드는 1 이상 정수로 입력해 주세요.",
        );
        expect(create).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["팀이 하나", [{ playerIds: [playerA.id] }], "두 팀 구성이 필요합니다."],
      ["선수 없음", [{ playerIds: [] }, { playerIds: [] }], "참가자를 선택해주세요."],
      [
        "중복 선수",
        [{ playerIds: [playerA.id] }, { playerIds: [playerA.id] }],
        "중복된 멤버가 있습니다.",
      ],
      [
        "없는 선수",
        [{ playerIds: [playerA.id] }, { playerIds: ["Pnothere"] }],
        "유효하지 않은 멤버가 포함되어 있습니다.",
      ],
      [
        "1:2 팀",
        [{ playerIds: [playerA.id] }, { playerIds: [playerC.id, playerD.id] }],
        "유효한 팀 구성이 필요합니다.",
      ],
    ])("팀 구성 오류(%s)는 400이다", async (_label, teams, message) => {
      const response = await createBracketMatch({ round: 1, teams });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(message);
      expect(addSessionParticipants).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it("관리자가 아니면 403이다", async () => {
      authenticate.mockResolvedValue(asSession(member, false));

      const response = await createBracketMatch({
        round: 1,
        teams: doublesTeams,
      });

      expect(response.status).toBe(403);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/matches/:matchId/start", () => {
    let existing: Match;
    let startScheduled: MockInstance<MatchRepository["startScheduled"]>;

    const startBracketMatch = (matchId = existing.id) =>
      request(app)
        .post(`/api/matches/${matchId}/start`)
        .set("Authorization", "Bearer token")
        .send();

    beforeEach(() => {
      authenticate.mockResolvedValue(asSession(member, false));
      existing = makeBracketMatch();
      vi.spyOn(MatchRepository.prototype, "findById").mockImplementation(
        async (matchId) => (matchId === existing.id ? existing : undefined),
      );
      startScheduled = vi
        .spyOn(MatchRepository.prototype, "startScheduled")
        .mockImplementation(async (_matchId, now) => ({
          match: { ...existing, status: "created", matchStartsAt: now },
        }));
    });

    it("참가자가 아닌 활성 회원도 오늘 대회 세션의 예정 경기를 지금 시각으로 시작한다", async () => {
      const response = await startBracketMatch();

      expect(response.status).toBe(200);
      expect(startScheduled).toHaveBeenCalledWith(
        "Mbracket",
        tournamentDayMorning,
      );
      expect(response.body).toMatchObject({
        id: "Mbracket",
        status: "created",
        round: 1,
        matchStartsAt: tournamentDayMorning.toISOString(),
      });
    });

    it("경기가 없으면 404다", async () => {
      const response = await startBracketMatch("Mnothere");

      expect(response.status).toBe(404);
      expect(startScheduled).not.toHaveBeenCalled();
    });

    it.each(["created", "completed"] as const)(
      "이미 %s인 경기면 409다",
      async (status) => {
        existing = makeBracketMatch({ status });

        const response = await startBracketMatch();

        expect(response.status).toBe(409);
        expect(response.body.error).toBe(MATCH_ALREADY_STARTED_MESSAGE);
        expect(startScheduled).not.toHaveBeenCalled();
      },
    );

    it("그사이 다른 회원이 먼저 시작해 저장소가 409를 내면 409다", async () => {
      startScheduled.mockRejectedValue(
        new MatchRepositoryError(MATCH_ALREADY_STARTED_MESSAGE, 409),
      );

      const response = await startBracketMatch();

      expect(response.status).toBe(409);
      expect(response.body.error).toBe(MATCH_ALREADY_STARTED_MESSAGE);
    });

    it("경기 세션이 오늘 세션이 아니면 409다", async () => {
      vi.setSystemTime(new Date("2026-11-20T10:00:00+09:00"));

      const response = await startBracketMatch();

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("대회 날에만 경기를 시작할 수 있어요.");
      expect(startScheduled).not.toHaveBeenCalled();
    });

    it("선수 중 누가 다른 경기 중이면 그 아이디로 409다", async () => {
      startScheduled.mockResolvedValue({ conflictPlayerId: playerC.id });

      const response = await startBracketMatch();

      expect(response.status).toBe(409);
      expect(response.body.error).toBe(`${playerC.username}님이 다른 경기 중이에요`);
    });

    it("비활성 회원이면 403이다", async () => {
      vi.mocked(AuthService.prototype.getPlayerById).mockResolvedValue({
        ...member,
        status: "inactive",
      });

      const response = await startBracketMatch();

      expect(response.status).toBe(403);
      expect(startScheduled).not.toHaveBeenCalled();
    });
  });

  describe("경기 목록", () => {
    let findAll: MockInstance<MatchRepository["findAll"]>;

    beforeEach(() => {
      findAll = vi
        .spyOn(MatchRepository.prototype, "findAll")
        .mockResolvedValue({ matches: [makeBracketMatch()], total: 1 });
    });

    it("관리자 경기 목록은 예정 경기를 넣어 조회한다", async () => {
      const response = await request(app)
        .get("/api/admin/matches")
        .set("Authorization", "Bearer token");

      expect(response.status).toBe(200);
      expect(findAll).toHaveBeenCalledWith(0, 10000, undefined, {
        includeScheduled: true,
      });
      expect(response.body[0]).toMatchObject({ status: "scheduled", round: 1 });
    });

    it("GET /api/matches는 예정 경기를 넣지 않는 기본 조회를 쓴다", async () => {
      authenticate.mockResolvedValue(asSession(member, false));

      const response = await request(app)
        .get("/api/matches")
        .set("Authorization", "Bearer token");

      expect(response.status).toBe(200);
      expect(findAll).toHaveBeenCalledTimes(1);
      expect(findAll.mock.calls[0]![3]?.includeScheduled).toBeFalsy();
    });
  });
});
