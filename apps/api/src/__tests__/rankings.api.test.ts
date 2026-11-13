import {
  PlayerSeenAchievementRepository,
  type CompletedMatchOutcome,
  type SessionWithParticipantIds,
} from "@pkpkdupr/db";
import type { Match } from "@pkpkdupr/shared/match";
import type { Player, PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
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

const now = new Date("2026-11-12T12:00:00.000Z");
const makePlayer = (id: string, username: string, doubles: number): Player => ({
  id,
  username,
  gender: "M",
  status: "active",
  duprRating: { singles: null, doubles },
  createdAt: now,
  updatedAt: now,
});

const alice: Player = {
  ...makePlayer("Palice01", "alice", 3.6),
  statusMessage: "오늘도 화이팅",
  statusMessageBackgroundColor: "blue",
};
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
const emptySession: SessionWithParticipantIds = {
  ...session,
  id: "Sempty01",
  date: new Date("2026-11-10T09:00:00.000Z"),
  participantIds: [],
};
const completedAt = new Date("2026-11-09T10:00:00.000Z");
const match: CompletedMatchOutcome = {
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

const carolId = "Pcarol01";

const authorized = (path: string) =>
  request(app).get(path).set("Authorization", "Bearer test-token");

describe("랭킹·세션 리포트 API", () => {
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
    ).mockResolvedValue([emptySession, session]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "/api/rankings",
    "/api/session-reports",
    `/api/session-reports/${session.id}`,
    "/api/achievements/holders",
    "/api/me/achievements/unseen",
    "/api/records",
  ])("%s는 토큰이 없으면 401이다", async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(401);
  });

  it("GET /api/rankings는 기본 복식 순위와 지난 세션 대비 변동, 회원 상태메시지를 돌려준다", async () => {
    const carol: Player = {
      ...makePlayer("Pcarol01", "carol", 3),
      duprRating: { singles: null, doubles: null },
      statusMessage: "NR 탈출 중",
    };
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([
      alice,
      bob,
      carol,
    ]);
    const projectionSpy = vi.spyOn(
      MatchRepository.prototype,
      "getPlayerRatingChartProjection",
    );

    const response = await authorized("/api/rankings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      category: "doubles",
      baselineSessionId: session.id,
      entries: [
        {
          rank: 1,
          player: {
            id: alice.id,
            username: "alice",
            statusMessage: "오늘도 화이팅",
            statusMessageBackgroundColor: "blue",
          },
          rating: 3.6,
          matchCount: 1,
          rankChange: 1,
        },
        {
          rank: 2,
          player: { id: bob.id, username: "bob" },
          rating: 3.4,
          matchCount: 1,
          rankChange: -1,
        },
      ],
      unrated: [
        {
          player: { id: carol.id, username: "carol", statusMessage: "NR 탈출 중" },
          matchCount: 0,
        },
      ],
    });
    // 90일 평점 추이를 읽지 않는다
    expect(projectionSpy).not.toHaveBeenCalled();
  });

  it("GET /api/rankings는 category가 doubles·singles가 아니면 400이다", async () => {
    const response = await authorized("/api/rankings?category=mixed");
    expect(response.status).toBe(400);
  });

  it("GET /api/session-reports는 완료 경기가 있는 세션만 돌려준다", async () => {
    const response = await authorized("/api/session-reports");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      sessions: [
        {
          id: session.id,
          name: "정기 세션",
          kind: "regular",
          date: session.date.toISOString(),
          dateKey: "2026-11-09",
          startTime: "18:00",
          location: "야탑초등학교",
          participantCount: 2,
          matchCount: 1,
        },
      ],
    });
  });

  it("GET /api/session-reports는 limit이 정수가 아니면 400이다", async () => {
    const response = await authorized("/api/session-reports?limit=abc");
    expect(response.status).toBe(400);
  });

  it("GET /api/session-reports/:sessionId는 선수별 리포트와 topRiser를 돌려준다", async () => {
    const response = await authorized(`/api/session-reports/${session.id}`);

    expect(response.status).toBe(200);
    expect(response.body.session).toMatchObject({
      id: session.id,
      matchCount: 1,
    });
    expect(response.body.players).toEqual([
      {
        player: { id: alice.id, username: "alice" },
        matchCount: 1,
        wins: 1,
        losses: 0,
        ratingBefore: 3.4,
        ratingAfter: 3.6,
        ratingDelta: 0.2,
        rankBefore: 2,
        rankAfter: 1,
      },
      {
        player: { id: bob.id, username: "bob" },
        matchCount: 1,
        wins: 0,
        losses: 1,
        ratingBefore: 3.6,
        ratingAfter: 3.4,
        ratingDelta: -0.2,
        rankBefore: 1,
        rankAfter: 2,
      },
    ]);
    expect(response.body.topRiser).toMatchObject({
      player: { id: alice.id },
      ratingDelta: 0.2,
    });
    // 받은 시각이 같으면 업적 정의 순서 → 회원 id 순이다.
    const earned = (playerId: string, achievementId: string) => ({
      playerId,
      achievementId,
      earnedMatchId: match.id,
      earnedAt: completedAt.toISOString(),
    });
    expect(response.body.achievements).toEqual([
      earned(alice.id, "matches-1"),
      earned(bob.id, "matches-1"),
      earned(alice.id, "wins-1"),
      // 끝난 세션의 topRiser
      earned(alice.id, "dominator-1"),
    ]);
  });

  it("GET /api/achievements/holders는 업적별 받은 활성 회원 수를 모든 업적에 대해 돌려준다", async () => {
    const response = await authorized("/api/achievements/holders");

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.counts)).toHaveLength(35);
    expect(response.body.counts).toMatchObject({
      "matches-1": 2,
      "wins-1": 1,
      "matches-10": 0,
      "streak-3": 0,
      "dominator-1": 1,
    });
  });

  it("GET /api/achievements/holders는 비활성 회원을 세지 않는다", async () => {
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([
      alice,
      { ...bob, status: "inactive" },
    ]);

    const response = await authorized("/api/achievements/holders");

    expect(response.status).toBe(200);
    expect(response.body.counts["matches-1"]).toBe(1);
  });

  it("GET /api/me/achievements/unseen은 받은 업적 중 확인하지 않았거나 다른 경기로 다시 받은 것만 돌려준다", async () => {
    vi.spyOn(
      PlayerSeenAchievementRepository.prototype,
      "findByPlayerId",
    ).mockResolvedValue([
      { achievementId: "matches-1", earnedMatchId: match.id },
      // 예전 경기로 받았다가 잃은 뒤 이번 경기로 다시 받았다
      { achievementId: "wins-1", earnedMatchId: "Mold0001" },
    ]);

    const response = await authorized("/api/me/achievements/unseen");

    expect(response.status).toBe(200);
    expect(response.body.achievements).toEqual([
      {
        playerId: alice.id,
        achievementId: "wins-1",
        earnedMatchId: match.id,
        earnedAt: completedAt.toISOString(),
      },
      {
        playerId: alice.id,
        achievementId: "dominator-1",
        earnedMatchId: match.id,
        earnedAt: completedAt.toISOString(),
      },
    ]);
  });

  it("POST /api/me/achievements/seen은 요청자의 확인 기록을 남기고 204다", async () => {
    const markSeen = vi
      .spyOn(PlayerSeenAchievementRepository.prototype, "markSeen")
      .mockResolvedValue();
    const achievements = [
      { achievementId: "wins-1", earnedMatchId: match.id },
    ];

    const response = await request(app)
      .post("/api/me/achievements/seen")
      .set("Authorization", "Bearer test-token")
      .send({ achievements });

    expect(response.status).toBe(204);
    expect(markSeen).toHaveBeenCalledWith(
      alice.id,
      achievements,
      expect.any(Date),
    );
  });

  it.each([
    { achievements: [{ achievementId: "unknown", earnedMatchId: match.id }] },
    { achievements: [{ achievementId: "wins-1", earnedMatchId: "" }] },
    { achievements: "wins-1" },
    {},
  ])("POST /api/me/achievements/seen은 형식이 틀리면 400이다 (%j)", async (body) => {
    const markSeen = vi.spyOn(
      PlayerSeenAchievementRepository.prototype,
      "markSeen",
    );

    const response = await request(app)
      .post("/api/me/achievements/seen")
      .set("Authorization", "Bearer test-token")
      .send(body);

    expect(response.status).toBe(400);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("GET /api/session-reports/:sessionId는 id 형식이 틀리면 400이다", async () => {
    const response = await authorized("/api/session-reports/not-a-session");
    expect(response.status).toBe(400);
  });

  it.each([emptySession.id, "Smissin1"])(
    "GET /api/session-reports/%s는 세션이 없거나 완료 경기가 없으면 404다",
    async (sessionId) => {
      const response = await authorized(`/api/session-reports/${sessionId}`);
      expect(response.status).toBe(404);
    },
  );

  describe("GET /api/records", () => {
    // 세션(11-09 09:00)보다 늦게 시작한 세션 없는 경기와 이른 경기
    const laterMatch: CompletedMatchOutcome = {
      ...match,
      id: "Mlater01",
      sessionId: null,
      matchStartsAt: new Date("2026-11-11T09:00:00.000Z"),
      completedAt: new Date("2026-11-11T09:30:00.000Z"),
      teamPlayerIds: [[bob.id], [carolId]],
    };
    const earlierMatch: CompletedMatchOutcome = {
      ...match,
      id: "Mearly01",
      sessionId: null,
      matchStartsAt: new Date("2026-11-01T09:00:00.000Z"),
      completedAt: new Date("2026-11-01T09:30:00.000Z"),
    };
    // 같은 시각이면 id 내림차순이다
    const tiedMatch: CompletedMatchOutcome = {
      ...earlierMatch,
      id: "Mearly02",
    };
    const toPublicMatch = (outcome: CompletedMatchOutcome) =>
      ({
        id: outcome.id,
        type: outcome.type,
        status: "completed",
        matchStartsAt: outcome.matchStartsAt,
      }) as unknown as Match;

    let findByIds: MockInstance<MatchRepository["findByIds"]>;

    beforeEach(() => {
      vi.spyOn(
        MatchRepository.prototype,
        "findCompletedMatchOutcomes",
      ).mockResolvedValue([match, laterMatch, earlierMatch, tiedMatch]);
      findByIds = vi
        .spyOn(MatchRepository.prototype, "findByIds")
        .mockImplementation(async (ids: string[]) =>
          [laterMatch, earlierMatch, tiedMatch]
            .filter((outcome) => ids.includes(outcome.id))
            .map(toPublicMatch),
        );
    });

    it("세션과 세션 없는 경기를 시각 내림차순 → id 내림차순으로 섞고 mine은 세션 리포트의 요청자 줄과 같다", async () => {
      const [records, report] = await Promise.all([
        authorized("/api/records"),
        authorized(`/api/session-reports/${session.id}`),
      ]);

      expect(records.status).toBe(200);
      expect(
        records.body.items.map((item: { kind: string; session?: { id: string }; match?: { id: string } }) =>
          item.kind === "session" ? item.session?.id : item.match?.id,
        ),
      ).toEqual([laterMatch.id, session.id, tiedMatch.id, earlierMatch.id]);
      expect(records.body.nextCursor).toBeNull();

      const sessionItem = records.body.items[1];
      expect(sessionItem.session).toEqual(report.body.session);
      expect(sessionItem.session.startTime).toBe("18:00");
      expect(sessionItem.mine).toEqual(
        report.body.players.find(
          (row: { player: { id: string } }) => row.player.id === alice.id,
        ),
      );
    });

    it("요청자가 안 뛴 세션의 mine은 null이다", async () => {
      vi.spyOn(
        AuthService.prototype,
        "authenticateAccessToken",
      ).mockResolvedValue({
        ...authSession,
        payload: { playerId: carolId, isAdmin: false },
      });

      const response = await authorized("/api/records");

      expect(response.status).toBe(200);
      expect(
        response.body.items.find(
          (item: { kind: string }) => item.kind === "session",
        ).mine,
      ).toBeNull();
    });

    it("cursor로 이어 받으면 중복·누락 없이 끝까지 가고 페이지 경기만 hydrate한다", async () => {
      const first = await authorized("/api/records?limit=2");
      expect(first.status).toBe(200);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      expect(findByIds).toHaveBeenLastCalledWith([laterMatch.id]);

      const second = await authorized(
        `/api/records?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      );
      expect(second.status).toBe(200);
      expect(
        second.body.items.map((item: { match: { id: string } }) => item.match.id),
      ).toEqual([tiedMatch.id, earlierMatch.id]);
      expect(second.body.nextCursor).toBeNull();
      expect(findByIds).toHaveBeenLastCalledWith([tiedMatch.id, earlierMatch.id]);
    });

    it("playerId를 주면 그 회원이 뛴 세션·경기만 남긴다", async () => {
      const response = await authorized(`/api/records?playerId=${carolId}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([
        expect.objectContaining({
          kind: "match",
          match: expect.objectContaining({ id: laterMatch.id }),
        }),
      ]);
    });

    it.each(["limit=abc", "limit=0", "cursor=abc", "cursor=123_Xnotid1"])(
      "%s면 400이다",
      async (query) => {
        const response = await authorized(`/api/records?${query}`);
        expect(response.status).toBe(400);
      },
    );
  });
});
