import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const now = new Date("2026-07-31T10:00:00.000Z");
const admin: Player = {
  id: "admin-001",
  username: "admin",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
};
const adminSession: AuthenticatedSession = {
  payload: { playerId: admin.id, isAdmin: true },
  player: admin,
};

describe("GET /api/admin/diagnostics/timestamp-units", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(adminSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("관리자에게 원시 millisecond 경기 시작 시각과 영향 회원을 반환한다", async () => {
    vi.spyOn(MatchRepository.prototype, "getTimestampUnitAudit").mockResolvedValue(
      {
        legacyMatchStartsAtCount: 2,
        affectedPlayers: [
          {
            playerId: "player-001",
            username: "neiz.choi",
            completedMatchCount: 2,
            latestLegacyMatchStartsAt: 1_753_958_400_000,
          },
        ],
      },
    );

    const response = await request(app)
      .get("/api/admin/diagnostics/timestamp-units")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      legacyMatchStartsAtCount: 2,
      affectedPlayers: [
        {
          playerId: "player-001",
          username: "neiz.choi",
          completedMatchCount: 2,
          latestLegacyMatchStartsAt: 1_753_958_400_000,
        },
      ],
    });
  });

  it("관리자가 아니면 진단 정보를 반환하지 않는다", async () => {
    vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockResolvedValue({
      ...adminSession,
      payload: { playerId: admin.id, isAdmin: false },
    });

    const response = await request(app)
      .get("/api/admin/diagnostics/timestamp-units")
      .set("Authorization", "Bearer player-token");

    expect(response.status).toBe(403);
  });
});
