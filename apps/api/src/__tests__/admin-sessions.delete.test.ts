import type { Player } from "@pkpkdupr/shared/player";
import type {
  ManagedMatchSession,
  Match,
} from "@pkpkdupr/shared/match";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionHasMatchesError } from "@pkpkdupr/db";
import { db } from "../db";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const now = new Date("2026-07-23T10:00:00.000Z");
const admin: Player = {
  isGuest: false,
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
const participants: Player[] = Array.from({ length: 4 }, (_, index) => ({
  id: `player-${index + 1}`,
  username: `player-${index + 1}`,
  gender: "M",
  status: "active",
  isGuest: false,
  duprRating: null,
  createdAt: now,
  updatedAt: now,
}));
const managedSession: ManagedMatchSession = {
  id: "Ssession",
  name: "토요 오전 세션",
  date: new Date("2026-07-25T01:00:00.000Z"),
  location: "PKELO Court A",
  participantIds: participants.map((player) => player.id),
  matchCount: 0,
  kind: "custom",
  startTime: null,
  endTime: null,
  createdAt: now,
  updatedAt: now,
};

describe("admin match sessions", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(adminSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("경기가 없는 세션을 삭제한다", async () => {
    const deleteSession = vi
      .spyOn(MatchRepository.prototype, "deleteSession")
      .mockResolvedValue(undefined);

    const response = await request(app)
      .delete(`/api/admin/match-sessions/${managedSession.id}`)
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(204);
    expect(deleteSession).toHaveBeenCalledWith(managedSession.id, expect.any(Date));
  });

  it("저장소가 세션을 삭제하면 성공으로 처리한다", async () => {
    const deleteSession = vi
      .spyOn(db.matches, "deleteSession")
      .mockResolvedValue(true);
    const repository = new MatchRepository();

    await expect(
      repository.deleteSession(
        managedSession.id,
        new Date("2026-11-12T10:00:00+09:00"),
      ),
    ).resolves.toBeUndefined();
    // 오늘(KST) 이후 정기 세션을 지우면 취소로 남기도록 오늘 날짜 키를 넘긴다
    expect(deleteSession).toHaveBeenCalledWith(managedSession.id, {
      cancelRegularFromDateKey: "2026-11-12",
    });
  });

  it("저장소의 세션 삭제 결과와 예외를 공개 API 상태 코드로 변환한다", async () => {
    const repository = new MatchRepository();

    vi.spyOn(db.matches, "deleteSession").mockResolvedValueOnce(false);
    await expect(repository.deleteSession(managedSession.id)).rejects.toMatchObject({
      status: 404,
      message: "세션을 찾을 수 없습니다.",
    });

    vi.spyOn(db.matches, "deleteSession").mockRejectedValueOnce(
      new SessionHasMatchesError(),
    );
    await expect(repository.deleteSession(managedSession.id)).rejects.toMatchObject({
      status: 409,
      message: "연결된 경기가 있는 세션은 삭제할 수 없습니다.",
    });

    await expect(repository.deleteSession("invalid-session")).rejects.toMatchObject({
      status: 400,
      message: "유효한 세션 ID가 필요합니다.",
    });
  });

  it("연결된 경기가 있는 세션 삭제의 409 응답을 전달한다", async () => {
    const { MatchRepositoryError } = await import("../repositories/MatchRepository");
    vi.spyOn(MatchRepository.prototype, "deleteSession").mockRejectedValue(
      new MatchRepositoryError("연결된 경기가 있는 세션은 삭제할 수 없습니다.", 409),
    );

    const response = await request(app)
      .delete(`/api/admin/match-sessions/${managedSession.id}`)
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("연결된 경기가");
  });

  it("관리자가 세션 경기를 삭제하고 남은 완료 경기를 재계산한다", async () => {
    const deleteMatch = vi
      .spyOn(MatchRepository.prototype, "deleteRecorded")
      .mockResolvedValue({
        status: "completed",
        match: { id: "Mmatch01", status: "completed" } as Match,
      });
    vi.spyOn(MatchRepository.prototype, "findAll").mockResolvedValue({
      matches: [],
      total: 0,
    });
    const recalculate = vi
      .spyOn(AuthService.prototype, "recalculateDuprRatings")
      .mockResolvedValue({
        ratingChangeLogs: [],
        perMatchLogs: [],
        changedPlayerCount: 0,
        restoredMatchDuprSnapshotCount: 0,
        restoredMatchDuprSnapshotMatchCount: 0,
        perMatchLogCount: 0,
      });

    const response = await request(app)
      .delete("/api/admin/matches/Mmatch01")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(deleteMatch).toHaveBeenCalledWith("Mmatch01", {
      deletedByPlayerId: admin.id,
      deletedByAdmin: true,
    });
    expect(recalculate).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ source: "manual_recalculation" }),
    );
    await expect(recalculate.mock.calls[0]![0]()).resolves.toEqual([]);
    expect(response.body.deletedMatchId).toBe("Mmatch01");
  });

  it("관리자가 진행 중 경기를 지우면 재계산하지 않는다", async () => {
    vi.spyOn(MatchRepository.prototype, "deleteRecorded").mockResolvedValue({
      status: "created",
      match: { id: "Mmatch01", status: "created" } as Match,
    });
    const recalculate = vi.spyOn(
      AuthService.prototype,
      "recalculateDuprRatings",
    );

    const response = await request(app)
      .delete("/api/admin/matches/Mmatch01")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(recalculate).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      deletedMatchId: "Mmatch01",
      perMatchLogCount: 0,
    });
  });

  it("관리자가 아니면 세션 경기를 삭제하지 않는다", async () => {
    vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockResolvedValue({
      ...adminSession,
      payload: { playerId: admin.id, isAdmin: false },
    });
    const deleteMatch = vi.spyOn(MatchRepository.prototype, "deleteRecorded");

    const response = await request(app)
      .delete("/api/admin/matches/Mmatch01")
      .set("Authorization", "Bearer member-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "관리자 권한이 필요합니다.",
      code: "FORBIDDEN",
    });
    expect(deleteMatch).not.toHaveBeenCalled();
  });
});
