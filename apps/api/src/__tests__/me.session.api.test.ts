import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import {
  AuthService,
  InvalidAccessTokenError,
  type AuthenticatedSession,
} from "../services/AuthService";

const player: Player = {
  isGuest: false,
  id: "Psession",
  username: "session-player",
  gender: "F",
  status: "active",
  duprRating: null,
  createdAt: new Date("2026-08-04T00:00:00.000Z"),
  updatedAt: new Date("2026-08-04T00:00:00.000Z"),
};

const session: AuthenticatedSession = {
  payload: { playerId: player.id, isAdmin: true },
  player,
  isFirstLogin: false,
};

describe("GET /api/me session contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("유효한 세션은 플레이어 정보와 관리자 여부·첫 로그인 여부를 반환한다", async () => {
    const authenticate = vi
      .spyOn(AuthService.prototype, "authenticateAccessToken")
      .mockResolvedValue({ ...session, isFirstLogin: true });

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: player.id,
      isAdmin: true,
      isFirstLogin: true,
    });
    expect(response.body).not.toHaveProperty("accessToken");
    expect(authenticate).toHaveBeenCalledWith("valid-token");
  });

  it("Authorization 헤더가 없으면 SESSION_INVALID와 함께 401을 반환한다", async () => {
    const response = await request(app).get("/api/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "로그인이 필요합니다.",
      code: "SESSION_INVALID",
    });
  });

  it("실제 무효 세션만 SESSION_INVALID와 함께 401을 반환한다", async () => {
    vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockRejectedValue(
      new InvalidAccessTokenError("세션이 만료되었거나 유효하지 않습니다."),
    );

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer expired-token");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "세션이 만료되었거나 유효하지 않습니다.",
      code: "SESSION_INVALID",
    });
  });

  it("저장소 장애는 SESSION_UNAVAILABLE과 함께 503을 반환한다", async () => {
    vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockRejectedValue(
      new Error("Auth 서버 요청 실패"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "세션을 일시적으로 확인하지 못했습니다.",
      code: "SESSION_UNAVAILABLE",
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});
