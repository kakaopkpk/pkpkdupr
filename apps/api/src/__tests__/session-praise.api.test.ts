import {
  PlayerSeenAchievementRepository,
  type CompletedMatchOutcome,
  type SessionWithParticipantIds,
} from "@pkpkdupr/db";
import type { Player } from "@pkpkdupr/shared/player";
import type { SessionPraiseRecord } from "@pkpkdupr/shared/sessionPraise";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const created = new Date("2026-11-01T00:00:00.000Z");
const makePlayer = (id: string, username: string): Player => ({
  isGuest: false,
  id,
  username,
  gender: "M",
  status: "active",
  duprRating: { singles: null, doubles: null },
  createdAt: created,
  updatedAt: created,
});

const alice = makePlayer("Palice01", "alice");
const bob = makePlayer("Pbob0001", "bob");
const carol = makePlayer("Pcarol01", "carol");
const guest: Player = { ...makePlayer("Pguest01", "guest"), isGuest: true };
const authSession: AuthenticatedSession = {
  payload: { playerId: alice.id, isAdmin: false },
  player: alice,
  isFirstLogin: false,
};

// 12월 3일(목) 정기 세션: 22:00 KST(13:00Z)에 끝나고 다음 날 같은 시각에 칭찬이 마감된다
const session: SessionWithParticipantIds = {
  id: "Ssessio1",
  name: "목요 정기운동",
  date: new Date("2026-12-03T09:00:00.000Z"),
  location: "야탑초등학교",
  kind: "regular",
  startTime: "18:00",
  endTime: "22:00",
  completedAt: null,
  participantIds: [alice.id, bob.id, carol.id],
  praises: [],
};
const openAt = new Date("2026-12-03T14:00:00.000Z");
const closedAt = new Date("2026-12-04T13:00:00.000Z");

let sequence = 0;
/** 단식. a가 이기면 11:7 */
const singles = (
  a: Player,
  b: Player,
  aWins = true,
): CompletedMatchOutcome => {
  sequence += 1;
  const completedAt = new Date(
    Date.parse("2026-12-03T10:00:00.000Z") + sequence * 600_000,
  );
  return {
    ratingExcluded: false,
    id: `Mmatch${String(sequence).padStart(2, "0")}`,
    type: "singles",
    sessionId: session.id,
    matchStartsAt: completedAt,
    completedAt,
    teamPlayerIds: [[a.id], [b.id]],
    scores: [aWins ? { scoreA: 11, scoreB: 7 } : { scoreA: 7, scoreB: 11 }],
  };
};

// alice 3연승(최다 연승), bob 1승(최다 승리), carol·게스트는 득점만(게스트는 후보가 아님)
const matches = [
  singles(alice, bob),
  singles(alice, carol),
  singles(alice, bob),
  singles(bob, carol),
  { ...singles(guest, carol), ratingExcluded: true },
];

const praise = (
  voter: string,
  target: string,
  createdAt = openAt,
): SessionPraiseRecord => ({
  sessionId: session.id,
  voterPlayerId: voter,
  targetPlayerId: target,
  createdAt,
});

const mockSessions = (praises: SessionPraiseRecord[]) =>
  vi
    .spyOn(MatchRepository.prototype, "findSessionsWithParticipantIds")
    .mockResolvedValue([{ ...session, praises }]);

describe("세션 칭찬 API", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: openAt });
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(authSession);
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([
      alice,
      bob,
      carol,
      guest,
    ]);
    vi.spyOn(
      MatchRepository.prototype,
      "getAllRatingChangeLogs",
    ).mockResolvedValue([]);
    vi.spyOn(
      MatchRepository.prototype,
      "findCompletedMatchOutcomes",
    ).mockResolvedValue(matches);
    mockSessions([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const get = (path: string) =>
    request(app).get(path).set("Authorization", "Bearer test-token");
  const post = (targetPlayerId: unknown) =>
    request(app)
      .post(`/api/match-sessions/${session.id}/praise`)
      .set("Authorization", "Bearer test-token")
      .send({ targetPlayerId });

  it("GET은 우선순위 순 후보와 칭찬 수를 돌려준다(게스트 제외)", async () => {
    mockSessions([praise(bob.id, alice.id)]);
    const response = await get(`/api/match-sessions/${session.id}/praise`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      session: { id: session.id, name: "목요 정기운동", kind: "regular" },
      status: "open",
      myTargetPlayerId: null,
    });
    expect(
      response.body.candidates.map(
        (candidate: { player: { id: string }; category: string }) => [
          candidate.player.id,
          candidate.category,
        ],
      ),
    ).toEqual([
      [alice.id, "winStreak"],
      [bob.id, "mostWins"],
      [carol.id, "mostPoints"],
    ]);
    expect(response.body.candidates[0]).toMatchObject({
      value: 3,
      praiseCount: 1,
    });
  });

  it("세션이 끝나기 전에는 후보가 없다", async () => {
    vi.setSystemTime(new Date("2026-12-03T12:00:00.000Z"));
    const response = await get(`/api/match-sessions/${session.id}/praise`);
    expect(response.body).toMatchObject({ status: "upcoming", candidates: [] });
  });

  it("POST는 후보에게 칭찬을 저장하고 내 칭찬·칭찬 수를 반영해 돌려준다", async () => {
    const createSpy = vi
      .spyOn(MatchRepository.prototype, "createSessionPraise")
      .mockResolvedValue(true);
    const response = await post(alice.id);
    expect(response.status).toBe(200);
    expect(createSpy).toHaveBeenCalledWith(
      { sessionId: session.id, voterPlayerId: alice.id, targetPlayerId: alice.id },
      openAt,
    );
    expect(response.body.myTargetPlayerId).toBe(alice.id);
    expect(response.body.candidates[0].praiseCount).toBe(1);
  });

  it("후보가 아니면 400, 이미 칭찬했거나 마감 뒤면 409다", async () => {
    const createSpy = vi
      .spyOn(MatchRepository.prototype, "createSessionPraise")
      .mockResolvedValue(true);
    expect((await post(guest.id)).status).toBe(400);
    expect((await post(undefined)).status).toBe(400);

    mockSessions([praise(alice.id, bob.id)]);
    expect((await post(carol.id)).status).toBe(409);

    mockSessions([]);
    createSpy.mockResolvedValue(false);
    expect((await post(carol.id)).status).toBe(409);

    createSpy.mockResolvedValue(true);
    vi.setSystemTime(closedAt);
    expect((await post(carol.id)).status).toBe(409);
  });

  it("없는 세션은 404, id 형식 오류는 400이다", async () => {
    expect((await get("/api/match-sessions/Snone001/praise")).status).toBe(404);
    expect((await get("/api/match-sessions/bad/praise")).status).toBe(400);
  });

  it("팝업 대기 목록은 참여한 세션 중 아직 칭찬하지 않은 칭찬 중 세션이다", async () => {
    expect(
      (await get("/api/me/session-praises/pending")).body.items.map(
        (item: { session: { id: string } }) => item.session.id,
      ),
    ).toEqual([session.id]);

    mockSessions([praise(alice.id, bob.id)]);
    expect((await get("/api/me/session-praises/pending")).body.items).toEqual(
      [],
    );

    mockSessions([]);
    vi.setSystemTime(closedAt);
    expect((await get("/api/me/session-praises/pending")).body.items).toEqual(
      [],
    );
  });

  it("칭찬 5개째에 이쁨받기 업적을 그 세션 마지막 경기로 받는다", async () => {
    vi.spyOn(
      PlayerSeenAchievementRepository.prototype,
      "findByPlayerId",
    ).mockResolvedValue([]);
    const voters = ["Pv000001", "Pv000002", "Pv000003", "Pv000004", "Pv000005"];
    const fifthAt = new Date(openAt.getTime() + 5 * 60_000);
    mockSessions(
      voters.map((voter, index) =>
        praise(voter, alice.id, new Date(openAt.getTime() + (index + 1) * 60_000)),
      ),
    );
    const response = await get("/api/me/achievements/unseen");
    expect(response.status).toBe(200);
    const praised = response.body.achievements.find(
      (item: { achievementId: string }) => item.achievementId === "praised-1",
    );
    expect(praised).toMatchObject({
      playerId: alice.id,
      earnedMatchId: matches[2].id,
      earnedAt: fifthAt.toISOString(),
    });
  });
});
