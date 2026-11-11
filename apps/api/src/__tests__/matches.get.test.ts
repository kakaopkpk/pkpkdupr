import type { Match, MatchFeedItem } from "@pkpkdupr/shared/match";
import type { Player, PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";
import { PlayerRatingChartProjectionService } from "../services/PlayerRatingChartProjectionService";

const now = new Date("2026-07-14T10:00:00.000Z");
const player: Player = {
  id: "player-001",
  username: "player",
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
const outsider: Player = {
  ...player,
  id: "player-outsider",
  username: "outsider",
};
const outsiderSession: AuthenticatedSession = {
  payload: { playerId: outsider.id, isAdmin: false },
  player: outsider,
  isFirstLogin: false,
};
const match: Match = {
  id: "match-001",
  type: "singles",
  mode: "single-game",
  source: "player_created",
  creatorPlayerId: player.id,
  status: "created",
  teams: [
    { id: "team-a", name: "Team A", players: [player] },
    { id: "team-b", name: "Team B", players: [player] },
  ],
  scores: [],
  resultSubmittedByPlayerId: null,
  resultSubmittedAt: null,
  approvals: [],
  location: "Court TBD",
  matchStartsAt: now,
  completedAt: null,
  createdAt: now,
  updatedAt: now,
};

describe("GET /api/matches/:matchId", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(session);
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue({
      ...player,
      duprRating: { singles: 3.2, doubles: 3 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("인증된 사용자에게 무변동 레이팅 로그를 포함한 단건 매치를 반환한다", async () => {
    const unchangedRatingLog: PlayerRatingChangeLog = {
      id: "log-unchanged-001",
      playerId: player.id,
      source: "match_completed",
      sourceLogId: `match-completed-${match.id}-${now.getTime()}`,
      previousRating: { singles: 3.0, doubles: 3.0 },
      nextRating: { singles: 3.0, doubles: 3.0 },
      delta: { singles: 0, doubles: 0 },
      createdAt: now,
    };
    vi.spyOn(
      MatchRepository.prototype,
      "findByIdWithRatingChanges",
    ).mockResolvedValue({ match, ratingChanges: [unchangedRatingLog] });

    const response = await request(app)
      .get(`/api/matches/${match.id}`)
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: match.id,
      type: "singles",
      ratingChanges: [
        expect.objectContaining({
          previousRating: { singles: 3, doubles: 3 },
          nextRating: { singles: 3, doubles: 3 },
          delta: { singles: 0, doubles: 0 },
        }),
      ],
    });
  });

  it("인증 토큰이 없으면 401을 반환한다", async () => {
    const response = await request(app).get(`/api/matches/${match.id}`);

    expect(response.status).toBe(401);
  });

  it("없는 매치는 404를 반환한다", async () => {
    vi.spyOn(
      MatchRepository.prototype,
      "findByIdWithRatingChanges",
    ).mockResolvedValue(undefined);

    const response = await request(app)
      .get("/api/matches/missing-match")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "매치를 찾을 수 없습니다." });
  });
});

describe("POST /api/matches/:matchId/result", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("일반 경기 생성자는 클라이언트에서 결과를 입력할 수 있다", async () => {
    vi.spyOn(MatchRepository.prototype, "findById").mockResolvedValue(match);
    const submitResult = vi
      .spyOn(MatchRepository.prototype, "submitResult")
      .mockResolvedValue({
        ...match,
        status: "pending-approval",
        scores: [{ scoreA: 11, scoreB: 8 }],
        resultSubmittedByPlayerId: player.id,
        resultSubmittedAt: now,
        approvals: [{ playerId: player.id, approvedAt: now }],
      });

    const response = await request(app)
      .post(`/api/matches/${match.id}/result`)
      .set("Authorization", "Bearer test-token")
      .send({ scores: [{ scoreA: 11, scoreB: 8 }] });

    expect(response.status).toBe(200);
    expect(submitResult).toHaveBeenCalledWith(
      match.id,
      player.id,
      [{ scoreA: 11, scoreB: 8 }],
    );
  });

  it("세션 경기 결과는 참여자여도 클라이언트에서 입력할 수 없다", async () => {
    const sessionMatch: Match = {
      ...match,
      source: "admin_created",
      creatorPlayerId: "admin-001",
      session: {
        id: "Ssession1",
        name: "관리자 세션",
        date: now,
        location: "PKELO Court",
      },
    };
    vi.spyOn(MatchRepository.prototype, "findById").mockResolvedValue(
      sessionMatch,
    );
    const submitResult = vi.spyOn(
      MatchRepository.prototype,
      "submitResult",
    );

    const response = await request(app)
      .post(`/api/matches/${match.id}/result`)
      .set("Authorization", "Bearer participant-token")
      .send({ scores: [{ scoreA: 11, scoreB: 8 }] });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "세션 경기 결과는 관리자만 입력할 수 있습니다.",
    });
    expect(submitResult).not.toHaveBeenCalled();
  });

  it("일반 경기 생성자가 아니면 결과를 입력할 수 없다", async () => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(outsiderSession);
    vi.spyOn(MatchRepository.prototype, "findById").mockResolvedValue(match);
    const submitResult = vi.spyOn(
      MatchRepository.prototype,
      "submitResult",
    );

    const response = await request(app)
      .post(`/api/matches/${match.id}/result`)
      .set("Authorization", "Bearer outsider-token")
      .send({ scores: [{ scoreA: 11, scoreB: 8 }] });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "경기 생성자만 결과를 입력할 수 있습니다.",
    });
    expect(submitResult).not.toHaveBeenCalled();
  });
});

describe("POST /api/matches/:matchId/rejection", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("참여자가 대기 중인 결과를 거부하면 결과와 승인이 초기화된다", async () => {
    const rejectResult = vi
      .spyOn(MatchRepository.prototype, "rejectResult")
      .mockResolvedValue({
        ...match,
        scores: [],
        resultSubmittedByPlayerId: null,
        resultSubmittedAt: null,
        approvals: [],
      });

    const response = await request(app)
      .post(`/api/matches/${match.id}/rejection`)
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(rejectResult).toHaveBeenCalledWith(match.id, player.id);
    expect(response.body).toMatchObject({
      status: "created",
      scores: [],
      approvals: [],
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
    });
  });
});

describe("GET /api/matches", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(session);
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue({
      ...player,
      duprRating: { singles: 3.2, doubles: 3 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("playerId 쿼리 시 ratingChanges가 포함된 매치 목록을 반환한다", async () => {
    const ratingChangeLog: PlayerRatingChangeLog = {
      id: "log-001",
      playerId: player.id,
      source: "match_completed",
      sourceLogId: `match-completed-${match.id}-${now.getTime()}`,
      previousRating: { singles: 3.0, doubles: 3.0 },
      nextRating: { singles: 3.1, doubles: 3.0 },
      delta: { singles: 0.1, doubles: 0 },
      createdAt: now,
    };
    const adjustmentLog: PlayerRatingChangeLog = {
      id: "adjustment-001",
      playerId: player.id,
      source: "official_adjustment_recalculation",
      sourceLogId: "official-adjustment-001",
      previousRating: { singles: 3.1, doubles: 3.0 },
      nextRating: { singles: 3.2, doubles: 3.0 },
      delta: { singles: 0.1, doubles: 0 },
      createdAt: now,
    };

    vi.spyOn(MatchRepository.prototype, "findByPlayerId").mockResolvedValue({
      matches: [match],
      total: 1,
    });
    vi.spyOn(
      MatchRepository.prototype,
      "getPlayerRatingChangeLogs",
    ).mockResolvedValue([ratingChangeLog, adjustmentLog]);

    const response = await request(app)
      .get(`/api/matches?playerId=${player.id}`)
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body.matches).toHaveLength(1);
    expect(response.body.matches[0].ratingChanges).toHaveLength(1);
    expect(response.body.matches[0].ratingChanges[0].id).toBe("log-001");
    expect(response.body.ratingAdjustmentLogs).toBeUndefined();
    expect(response.body.ratingHistory).toBeUndefined();
  });

  it("playerId 없이 요청하면 ratingChanges를 포함하지 않는다", async () => {
    vi.spyOn(MatchRepository.prototype, "findAll").mockResolvedValue({
      matches: [match],
      total: 1,
    });

    const response = await request(app)
      .get("/api/matches")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body.matches[0].ratingChanges).toBeUndefined();
  });
});

describe("GET /api/players/:playerId/profile-summary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(session);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("압축된 평점 projection과 프로필 요약만 반환한다", async () => {
    const completedMatch: Match = {
      ...match,
      status: "completed",
      scores: [{ scoreA: 11, scoreB: 8 }],
      completedAt: now,
    };
    const ratingChangeLog: PlayerRatingChangeLog = {
      id: "log-summary-001",
      playerId: player.id,
      source: "match_completed",
      sourceLogId: `match-completed-${completedMatch.id}-${now.getTime()}`,
      previousRating: { singles: 3, doubles: 3 },
      nextRating: { singles: 3.1, doubles: 3 },
      delta: { singles: 0.1, doubles: 0 },
      createdAt: now,
    };
    vi.spyOn(MatchRepository.prototype, "findByPlayerId").mockResolvedValue({
      matches: [completedMatch],
      total: 1,
    });
    vi.spyOn(
      MatchRepository.prototype,
      "getPlayerRatingChangeLogs",
    ).mockResolvedValue([ratingChangeLog]);
    vi.spyOn(
      PlayerRatingChartProjectionService.prototype,
      "getOrRebuild",
    ).mockResolvedValue({
      history: {
        singles: [
          { rating: 3.1, source: "current", createdAt: now },
        ],
        doubles: [],
      },
      generatedAt: now,
    });

    const response = await request(app)
      .get(`/api/players/${player.id}/profile-summary`)
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      matchStats: {
        singles: { matchWins: 1, matchLosses: 0, setWins: 1, setLosses: 0 },
      },
      ratingDelta: {
        singles: { last7Days: 0.1, last30Days: 0.1 },
      },
      ratingHistory: {
        singles: [expect.objectContaining({ rating: 3.1, source: "current" })],
      },
    });
    expect(response.body.recentMatches).toHaveLength(1);
    expect(response.body).not.toHaveProperty("matches");
  });
});

describe("GET /api/match-feed", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("세션 요약과 세션이 없는 경기를 카드 단위 피드로 반환한다", async () => {
    const sessionMatch: Match = {
      ...match,
      id: "match-session-001",
      session: {
        id: "Ssessn01",
        name: "토요 오전 세션",
        date: now,
        location: "PKELO Court A",
      },
    };
    const feedItems: MatchFeedItem[] = [
      {
        kind: "session",
        session: {
          id: "Ssessn01",
          name: "토요 오전 세션",
          date: now,
          location: "PKELO Court A",
          status: "completed",
          matchCount: 2,
          participants: [
            { id: player.id, username: player.username, avatarUrl: "avatar-a" },
            { id: "player-002", username: "other", avatarUrl: "avatar-b" },
          ],
          latestCreatedAt: now,
        },
      },
      { kind: "match", match: { ...match, id: "match-no-session" } },
    ];
    const findFeed = vi
      .spyOn(MatchRepository.prototype, "findFeed")
      .mockResolvedValue({ items: feedItems, total: 2 });

    const response = await request(app)
      .get("/api/match-feed?page=1&limit=10&playerId=player-001")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(findFeed).toHaveBeenCalledWith(1, 10, player.id);
    expect(response.body).toMatchObject({ total: 2 });
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({
      kind: "session",
      session: {
        name: "토요 오전 세션",
        status: "completed",
        matchCount: 2,
        participants: [
          { id: player.id, username: player.username },
          { id: "player-002", username: "other" },
        ],
      },
    });
    expect(response.body.items[1]).toMatchObject({
      kind: "match",
      match: { id: "match-no-session" },
    });

    expect(sessionMatch.session?.name).toBe("토요 오전 세션");
  });

  it("인증 토큰이 없으면 401을 반환한다", async () => {
    const response = await request(app).get("/api/match-feed");

    expect(response.status).toBe(401);
  });
});

describe("GET /api/match-sessions/:sessionId/matches", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("선택한 세션의 전체 경기를 반환한다", async () => {
    const sessionMatches: Match[] = [
      {
        ...match,
        id: "match-session-001",
        session: {
          id: "Ssessn02",
          name: "토요 세션",
          date: now,
          location: "PKELO Court A",
        },
      },
      {
        ...match,
        id: "match-session-002",
        session: {
          id: "Ssessn02",
          name: "토요 세션",
          date: now,
          location: "PKELO Court A",
        },
      },
    ];
    const findBySession = vi
      .spyOn(MatchRepository.prototype, "findBySession")
      .mockResolvedValue(sessionMatches);

    const response = await request(app)
      .get("/api/match-sessions/Ssessn02/matches")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(findBySession).toHaveBeenCalledWith("Ssessn02");
    expect(response.body.map((item: { id: string }) => item.id)).toEqual([
      "match-session-001",
      "match-session-002",
    ]);
  });

  it("세션 식별자가 없거나 유효하지 않으면 400을 반환한다", async () => {
    const response = await request(app)
      .get("/api/match-sessions/invalid/matches")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "유효한 세션 ID가 필요합니다.",
    });
  });
});
