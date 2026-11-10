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
};

describe("sensitive invite code response headers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["POST", "/api/auth/invite"],
    ["POST", "/api/admin/invite-codes"],
    ["POST", "/api/admin/invite-codes/"],
  ])("marks %s %s as sensitive", (method, path) => {
    expect(isSensitiveRequest({ method, path })).toBe(true);
  });

  it.each([
    ["GET", "/api/me"],
    ["GET", "/api/admin/invite-codes"],
    ["POST", "/api/matches"],
    ["DELETE", "/api/admin/matches/Mmatch01"],
  ])("does not mark %s %s", (method, path) => {
    expect(isSensitiveRequest({ method, path })).toBe(false);
  });

  it("sets no-store on invite code responses", async () => {
    vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockResolvedValue(
      adminSession,
    );
    vi.spyOn(AuthService.prototype, "createInviteCode").mockResolvedValue({
      code: "ABCD2345",
      expiresAt: "2026-08-18T00:00:00.000Z",
    });
    vi.spyOn(AuthService.prototype, "redeemInviteCode").mockResolvedValue(
      adminSession,
    );

    const responses = await Promise.all([
      request(app)
        .post("/api/admin/invite-codes")
        .set("Authorization", "Bearer admin-token"),
      request(app)
        .post("/api/auth/invite")
        .set("Authorization", "Bearer new-member-token")
        .send({ code: "ABCD2345" }),
      request(app)
        .post("/api/auth/invite")
        .set("Authorization", "Bearer new-member-token")
        .send({}),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      201, 201, 400,
    ]);
    for (const response of responses) {
      expect(response.headers["cache-control"]).toBe("no-store");
    }
  });

  it("calls the next middleware after setting the header", () => {
    const set = vi.fn();
    const next = vi.fn();
    sensitiveResponseHeaders(
      { method: "POST", path: "/api/auth/invite" } as any,
      { set } as any,
      next,
    );

    expect(set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalledOnce();
  });
});
