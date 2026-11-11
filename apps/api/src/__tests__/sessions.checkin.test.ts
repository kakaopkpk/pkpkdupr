import type { Player } from "@pkpkdupr/shared/player";
import type { ManagedMatchSession, Session } from "@pkpkdupr/shared/match";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

// 2026-11-12는 목요일(정기 세션 요일)이다.
const thursdayMorning = new Date("2026-11-12T10:00:00+09:00");
const thursdayNight = new Date("2026-11-12T22:00:00+09:00");

const makePlayer = (
  id: string,
  overrides: Partial<Player> = {},
): Player => ({
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: { singles: 3.5, doubles: 3.6 },
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
  ...overrides,
});

const requester = makePlayer("Pmember1");
const other = makePlayer("Pmember2", { gender: "F", duprRating: null });
const inactive = makePlayer("Pinactiv", { status: "inactive" });

const requesterSession: AuthenticatedSession = {
  payload: { playerId: requester.id, isAdmin: false },
  player: requester,
  isFirstLogin: false,
};

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
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
  ...overrides,
});

const regularSession = makeSession({
  id: "Sregular",
  name: "정기 세션",
  date: new Date("2026-11-12T18:00:00+09:00"),
  location: "야탑초등학교",
  kind: "regular",
});

const useNow = (now: Date) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
};

describe("public match sessions", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(requesterSession);
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([
      requester,
      other,
    ]);
    vi.spyOn(AuthService.prototype, "getPlayerById").mockImplementation(
      async (playerId) =>
        [requester, other, inactive].find((player) => player.id === playerId),
    );
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    useNow(thursdayMorning);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("정기 세션 생성 전에는 오늘 세션 조회만으로 정기 세션을 만들지 않는다", async () => {
    const findOrCreate = vi.spyOn(
      MatchRepository.prototype,
      "findOrCreateRegularSession",
    );
    const findByDateKey = vi
      .spyOn(MatchRepository.prototype, "findSessionsByDateKey")
      .mockResolvedValue([]);

    const response = await request(app)
      .get("/api/match-sessions/today")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dateKey: "2026-11-12",
      regularSessionOpen: true,
      sessions: [],
    });
    expect(findByDateKey).toHaveBeenCalledWith("2026-11-12");
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it("정기 세션이 있으면 맨 앞에 두고 active 참여자만 평점·성별과 함께 돌려준다", async () => {
    vi.spyOn(
      MatchRepository.prototype,
      "findSessionsByDateKey",
    ).mockResolvedValue([
      makeSession({ participantIds: [other.id, inactive.id] }),
      { ...regularSession, participantIds: [requester.id], matchCount: 2 },
    ]);

    const response = await request(app)
      .get("/api/match-sessions/today")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      "Sregular",
      "Scustom1",
    ]);
    expect(response.body.sessions[0]).toMatchObject({
      kind: "regular",
      dateKey: "2026-11-12",
      isToday: true,
      matchCount: 2,
      participants: [
        {
          id: requester.id,
          username: requester.username,
          gender: "M",
          duprRating: { singles: 3.5, doubles: 3.6 },
        },
      ],
    });
    expect(response.body.sessions[1].participants).toEqual([
      { id: other.id, username: other.username, gender: "F", duprRating: null },
    ]);
  });

  it("오늘 정기 세션을 find-or-create 한다", async () => {
    const findOrCreate = vi
      .spyOn(MatchRepository.prototype, "findOrCreateRegularSession")
      .mockResolvedValue(regularSession);
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      regularSession,
    );

    const response = await request(app)
      .post("/api/match-sessions/regular/today")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(findOrCreate).toHaveBeenCalledWith("2026-11-12");
    expect(response.body).toMatchObject({
      id: "Sregular",
      kind: "regular",
      isToday: true,
      participants: [],
    });
  });

  it("22시 이후나 정기 요일이 아니면 정기 세션을 열지 않는다(409)", async () => {
    const findOrCreate = vi.spyOn(
      MatchRepository.prototype,
      "findOrCreateRegularSession",
    );

    for (const now of [
      thursdayNight,
      new Date("2026-11-10T10:00:00+09:00"),
    ]) {
      vi.setSystemTime(now);
      const response = await request(app)
        .post("/api/match-sessions/regular/today")
        .set("Authorization", "Bearer token");
      expect(response.status).toBe(409);
    }
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it("회원 세션을 오늘 날짜로 만들고 요청자를 자동 체크인하지 않는다", async () => {
    const created: Session = {
      id: "Scustom1",
      name: "번개",
      date: thursdayMorning,
      location: "탄천",
    };
    const createSession = vi
      .spyOn(MatchRepository.prototype, "createSession")
      .mockResolvedValue(created);
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      makeSession({ date: thursdayMorning }),
    );
    const addParticipants = vi.spyOn(
      MatchRepository.prototype,
      "addSessionParticipants",
    );

    const response = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({ name: "  번개 ", location: " 탄천 " });

    expect(response.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith({
      name: "번개",
      date: thursdayMorning,
      location: "탄천",
    });
    expect(addParticipants).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      id: "Scustom1",
      kind: "custom",
      isToday: true,
      participants: [],
    });
  });

  it("회원 세션 이름·장소가 비어 있으면 400", async () => {
    const createSession = vi.spyOn(MatchRepository.prototype, "createSession");

    for (const body of [
      { name: " ", location: "탄천" },
      { name: "번개", location: "" },
    ]) {
      const response = await request(app)
        .post("/api/match-sessions")
        .set("Authorization", "Bearer token")
        .send(body);
      expect(response.status).toBe(400);
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("세션 상세는 지난 세션도 조회하고, 없으면 404·형식 오류면 400", async () => {
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) =>
        sessionId === "Spast001"
          ? makeSession({
              id: "Spast001",
              date: new Date("2026-11-09T18:00:00+09:00"),
            })
          : undefined,
    );

    const past = await request(app)
      .get("/api/match-sessions/Spast001")
      .set("Authorization", "Bearer token");
    expect(past.status).toBe(200);
    expect(past.body).toMatchObject({ dateKey: "2026-11-09", isToday: false });

    const missing = await request(app)
      .get("/api/match-sessions/Snone001")
      .set("Authorization", "Bearer token");
    expect(missing.status).toBe(404);

    const invalid = await request(app)
      .get("/api/match-sessions/not-a-session")
      .set("Authorization", "Bearer token");
    expect(invalid.status).toBe(400);
  });

  describe("참여자 추가·삭제", () => {
    let participantIds: Set<string>;
    let sessionDate: Date;

    beforeEach(() => {
      participantIds = new Set();
      sessionDate = new Date("2026-11-12T09:00:00+09:00");
      vi.spyOn(
        MatchRepository.prototype,
        "findSessionById",
      ).mockImplementation(async () =>
        makeSession({ date: sessionDate, participantIds: [...participantIds] }),
      );
      vi.spyOn(
        MatchRepository.prototype,
        "addSessionParticipants",
      ).mockImplementation(async (_sessionId, playerIds) => {
        playerIds.forEach((playerId) => participantIds.add(playerId));
      });
      vi.spyOn(
        MatchRepository.prototype,
        "removeSessionParticipant",
      ).mockImplementation(async (_sessionId, playerId) => {
        participantIds.delete(playerId);
      });
    });

    const add = (playerId: string) =>
      request(app)
        .post("/api/match-sessions/Scustom1/participants")
        .set("Authorization", "Bearer token")
        .send({ playerId });

    const remove = (playerId: string) =>
      request(app)
        .delete(`/api/match-sessions/Scustom1/participants/${playerId}`)
        .set("Authorization", "Bearer token");

    it("다른 회원도 대신 추가할 수 있고, 같은 회원을 다시 추가해도 200(멱등)", async () => {
      const first = await add(other.id);
      expect(first.status).toBe(200);
      expect(first.body.participants.map((p: { id: string }) => p.id)).toEqual([
        other.id,
      ]);

      const again = await add(other.id);
      expect(again.status).toBe(200);
      expect(again.body.participants).toHaveLength(1);
    });

    it("동시 추가 요청은 전체 교체 없이 개별 추가만 써서 둘 다 남는다", async () => {
      const replace = vi.spyOn(
        MatchRepository.prototype,
        "replaceSessionParticipants",
      );

      const responses = await Promise.all([add(requester.id), add(other.id)]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect([...participantIds].sort()).toEqual(
        [requester.id, other.id].sort(),
      );
      expect(replace).not.toHaveBeenCalled();
    });

    it("참여자를 삭제하고, 참여 중이 아니어도 200(멱등)", async () => {
      participantIds.add(other.id);

      const removed = await remove(other.id);
      expect(removed.status).toBe(200);
      expect(removed.body.participants).toEqual([]);

      const again = await remove(other.id);
      expect(again.status).toBe(200);
    });

    it("오늘 세션이 아니면 추가·삭제 모두 403", async () => {
      sessionDate = new Date("2026-11-09T18:00:00+09:00");

      expect((await add(other.id)).status).toBe(403);
      expect((await remove(other.id)).status).toBe(403);
      expect(
        MatchRepository.prototype.addSessionParticipants,
      ).not.toHaveBeenCalled();
      expect(
        MatchRepository.prototype.removeSessionParticipant,
      ).not.toHaveBeenCalled();
    });

    it("inactive·없는 회원은 추가하지 않는다(400)", async () => {
      expect((await add(inactive.id)).status).toBe(400);
      expect((await add("Pnobody1")).status).toBe(400);
      expect((await add("")).status).toBe(400);
      expect(
        MatchRepository.prototype.addSessionParticipants,
      ).not.toHaveBeenCalled();
    });
  });
});
