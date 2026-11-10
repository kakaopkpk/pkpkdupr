import type { Match } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
};

const buildMatch = (id: string): Match => ({
  id,
  type: "singles",
  mode: "single-game",
  source: "admin_created",
  creatorPlayerId: admin.id,
  status: "created",
  teams: [
    { id: `${id}-team-a`, name: "Team A", players: [admin] },
    { id: `${id}-team-b`, name: "Team B", players: [admin] },
  ],
  scores: [],
  resultSubmittedByPlayerId: null,
  resultSubmittedAt: null,
  approvals: [],
  location: "PKELO Court A",
  matchStartsAt: now,
  completedAt: null,
  createdAt: now,
  updatedAt: now,
});

describe("admin match metadata", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(adminSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("선택한 매치를 하나의 세션 ID로 일괄 연결한다", async () => {
    const updateMetadata = vi
      .spyOn(MatchRepository.prototype, "updateMetadata")
      .mockImplementation(async (matchId, input) => ({
        ...buildMatch(matchId),
        session: input.sessionId
          ? {
              id: input.sessionId,
              name: "수요일 저녁 세션",
              date: now,
              location: "PKELO Court A",
            }
          : undefined,
      }));

    const response = await request(app)
      .patch("/api/admin/matches/bulk-metadata")
      .set("Authorization", "Bearer admin-token")
      .send({
        matchIds: ["match-001", "match-002", "match-001"],
        sessionId: "Ssession",
      });

    expect(response.status).toBe(200);
    expect(response.body.matches).toHaveLength(2);
    expect(updateMetadata).toHaveBeenNthCalledWith(1, "match-001", {
      sessionId: "Ssession",
    });
    expect(updateMetadata).toHaveBeenNthCalledWith(2, "match-002", {
      sessionId: "Ssession",
    });
  });

  it("선택한 매치의 장소를 중복 없이 일괄 수정한다", async () => {
    const updateMetadata = vi
      .spyOn(MatchRepository.prototype, "updateMetadata")
      .mockImplementation(async (matchId, input) => ({
        ...buildMatch(matchId),
        location: input.location ?? "PKELO Court A",
      }));

    const response = await request(app)
      .patch("/api/admin/matches/bulk-metadata")
      .set("Authorization", "Bearer admin-token")
      .send({
        matchIds: ["match-001", "match-002", "match-001"],
        location: "  PKELO Court B  ",
      });

    expect(response.status).toBe(200);
    expect(response.body.matches).toHaveLength(2);
    expect(updateMetadata).toHaveBeenNthCalledWith(1, "match-001", {
      location: "PKELO Court B",
    });
    expect(updateMetadata).toHaveBeenNthCalledWith(2, "match-002", {
      location: "PKELO Court B",
    });
    expect(response.body.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: "PKELO Court B" }),
      ]),
    );
  });

  it("경기 예정 일시, 코트명, 장소를 독립적으로 수정한다", async () => {
    const matchStartsAt = "2026-07-23T11:15:00.000Z";
    const updateMetadata = vi
      .spyOn(MatchRepository.prototype, "updateMetadata")
      .mockImplementation(async (matchId, input) => ({
        ...buildMatch(matchId),
        courtName: input.courtName ?? undefined,
        location: input.location ?? "PKELO Court A",
        matchStartsAt: input.matchStartsAt
          ? new Date(input.matchStartsAt)
          : now,
      }));

    const response = await request(app)
      .patch("/api/admin/matches/match-001/metadata")
      .set("Authorization", "Bearer admin-token")
      .send({
        courtName: "코트 B",
        location: "  PKELO Court C  ",
        matchStartsAt,
      });

    expect(response.status).toBe(200);
    expect(updateMetadata).toHaveBeenCalledWith("match-001", {
      courtName: "코트 B",
      location: "PKELO Court C",
      matchStartsAt,
    });
    expect(response.body).toMatchObject({
      courtName: "코트 B",
      location: "PKELO Court C",
      matchStartsAt,
    });
  });

  it.each([
    ["빈 문자열", "   "],
    ["문자열이 아닌 값", { name: "PKELO Court A" }],
  ])("%s 장소 일괄 수정을 거부한다", async (_label, location) => {
    const updateMetadata = vi.spyOn(MatchRepository.prototype, "updateMetadata");

    const response = await request(app)
      .patch("/api/admin/matches/bulk-metadata")
      .set("Authorization", "Bearer admin-token")
      .send({ matchIds: ["match-001"], location });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("매치 장소");
    expect(updateMetadata).not.toHaveBeenCalled();
  });

  it("세션 연결 해제를 명시적인 sessionId null로 전달한다", async () => {
    const updateMetadata = vi
      .spyOn(MatchRepository.prototype, "updateMetadata")
      .mockResolvedValue(buildMatch("match-001"));

    const response = await request(app)
      .patch("/api/admin/matches/match-001/metadata")
      .set("Authorization", "Bearer admin-token")
      .send({ sessionId: null });

    expect(response.status).toBe(200);
    expect(updateMetadata).toHaveBeenCalledWith("match-001", {
      sessionId: null,
    });
  });

  it("존재하지 않는 세션 ID 연결을 거부한다", async () => {
    const { MatchRepositoryError } = await import("../repositories/MatchRepository");
    vi.spyOn(MatchRepository.prototype, "updateMetadata").mockRejectedValue(
      new MatchRepositoryError("세션을 찾을 수 없습니다.", 400),
    );

    const response = await request(app)
      .patch("/api/admin/matches/match-001/metadata")
      .set("Authorization", "Bearer admin-token")
      .send({ sessionId: "Smissing" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("세션을 찾을 수 없습니다.");
  });

  it("세션명·날짜·장소 기반 연결 변경 요청을 거부한다", async () => {
    const updateMetadata = vi.spyOn(MatchRepository.prototype, "updateMetadata");

    const response = await request(app)
      .patch("/api/admin/matches/match-001/metadata")
      .set("Authorization", "Bearer admin-token")
      .send({
        sessionName: "중복 세션",
        sessionDate: "2026-07-23T10:00:00.000Z",
        sessionLocation: "PKELO Court A",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("sessionId");
    expect(updateMetadata).not.toHaveBeenCalled();
  });

  it("관리자 세션 조회 시 관리자 여부를 함께 반환한다", async () => {
    const response = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: admin.id,
      isAdmin: true,
    });
    expect(response.body).not.toHaveProperty("accessToken");
  });
});
