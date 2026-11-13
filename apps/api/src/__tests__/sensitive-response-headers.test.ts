import request from "supertest";
import type { Player } from "@pkpkdupr/shared/player";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import {
  isSensitiveRequest,
  sensitiveResponseHeaders,
} from "../middleware/sensitiveResponseHeaders";
import { AuthService } from "../services/AuthService";
import type { AuthenticatedSession } from "../services/AuthService";

const player: Player = {
  isGuest: false,
  id: "Pplayer1",
  username: "player",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: new Date("2026-08-11T00:00:00.000Z"),
  updatedAt: new Date("2026-08-11T00:00:00.000Z"),
};

const adminSession: AuthenticatedSession = {
  payload: { playerId: player.id, isAdmin: true },
  player,
  isFirstLogin: false,
};

describe("sensitive password response headers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["POST", "/api/admin/register"],
    ["POST", "/api/admin/register/"],
    ["POST", "/api/admin/players/Pplayer1/password-reset"],
  ])("marks %s %s as sensitive", (method, path) => {
    expect(isSensitiveRequest({ method, path })).toBe(true);
  });

  it.each([
    ["GET", "/api/me"],
    ["POST", "/api/auth/invite"],
    ["POST", "/api/admin/invite-codes"],
    ["PATCH", "/api/admin/players/Pplayer1/username"],
    ["POST", "/api/admin/players/Pplayer1/password-reset/extra"],
    ["POST", "/api/matches"],
    ["DELETE", "/api/admin/matches/Mmatch01"],
  ])("does not mark %s %s", (method, path) => {
    expect(isSensitiveRequest({ method, path })).toBe(false);
  });

  it("sets no-store on responses carrying a password", async () => {
    vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockResolvedValue(
      adminSession,
    );
    vi.spyOn(AuthService.prototype, "registerAdmin").mockResolvedValue({
      player,
      initialPassword: "Abcd2345ef",
    });
    vi.spyOn(AuthService.prototype, "resetPlayerPassword").mockResolvedValue({
      temporaryPassword: "Abcd2345ef",
    });

    const responses = await Promise.all([
      request(app)
        .post("/api/admin/register")
        .set("Authorization", "Bearer admin-token")
        .send({ username: "new_member", gender: "M" }),
      request(app)
        .post("/api/admin/register")
        .set("Authorization", "Bearer admin-token")
        .send({}),
      request(app)
        .post(`/api/admin/players/${player.id}/password-reset`)
        .set("Authorization", "Bearer admin-token"),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      200, 400, 200,
    ]);
    for (const response of responses) {
      expect(response.headers["cache-control"]).toBe("no-store");
    }
  });

  it("calls the next middleware after setting the header", () => {
    const set = vi.fn();
    const next = vi.fn();
    sensitiveResponseHeaders(
      { method: "POST", path: "/api/admin/register" } as any,
      { set } as any,
      next,
    );

    expect(set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalledOnce();
  });
});
