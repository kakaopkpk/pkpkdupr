import type { Match } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const now = new Date("2026-11-12T15:00:00+09:00");

const requester: Player = {
  id: "Prequest",
  username: "prequest",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
};

const inProgressMatch = {
  id: "Minprog1",
  type: "mixed-doubles",
  status: "created",
  scores: [],
  matchStartsAt: now,
  completedAt: null,
} as unknown as Match;

describe("GET /api/matches/in-progress", () => {
  let findInProgress: MockInstance<MatchRepository["findInProgress"]>;
  let findByIdWithRatingChanges: MockInstance<
    MatchRepository["findByIdWithRatingChanges"]
  >;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue({
      payload: { playerId: requester.id, isAdmin: false },
      player: requester,
      isFirstLogin: false,
    } satisfies AuthenticatedSession);
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    findInProgress = vi
      .spyOn(MatchRepository.prototype, "findInProgress")
      .mockResolvedValue([inProgressMatch]);
    findByIdWithRatingChanges = vi
      .spyOn(MatchRepository.prototype, "findByIdWithRatingChanges")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("세션과 상관없이 진행 중 경기 전부를 { matches }로 돌려준다", async () => {
    const response = await request(app)
      .get("/api/matches/in-progress")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(findInProgress).toHaveBeenCalledWith(now);
    expect(response.body.matches).toHaveLength(1);
    expect(response.body.matches[0]).toMatchObject({
      id: "Minprog1",
      status: "created",
    });
  });

  it("경기 상세 라우트보다 먼저 등록되어 in-progress를 경기 id로 읽지 않는다", async () => {
    const response = await request(app)
      .get("/api/matches/in-progress")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(findByIdWithRatingChanges).not.toHaveBeenCalled();
  });

  it("인증이 없으면 401을 반환한다", async () => {
    const response = await request(app).get("/api/matches/in-progress");

    expect(response.status).toBe(401);
    expect(findInProgress).not.toHaveBeenCalled();
  });
});
