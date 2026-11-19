import type {
  CompletedMatchOutcome,
  SessionWithParticipantIds,
} from "@pkpkdupr/db";
import type { Player, PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const makePlayer = (id: string, username: string, doubles: number): Player => ({
  isGuest: false,
  id,
  username,
  gender: "M",
  status: "active",
  duprRating: { singles: null, doubles },
  createdAt,
  updatedAt: createdAt,
});

const alice = makePlayer("Palice01", "alice", 3.6);
const bob = makePlayer("Pbob0001", "bob", 3.4);
const authSession: AuthenticatedSession = {
  payload: { playerId: alice.id, isAdmin: false },
  player: alice,
  isFirstLogin: false,
};

const session: SessionWithParticipantIds = {
  id: "Ssessio1",
  name: "정기 세션",
  date: new Date("2026-11-09T09:00:00.000Z"),
  location: "야탑초등학교",
  kind: "regular",
  startTime: "18:00",
  endTime: "22:00",
  participantIds: [alice.id, bob.id],
};
const completedAt = new Date("2026-11-09T10:00:00.000Z");
const match: CompletedMatchOutcome = {
  ratingExcluded: false,
  id: "Mmatch01",
  type: "unrestricted-doubles",
  sessionId: session.id,
  matchStartsAt: completedAt,
  completedAt,
  teamPlayerIds: [[alice.id], [bob.id]],
  scores: [{ scoreA: 11, scoreB: 7 }],
};
const makeLog = (
  playerId: string,
  previous: number,
  next: number,
): PlayerRatingChangeLog => ({
  id: `log-${playerId}`,
  playerId,
  source: "match_completed",
  sourceLogId: `match-completed-${match.id}-${completedAt.getTime()}`,
  previousRating: { singles: 3.5, doubles: previous },
  nextRating: { singles: 3.5, doubles: next },
  delta: { singles: 0, doubles: next - previous },
  createdAt: completedAt,
});

const authorized = (path: string) =>
  request(app).get(path).set("Authorization", "Bearer test-token");

describe("GET /api/news-feed", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(authSession);
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([
      alice,
      bob,
    ]);
    vi.spyOn(
      MatchRepository.prototype,
      "getAllRatingChangeLogs",
    ).mockResolvedValue([
      makeLog(alice.id, 3.4, 3.6),
      makeLog(bob.id, 3.6, 3.4),
    ]);
    vi.spyOn(
      MatchRepository.prototype,
      "findCompletedMatchOutcomes",
    ).mockResolvedValue([match]);
    vi.spyOn(
      MatchRepository.prototype,
      "findSessionsWithParticipantIds",
    ).mockResolvedValue([session]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("토큰이 없으면 401이다", async () => {
    const response = await request(app).get("/api/news-feed");
    expect(response.status).toBe(401);
  });

  it.each(["abc", "", "-1", "12.5", "1".repeat(16)])(
    "cursor=%s 형식 오류는 400이다",
    async (cursor) => {
      const response = await authorized(
        `/api/news-feed?cursor=${encodeURIComponent(cursor)}`,
      );
      expect(response.status).toBe(400);
    },
  );

  it("세션 리포트와 같은 session·mine·topRiser와 새 회원을 시각 내림차순으로 돌려준다", async () => {
    const [feed, report] = await Promise.all([
      authorized("/api/news-feed"),
      authorized(`/api/session-reports/${session.id}`),
    ]);

    expect(feed.status).toBe(200);
    expect(report.status).toBe(200);
    expect(feed.body.nextCursor).toBeNull();
    expect(feed.body.items.map((item: { kind: string }) => item.kind)).toEqual([
      "session",
      "newMember",
      "newMember",
    ]);
    const [sessionItem] = feed.body.items;
    expect(sessionItem.session).toEqual(report.body.session);
    expect(sessionItem.topRiser).toEqual(report.body.topRiser);
    expect(sessionItem.mine).toEqual(
      report.body.players.find(
        (player: { player: { id: string } }) => player.player.id === alice.id,
      ),
    );
    expect(feed.body.items[1]).toEqual({
      kind: "newMember",
      player: { id: alice.id, username: "alice" },
      joinedAt: createdAt.toISOString(),
    });
  });

  it("cursor 뒤에 남은 세션이 없으면 그 전 새 회원만 돌려준다", async () => {
    const response = await authorized(
      `/api/news-feed?cursor=${createdAt.getTime() + 1}`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        {
          kind: "newMember",
          player: { id: alice.id, username: "alice" },
          joinedAt: createdAt.toISOString(),
        },
        {
          kind: "newMember",
          player: { id: bob.id, username: "bob" },
          joinedAt: createdAt.toISOString(),
        },
      ],
      nextCursor: null,
    });
  });
});
