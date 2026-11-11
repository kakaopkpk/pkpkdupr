import type { Player } from "@pkpkdupr/shared/player";
import type { Match } from "@pkpkdupr/shared/match";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const now = new Date("2026-07-23T10:00:00.000Z");
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
  isFirstLogin: false,
};

describe("GET /api/admin/ratings/comparison", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(adminSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("기존 방식과 신규 방식의 회원별 레이팅을 반환한다", async () => {
    vi.spyOn(MatchRepository.prototype, "findAll").mockResolvedValue({
      matches: [],
      total: 0,
    });
    const recalculateSpy = vi
      .spyOn(AuthService.prototype, "recalculateDuprRatings")
      .mockResolvedValue({
        ratingChangeLogs: [],
        perMatchLogs: [],
        changedPlayerCount: 0,
        restoredMatchDuprSnapshotCount: 0,
        restoredMatchDuprSnapshotMatchCount: 0,
        perMatchLogCount: 0,
      });
    vi.spyOn(
      AuthService.prototype,
      "compareRatingMethods",
    ).mockResolvedValue({
      completedMatchCount: 12,
      players: [
        {
          playerId: "player-001",
          username: "player",
          currentRating: { singles: 3, doubles: 3.3 },
          legacyRating: { singles: 3, doubles: 3.1 },
          scorePerformanceRating: { singles: 3, doubles: 3.3 },
          difference: { singles: 0, doubles: 0.2 },
          relatedMatchCount: 12,
        },
      ],
    });

    const response = await request(app)
      .get("/api/admin/ratings/comparison")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      completedMatchCount: 12,
      players: [
        {
          username: "player",
          currentRating: { singles: 3, doubles: 3.3 },
          legacyRating: { singles: 3, doubles: 3.1 },
          scorePerformanceRating: { singles: 3, doubles: 3.3 },
          difference: { singles: 0, doubles: 0.2 },
        },
      ],
    });
    expect(recalculateSpy).toHaveBeenCalledWith([]);
  });

  it("현재 저장값이 신규 방식과 같아도 기존 방식과 신규 방식의 차이를 유지한다", async () => {
    const storedPlayers = [
      { id: "winner-a", doubles: 3.016 },
      { id: "winner-b", doubles: 3.016 },
      { id: "loser-a", doubles: 2.984 },
      { id: "loser-b", doubles: 2.984 },
    ].map(
      ({ id, doubles }) =>
        ({
          id,
          username: id,
          gender: "M",
          status: "active",
          duprRating: { singles: 3, doubles },
          authUserId: null,
          createdAt: now,
          updatedAt: now,
        }) satisfies Player & {
          authUserId: string | null;
        },
    );
    const playerById = new Map(
      storedPlayers.map((storedPlayer) => [storedPlayer.id, storedPlayer]),
    );
    const completedMatch: Match = {
      id: "match-comparison",
      type: "men-doubles",
      mode: "single-game",
      source: "player_created",
      creatorPlayerId: "winner-a",
      status: "completed",
      teams: [
        {
          id: "team-a",
          name: "Team A",
          players: [
            playerById.get("winner-a")!,
            playerById.get("winner-b")!,
          ],
        },
        {
          id: "team-b",
          name: "Team B",
          players: [
            playerById.get("loser-a")!,
            playerById.get("loser-b")!,
          ],
        },
      ],
      scores: [{ scoreA: 11, scoreB: 9 }],
      resultSubmittedByPlayerId: "winner-a",
      resultSubmittedAt: now,
      location: "Court",
      matchStartsAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    vi.spyOn(db.players, "findAll").mockResolvedValue(storedPlayers as any);
    vi.spyOn(db.officialDuprAdjustmentLogs, "findAll").mockResolvedValue([]);

    const comparison = await new AuthService().compareRatingMethods([
      completedMatch,
    ]);
    const winner = comparison.players.find(
      (comparisonPlayer) => comparisonPlayer.playerId === "winner-a",
    );

    expect(winner?.currentRating?.doubles).toBe(3.016);
    expect(winner?.scorePerformanceRating?.doubles).toBe(3.016);
    expect(winner?.legacyRating?.doubles).not.toBeNull();
    expect(winner?.legacyRating?.doubles).not.toBe(3.016);
    expect(winner?.difference.doubles).not.toBe(0);
  });
});
