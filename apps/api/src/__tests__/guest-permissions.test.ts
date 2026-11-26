import { GUEST_FORBIDDEN_MESSAGE } from "@pkpkdupr/shared/auth";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const now = new Date("2026-11-12T10:00:00+09:00");

const makePlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  username: id,
  gender: "M",
  status: "active",
  isGuest: false,
  duprRating: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const guest = makePlayer("Pguest01", {
  username: "guest_kim",
  gender: null,
  isGuest: true,
});
const member = makePlayer("Pmember1");

const guestSession: AuthenticatedSession = {
  payload: { playerId: guest.id, isAdmin: false },
  player: guest,
  isFirstLogin: false,
};

const session: ManagedMatchSession = {
  id: "Scustom1",
  name: "번개",
  date: new Date("2026-11-12T00:00:00+09:00"),
  location: "탄천",
  participantIds: [],
  matchCount: 0,
  kind: "custom",
  autoCreated: false,
  startTime: null,
  endTime: null,
  completedAt: null,
  createdAt: now,
  updatedAt: now,
};

describe("게스트 로그인 쓰기 제한", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(guestSession);
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      session,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ["post", "/api/matches"],
    ["post", "/api/matches/start"],
    ["post", "/api/matches/Mmatch01/start"],
    ["put", "/api/matches/Mmatch01"],
    ["delete", "/api/matches/Mmatch01"],
    ["post", "/api/match-sessions"],
    ["post", "/api/match-sessions/regular/today"],
    ["post", "/api/match-sessions/Scustom1/matches"],
    ["post", "/api/match-sessions/Scustom1/complete"],
    ["post", "/api/match-sessions/Scustom1/guests"],
  ] as const)("%s %s는 403이다", async (method, path) => {
    const response = await request(app)
      [method](path)
      .set("Authorization", "Bearer token")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(GUEST_FORBIDDEN_MESSAGE);
  });

  it("다른 회원을 참여자로 넣거나 빼면 403이다", async () => {
    const addParticipants = vi.spyOn(
      MatchRepository.prototype,
      "addSessionParticipants",
    );
    const removeParticipant = vi.spyOn(
      MatchRepository.prototype,
      "removeSessionParticipant",
    );

    const added = await request(app)
      .post("/api/match-sessions/Scustom1/participants")
      .set("Authorization", "Bearer token")
      .send({ playerId: member.id });
    const removed = await request(app)
      .delete(`/api/match-sessions/Scustom1/participants/${member.id}`)
      .set("Authorization", "Bearer token");

    expect(added.status).toBe(403);
    expect(removed.status).toBe(403);
    expect(addParticipants).not.toHaveBeenCalled();
    expect(removeParticipant).not.toHaveBeenCalled();
  });

  it("본인은 세션에 참석하고 빠질 수 있다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(guest);
    const addParticipants = vi
      .spyOn(MatchRepository.prototype, "addSessionParticipants")
      .mockResolvedValue();
    const removeParticipant = vi
      .spyOn(MatchRepository.prototype, "removeSessionParticipant")
      .mockResolvedValue();

    const added = await request(app)
      .post("/api/match-sessions/Scustom1/participants")
      .set("Authorization", "Bearer token")
      .send({ playerId: guest.id });
    const removed = await request(app)
      .delete(`/api/match-sessions/Scustom1/participants/${guest.id}`)
      .set("Authorization", "Bearer token");

    expect(added.status).not.toBe(403);
    expect(removed.status).not.toBe(403);
    expect(addParticipants).toHaveBeenCalledWith("Scustom1", [guest.id]);
    expect(removeParticipant).toHaveBeenCalledWith("Scustom1", guest.id);
  });
});
