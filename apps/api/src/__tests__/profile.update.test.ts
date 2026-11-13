import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const now = new Date("2026-07-24T10:00:00.000Z");
const player: Player = {
  isGuest: false,
  id: "Pprofile",
  username: "profile-player",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
};
const session: AuthenticatedSession = {
  payload: { playerId: player.id, isAdmin: false },
  player,
  isFirstLogin: false,
};

describe("PATCH /api/me/profile", () => {
  beforeEach(() => {
    vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockResolvedValue(
      session,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("상태메시지와 대표 소속을 저장한다", async () => {
    const updatedPlayer: Player = {
      ...player,
      affiliations: [
        { name: "PKELO Gangnam", isPrimary: true },
        { name: "Weekend Club", isPrimary: false },
      ],
      statusMessage: "즐겁게 플레이해요",
      statusMessageBackgroundColor: "#D1FAE5",
    };
    const updateProfile = vi
      .spyOn(AuthService.prototype, "updatePlayerProfile")
      .mockResolvedValue(updatedPlayer);

    const response = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", "Bearer test-token")
      .send({
        affiliations: updatedPlayer.affiliations,
        statusMessage: "  즐겁게 플레이해요  ",
        statusMessageBackgroundColor: "#d1fae5",
      });

    expect(response.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith(player.id, {
      affiliations: updatedPlayer.affiliations,
      statusMessage: "즐겁게 플레이해요",
      statusMessageBackgroundColor: "#D1FAE5",
    });
    expect(response.body).toMatchObject({
      affiliations: updatedPlayer.affiliations,
      statusMessage: updatedPlayer.statusMessage,
      statusMessageBackgroundColor: updatedPlayer.statusMessageBackgroundColor,
    });
  });

  it("대표가 둘 이상인 소속 목록을 거부한다", async () => {
    const updateProfile = vi.spyOn(AuthService.prototype, "updatePlayerProfile");

    const response = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", "Bearer test-token")
      .send({
        affiliations: [
          { name: "PKELO Gangnam", isPrimary: true },
          { name: "Weekend Club", isPrimary: true },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("대표 소속을 하나 지정해 주세요.");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("임의의 avatarUrl 문자열을 받지 않는다", async () => {
    const updateProfile = vi.spyOn(AuthService.prototype, "updatePlayerProfile");

    const response = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", "Bearer test-token")
      .send({ avatarUrl: "https://evil.example/avatar.png" });

    expect(response.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
