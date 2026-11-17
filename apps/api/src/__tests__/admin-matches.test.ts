import type {
  AdminBatchMatchRequest,
  ManagedMatchSession,
  Match,
} from "@pkpkdupr/shared/match";
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

const now = new Date("2026-07-23T10:00:00.000Z");

const buildPlayer = (id: string, gender: Player["gender"]): Player => ({
  isGuest: false,
  id,
  username: id.replace("player-", ""),
  gender,
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
});

const admin = buildPlayer("player-admin", "M");
const playerA = buildPlayer("player-a", "M");
const playerB = buildPlayer("player-b", "M");
const playerC = buildPlayer("player-c", "F");
const playerD = buildPlayer("player-d", "F");

const adminSession: AuthenticatedSession = {
  payload: { playerId: admin.id, isAdmin: true },
  player: admin,
  isFirstLogin: false,
};

const buildMatch = (id: string, overrides: Partial<Match> = {}): Match => ({
  ratingExcluded: false,
  id,
  type: "singles",
  source: "player_created",
  creatorPlayerId: playerA.id,
  status: "completed",
  teams: [
    { id: `${id}-team-a`, name: "Team A", players: [playerA] },
    { id: `${id}-team-b`, name: "Team B", players: [playerC] },
  ],
  scores: [{ scoreA: 11, scoreB: 7 }],
  resultSubmittedByPlayerId: playerA.id,
  resultSubmittedAt: now,
  location: "야탑초등학교",
  matchStartsAt: now,
  completedAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe("관리자 경기 API", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(adminSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/admin/match-deletion-logs", () => {
    it("지운 시각 내림차순으로 지운 회원 아이디와 경기 스냅샷을 돌려준다", async () => {
      const newer = new Date("2026-07-22T12:00:00.000Z");
      const older = new Date("2026-07-20T12:00:00.000Z");
      vi.spyOn(MatchRepository.prototype, "findDeletionLogs").mockResolvedValue(
        [
          {
            id: "log-2",
            matchId: "Mnewer",
            deletedAt: newer,
            deletedByPlayerId: admin.id,
            deletedByAdmin: true,
            match: buildMatch("Mnewer"),
          },
          {
            id: "log-1",
            matchId: "Molder",
            deletedAt: older,
            deletedByPlayerId: "player-gone",
            deletedByAdmin: false,
            match: buildMatch("Molder"),
          },
        ],
      );
      vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([
        admin,
        playerA,
      ]);

      const response = await request(app)
        .get("/api/admin/match-deletion-logs")
        .set("Authorization", "Bearer admin-token");

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(2);
      expect(response.body.logs[0]).toMatchObject({
        id: "log-2",
        matchId: "Mnewer",
        deletedAt: newer.toISOString(),
        deletedByPlayerId: admin.id,
        deletedByUsername: admin.username,
        deletedByAdmin: true,
        match: { id: "Mnewer", status: "completed" },
      });
      // 지금 회원 목록에 없는 회원이 지운 기록은 아이디가 null이다
      expect(response.body.logs[1]).toMatchObject({
        id: "log-1",
        deletedByUsername: null,
        deletedByAdmin: false,
      });
    });

    it("관리자가 아니면 403이다", async () => {
      vi.spyOn(
        AuthService.prototype,
        "authenticateAccessToken",
      ).mockResolvedValue({
        ...adminSession,
        payload: { playerId: playerA.id, isAdmin: false },
      });
      const findDeletionLogs = vi.spyOn(
        MatchRepository.prototype,
        "findDeletionLogs",
      );

      const response = await request(app)
        .get("/api/admin/match-deletion-logs")
        .set("Authorization", "Bearer member-token");

      expect(response.status).toBe(403);
      expect(findDeletionLogs).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/admin/matches/batch", () => {
    const session: ManagedMatchSession = {
      id: "Ssession1",
      name: "월요 정기운동",
      date: now,
      location: "야탑초등학교",
      participantIds: [],
      matchCount: 0,
      kind: "regular",
      startTime: "18:00",
      endTime: "22:00",
      createdAt: now,
      updatedAt: now,
    };
    const batchBody: AdminBatchMatchRequest = {
      sessionId: session.id,
      matches: [
        {
          type: "singles",
          teams: [{ playerIds: [playerA.id] }, { playerIds: [playerC.id] }],
          location: "야탑초등학교",
          matchStartsAt: "2026-07-20T09:10:00.000Z",
          scores: [{ scoreA: 11, scoreB: 4 }],
        },
        {
          type: "unrestricted-doubles",
          teams: [
            { playerIds: [playerA.id, playerB.id] },
            { playerIds: [playerC.id, playerD.id] },
          ],
          location: "야탑초등학교",
          matchStartsAt: "2026-07-20T09:30:00.000Z",
          scores: [{ scoreA: 8, scoreB: 11 }],
        },
      ],
    };
    let addSessionParticipants: MockInstance<
      MatchRepository["addSessionParticipants"]
    >;
    let createCompletedBatch: MockInstance<
      MatchRepository["createCompletedBatch"]
    >;
    let applyMatchResults: MockInstance<
      AuthService["applyMatchResultsToRatings"]
    >;

    const postBatch = (body: object) =>
      request(app)
        .post("/api/admin/matches/batch")
        .set("Authorization", "Bearer admin-token")
        .send(body);

    beforeEach(() => {
      vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(admin);
      vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([
        admin,
        playerA,
        playerB,
        playerC,
        playerD,
      ]);
      vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
        async (sessionId) => (sessionId === session.id ? session : undefined),
      );
      addSessionParticipants = vi
        .spyOn(MatchRepository.prototype, "addSessionParticipants")
        .mockResolvedValue(undefined);
      createCompletedBatch = vi
        .spyOn(MatchRepository.prototype, "createCompletedBatch")
        .mockImplementation(async (matches) =>
          matches.map((match, index) => ({
            ...match,
            id: `Mbatch${index + 1}`,
            createdAt: now,
            updatedAt: now,
          })),
        );
      applyMatchResults = vi
        .spyOn(AuthService.prototype, "applyMatchResultsToRatings")
        .mockResolvedValue({ ratingChangeLogs: [], changedPlayerCount: 4 });
    });

    it("sessionId를 주면 경기를 모두 그 세션에 넣고 선수들을 참여자로 넣는다", async () => {
      const response = await postBatch(batchBody);

      expect(response.status).toBe(201);
      expect(addSessionParticipants).toHaveBeenCalledWith(session.id, [
        playerA.id,
        playerC.id,
        playerA.id,
        playerB.id,
        playerC.id,
        playerD.id,
      ]);
      expect(createCompletedBatch).toHaveBeenCalledTimes(1);
      const [created] = createCompletedBatch.mock.calls[0]!;
      expect(created.map((match) => match.session)).toEqual([
        {
          id: session.id,
          name: session.name,
          date: session.date,
          location: session.location,
        },
        {
          id: session.id,
          name: session.name,
          date: session.date,
          location: session.location,
        },
      ]);
      expect(applyMatchResults).toHaveBeenCalledTimes(1);
      expect(response.body).toMatchObject({
        createdCount: 2,
        completedMatchCount: 2,
        changedPlayerCount: 4,
        ratingChangeLogs: [],
      });
      expect(
        response.body.matches.map((match: Match) => match.session?.id),
      ).toEqual([session.id, session.id]);
    });

    it("없는 세션이면 400이고 아무것도 만들지 않는다", async () => {
      const response = await postBatch({ ...batchBody, sessionId: "Smissing" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "세션을 찾을 수 없어요." });
      expect(addSessionParticipants).not.toHaveBeenCalled();
      expect(createCompletedBatch).not.toHaveBeenCalled();
    });

    it("sessionId와 옛 session을 함께 보내면 400이다", async () => {
      const response = await postBatch({
        ...batchBody,
        session: {
          name: "새 세션",
          date: now.toISOString(),
          location: "야탑초등학교",
        },
      });

      expect(response.status).toBe(400);
      expect(addSessionParticipants).not.toHaveBeenCalled();
      expect(createCompletedBatch).not.toHaveBeenCalled();
    });

    it("옛 session 입력은 그대로 새 세션 정보로 저장하고 참여자는 넣지 않는다", async () => {
      const { sessionId: _sessionId, ...withoutSessionId } = batchBody;

      const response = await postBatch({
        ...withoutSessionId,
        session: {
          name: "번개 세션",
          date: now.toISOString(),
          location: "야탑초등학교",
        },
      });

      expect(response.status).toBe(201);
      const [created] = createCompletedBatch.mock.calls[0]!;
      expect(created[0]?.session).toMatchObject({ name: "번개 세션" });
      expect(addSessionParticipants).not.toHaveBeenCalled();
    });
  });
});
