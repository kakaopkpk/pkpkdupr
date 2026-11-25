import type { CompletedMatchOutcome } from "@pkpkdupr/db";
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
  isGuest: false,
  id: "Prequest",
  username: "prequest",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
};

const makePlayer = (id: string, isGuest = false): Player => ({
  ...requester,
  id,
  username: id,
  isGuest,
});

const inProgressMatch = {
  id: "Minprog1",
  type: "mixed-doubles",
  status: "created",
  scores: [],
  matchStartsAt: now,
  completedAt: null,
  teams: [
    { id: "Tteam-a", name: "Team A", players: [makePlayer("Pstreak3"), makePlayer("Pstreak2")] },
    { id: "Tteam-b", name: "Team B", players: [makePlayer("Pstreak7"), makePlayer("Pguest01", true)] },
  ],
} as unknown as Match;

/** winnerId가 이긴 완료 경기 count개(오래된 것부터, now 이전) */
const winsFor = (winnerId: string, count: number) =>
  Array.from({ length: count }, (_, index): CompletedMatchOutcome => {
    const at = new Date(now.getTime() - (count - index) * 3_600_000);
    return {
      id: `Mwin-${winnerId}-${index}`,
      type: "men-doubles",
      sessionId: null,
      matchStartsAt: at,
      completedAt: at,
      teamPlayerIds: [[winnerId], [`Ploser-${winnerId}-${index}`]],
      scores: [{ scoreA: 11, scoreB: 5 }],
      ratingExcluded: false,
    };
  });

describe("GET /api/matches/in-progress", () => {
  let findInProgress: MockInstance<MatchRepository["findInProgress"]>;
  let findCompletedMatchOutcomes: MockInstance<
    MatchRepository["findCompletedMatchOutcomes"]
  >;
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
    findCompletedMatchOutcomes = vi
      .spyOn(MatchRepository.prototype, "findCompletedMatchOutcomes")
      .mockResolvedValue([]);
    findByIdWithRatingChanges = vi
      .spyOn(MatchRepository.prototype, "findByIdWithRatingChanges")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("세션과 상관없이 진행 중 경기 전부를 matches로 돌려준다", async () => {
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

  it("참가자 중 지금 3연승(WIN_STREAK_MIN) 이상인 정회원만 winStreaks에 연승 수를 싣는다", async () => {
    findCompletedMatchOutcomes.mockResolvedValue([
      ...winsFor("Pstreak3", 3),
      ...winsFor("Pstreak2", 2),
      ...winsFor("Pstreak7", 7),
      ...winsFor("Pguest01", 6),
      // 진행 중 경기에 없는 회원은 연승이 길어도 싣지 않는다
      ...winsFor("Poutside", 9),
    ]);

    const response = await request(app)
      .get("/api/matches/in-progress")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.winStreaks).toEqual({ Pstreak3: 3, Pstreak7: 7 });
  });

  it("연승 회원이 없으면 winStreaks는 빈 객체다", async () => {
    const response = await request(app)
      .get("/api/matches/in-progress")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.winStreaks).toEqual({});
  });

  it("완료 경기를 못 읽어도 진행 중 경기는 돌려주고 winStreaks는 빈 객체다", async () => {
    findCompletedMatchOutcomes.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(app)
      .get("/api/matches/in-progress")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.matches).toHaveLength(1);
    expect(response.body.winStreaks).toEqual({});
  });

  it("진행 중 경기가 없으면 완료 경기를 읽지 않는다", async () => {
    findInProgress.mockResolvedValue([]);

    const response = await request(app)
      .get("/api/matches/in-progress")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matches: [], winStreaks: {} });
    expect(findCompletedMatchOutcomes).not.toHaveBeenCalled();
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
