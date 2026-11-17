import type { CompletedMatchOutcome } from "@pkpkdupr/db";
import { MATCH_EDIT_WINDOW_MS, type Match } from "@pkpkdupr/shared/match";
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

const now = new Date("2026-07-14T10:00:00.000Z");

const buildPlayer = (id: string, gender: Player["gender"]): Player => ({
  isGuest: false,
  id,
  username: id,
  gender,
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
});

const requester = buildPlayer("player-requester", "M");
const partner = buildPlayer("player-partner", "F");
const opponentM = buildPlayer("player-opponent-m", "M");
const opponentF = buildPlayer("player-opponent-f", "F");
const substitute = buildPlayer("player-substitute", "M");
const outsider = buildPlayer("player-outsider", "M");
const publicPlayers = [partner, opponentM, opponentF, substitute, outsider];

const buildSession = (player: Player): AuthenticatedSession => ({
  payload: { playerId: player.id, isAdmin: false },
  player,
  isFirstLogin: false,
});

const buildExistingMatch = (overrides: Partial<Match> = {}): Match => ({
  ratingExcluded: false,
  id: "match-edit-001",
  type: "mixed-doubles",
  source: "player_created",
  creatorPlayerId: opponentM.id,
  status: "completed",
  teams: [
    { id: "team-a", name: "Team A", players: [requester, partner] },
    { id: "team-b", name: "Team B", players: [opponentM, opponentF] },
  ],
  scores: [{ scoreA: 11, scoreB: 5 }],
  resultSubmittedByPlayerId: opponentM.id,
  resultSubmittedAt: new Date(Date.now() - 60 * 60 * 1000),
  location: "야탑초등학교",
  matchStartsAt: new Date(Date.now() - 60 * 60 * 1000),
  completedAt: new Date(Date.now() - 60 * 60 * 1000),
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const validBody = {
  teams: [
    { name: "Team A", playerIds: [requester.id, partner.id] },
    { name: "Team B", playerIds: [opponentM.id, opponentF.id] },
  ],
  location: "야탑초등학교",
  scores: [{ scoreA: 9, scoreB: 11 }],
};

// 요청자(outsider)가 팀에 없는 경기 기록 본문
const bodyWithoutRequester = {
  ...validBody,
  teams: [
    { name: "Team A", playerIds: [partner.id, substitute.id] },
    { name: "Team B", playerIds: [opponentM.id, opponentF.id] },
  ],
};

const editLog = (matchId: string): PlayerRatingChangeLog => ({
  id: `log-${matchId}`,
  playerId: requester.id,
  source: "match_completed",
  sourceLogId: `match-completed-${matchId}-1`,
  previousRating: { singles: 3, doubles: 3 },
  nextRating: { singles: 3, doubles: 2.9 },
  delta: { singles: 0, doubles: -0.1 },
  createdAt: now,
});

describe("PUT /api/matches/:matchId", () => {
  let existing: Match;
  let updateRecordedMatch: MockInstance<
    MatchRepository["updateRecordedMatch"]
  >;
  let applyMatchResult: MockInstance<
    AuthService["applyMatchResultToRatings"]
  >;
  let recalculate: MockInstance<AuthService["recalculateDuprRatings"]>;
  let addSessionParticipants: MockInstance<
    MatchRepository["addSessionParticipants"]
  >;
  let cleanupExpired: MockInstance<MatchRepository["cleanupExpired"]>;
  let findAll: MockInstance<MatchRepository["findAll"]>;
  let findCompletedMatchOutcomes: MockInstance<
    MatchRepository["findCompletedMatchOutcomes"]
  >;

  const putMatch = (body: object = validBody, matchId = existing.id) =>
    request(app)
      .put(`/api/matches/${matchId}`)
      .set("Authorization", "Bearer test-token")
      .send(body);

  beforeEach(() => {
    existing = buildExistingMatch();
    findCompletedMatchOutcomes = vi
      .spyOn(MatchRepository.prototype, "findCompletedMatchOutcomes")
      .mockResolvedValue([]);
    cleanupExpired = vi
      .spyOn(MatchRepository.prototype, "cleanupExpired")
      .mockResolvedValue(undefined);
    addSessionParticipants = vi
      .spyOn(MatchRepository.prototype, "addSessionParticipants")
      .mockResolvedValue(undefined);
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession(requester));
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
      requester,
    );
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue(
      publicPlayers,
    );
    vi.spyOn(MatchRepository.prototype, "findById").mockImplementation(
      async (matchId) => (matchId === existing.id ? existing : undefined),
    );
    updateRecordedMatch = vi
      .spyOn(MatchRepository.prototype, "updateRecordedMatch")
      .mockImplementation(async (matchId, input) => ({
        ...existing,
        id: matchId,
        type: input.type,
        name: input.name,
        location: input.location,
        teams: input.teams,
        scores: input.scores,
        status: "completed",
        resultSubmittedByPlayerId: input.resultSubmittedByPlayerId,
        resultSubmittedAt: input.resultSubmittedAt,
        completedAt: existing.completedAt ?? input.resultSubmittedAt,
      }));
    findAll = vi
      .spyOn(MatchRepository.prototype, "findAll")
      .mockImplementation(async () => ({ matches: [existing], total: 1 }));
    applyMatchResult = vi
      .spyOn(AuthService.prototype, "applyMatchResultToRatings")
      .mockImplementation(async (match) => ({
        ratingChangeLogs: [editLog(match.id)],
        changedPlayerCount: 1,
      }));
    recalculate = vi
      .spyOn(AuthService.prototype, "recalculateDuprRatings")
      .mockImplementation(async () => {
        const perMatchLogs = [editLog(existing.id), editLog("match-other")];
        return {
          ratingChangeLogs: [],
          perMatchLogs,
          changedPlayerCount: 1,
          restoredMatchDuprSnapshotCount: 0,
          restoredMatchDuprSnapshotMatchCount: 0,
          perMatchLogCount: perMatchLogs.length,
        };
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("참가자가 completed 경기를 고치면 전체 재계산하고 증분 반영은 하지 않는다", async () => {
    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
    const [matchId, input] = updateRecordedMatch.mock.calls[0]!;
    expect(matchId).toBe(existing.id);
    expect(input).toMatchObject({
      type: "mixed-doubles",
      location: "야탑초등학교",
      scores: [{ scoreA: 9, scoreB: 11 }],
      resultSubmittedByPlayerId: requester.id,
    });
    expect(input).not.toHaveProperty("matchStartsAt");
    expect(input).not.toHaveProperty("courtName");
    expect(recalculate).toHaveBeenCalledTimes(1);
    expect(recalculate.mock.calls[0]?.[1]).toMatchObject({
      source: "manual_recalculation",
      perMatchLogs: true,
    });
    expect(recalculate.mock.calls[0]?.[1]?.sourceLogId).toMatch(
      new RegExp(`^match-edit-${existing.id}-`),
    );
    expect(applyMatchResult).not.toHaveBeenCalled();
    expect(response.body.status).toBe("completed");
    expect(response.body.ratingChanges).toEqual([
      expect.objectContaining({ id: `log-${existing.id}` }),
    ]);
  });

  it("수정으로 승패가 바뀌면 저장 전후 차이로 새로 받은 업적을 응답한다", async () => {
    const opponentWin = (
      id: string,
      completedAt: Date,
    ): CompletedMatchOutcome => ({
      ratingExcluded: false,
      id,
      type: "mixed-doubles",
      sessionId: null,
      matchStartsAt: completedAt,
      completedAt,
      teamPlayerIds: [
        [requester.id, partner.id],
        [opponentM.id, opponentF.id],
      ],
      scores: [{ scoreA: 5, scoreB: 11 }],
    });
    const hoursAgo = (hours: number) =>
      new Date(Date.now() - hours * 60 * 60 * 1000);
    // 저장 후: 상대 팀이 앞선 두 경기와 고친 경기(validBody 9:11)를 모두 이겨 3연승이다.
    // 저장 전: 고친 경기는 요청자 팀이 이긴 기존 기록(11:5)이라 상대 팀은 최고 2연승이었다.
    findCompletedMatchOutcomes.mockResolvedValue([
      opponentWin("match-prior-1", hoursAgo(3)),
      opponentWin("match-prior-2", hoursAgo(2)),
      opponentWin(existing.id, existing.completedAt ?? hoursAgo(1)),
    ]);

    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(response.body.newAchievements).toEqual([
      expect.objectContaining({
        playerId: opponentM.id,
        achievementId: "streak-3",
        earnedMatchId: existing.id,
      }),
      expect.objectContaining({
        playerId: opponentF.id,
        achievementId: "streak-3",
        earnedMatchId: existing.id,
      }),
    ]);
  });

  it("새로 받은 업적이 없으면 newAchievements는 빈 배열이다", async () => {
    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(response.body.newAchievements).toEqual([]);
  });

  it("created 경기 입력은 증분 반영한다", async () => {
    existing = buildExistingMatch({
      status: "created",
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
    });

    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(applyMatchResult).toHaveBeenCalledTimes(1);
    expect(recalculate).not.toHaveBeenCalled();
    expect(response.body.ratingChanges).toHaveLength(1);
  });

  it("진행 중 경기에 첫 점수를 넣으면 입력 시각에 completed가 되고 증분 반영한다", async () => {
    existing = buildExistingMatch({
      status: "created",
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      matchStartsAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const before = Date.now();
    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(cleanupExpired).toHaveBeenCalledTimes(1);
    const [, input] = updateRecordedMatch.mock.calls[0]!;
    expect(input.resultSubmittedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(response.body.status).toBe("completed");
    expect(new Date(response.body.completedAt).getTime()).toBe(
      input.resultSubmittedAt.getTime(),
    );
    expect(applyMatchResult).toHaveBeenCalledTimes(1);
    expect(applyMatchResult.mock.calls[0]![0]).toMatchObject({
      id: existing.id,
      status: "completed",
    });
    expect(recalculate).not.toHaveBeenCalled();
    expect(response.body.ratingChanges).toEqual([
      expect.objectContaining({ id: `log-${existing.id}` }),
    ]);
  });

  it("시작 2시간이 지난 점수 없는 진행 중 경기는 404를 반환한다", async () => {
    existing = buildExistingMatch({
      status: "created",
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      matchStartsAt: new Date(Date.now() - 2 * 60 * 60 * 1000 - 1000),
    });

    const response = await putMatch();

    expect(response.status).toBe(404);
    expect(updateRecordedMatch).not.toHaveBeenCalled();
    expect(applyMatchResult).not.toHaveBeenCalled();
  });

  it("처리 전에 만료 정리를 먼저 호출한다", async () => {
    const findById = vi.mocked(MatchRepository.prototype.findById);

    await putMatch();

    expect(cleanupExpired.mock.invocationCallOrder[0]).toBeLessThan(
      findById.mock.invocationCallOrder[0]!,
    );
  });

  it("completed 경기 수정의 전체 재계산 입력에서 진행 중 경기는 빠진다", async () => {
    const inProgress = buildExistingMatch({
      id: "match-in-progress",
      status: "created",
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
    });
    findAll.mockImplementation(async () => ({
      matches: [existing, inProgress],
      total: 2,
    }));

    const response = await putMatch();

    expect(response.status).toBe(200);
    const [loadCompletedMatches] = recalculate.mock.calls[0]!;
    const replayed = await loadCompletedMatches();
    expect(replayed.map((match) => match.id)).toEqual([existing.id]);
  });

  it("세션 경기 참가자도 기록을 입력할 수 있다", async () => {
    existing = buildExistingMatch({
      status: "created",
      source: "admin_created",
      creatorPlayerId: "admin-001",
      scores: [],
      completedAt: null,
      courtName: "1번 코트",
      session: {
        id: "Ssession1",
        name: "월요 정기",
        date: now,
        location: "야탑초등학교",
      },
    });

    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
    expect(response.body.session).toMatchObject({ id: "Ssession1" });
    expect(response.body.courtName).toBe("1번 코트");
  });

  it("세션 경기 팀이 바뀌면 새 선수를 세션 참여자로 추가한다", async () => {
    existing = buildExistingMatch({
      session: {
        id: "Ssession1",
        name: "정기 세션",
        date: now,
        location: "야탑초등학교",
      },
    });

    const response = await putMatch({
      ...validBody,
      teams: [
        { playerIds: [requester.id, partner.id] },
        { playerIds: [substitute.id, opponentF.id] },
      ],
    });

    expect(response.status).toBe(200);
    expect(addSessionParticipants).toHaveBeenCalledWith("Ssession1", [
      requester.id,
      partner.id,
      substitute.id,
      opponentF.id,
    ]);
  });

  it("세션 없는 경기는 참여자를 추가하지 않는다", async () => {
    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(addSessionParticipants).not.toHaveBeenCalled();
  });

  it("멤버를 바꾸면 새 팀 구성으로 저장한다", async () => {
    const response = await putMatch({
      ...validBody,
      teams: [
        { playerIds: [requester.id, partner.id] },
        { playerIds: [substitute.id, opponentF.id] },
      ],
    });

    expect(response.status).toBe(200);
    const input = updateRecordedMatch.mock.calls[0]![1];
    expect(input.teams[1].players.map((player) => player.id)).toEqual([
      substitute.id,
      opponentF.id,
    ]);
  });

  it("없는 경기면 404를 반환한다", async () => {
    const response = await putMatch(validBody, "match-missing");

    expect(response.status).toBe(404);
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("참가자도 생성자도 아닌 회원이 완료 경기를 고치면 200을 반환한다", async () => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession(outsider));
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
      outsider,
    );

    const response = await putMatch(bodyWithoutRequester);

    expect(response.status).toBe(200);
    expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
    const [, input] = updateRecordedMatch.mock.calls[0]!;
    expect(input.resultSubmittedByPlayerId).toBe(outsider.id);
    expect(recalculate).toHaveBeenCalledTimes(1);
  });

  it("참가자 아닌 회원이 진행 중 경기에 첫 점수를 넣으면 completed가 된다", async () => {
    existing = buildExistingMatch({
      status: "created",
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      matchStartsAt: new Date(Date.now() - 30 * 60 * 1000),
    });
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession(outsider));
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
      outsider,
    );

    const response = await putMatch(bodyWithoutRequester);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("completed");
    const [, input] = updateRecordedMatch.mock.calls[0]!;
    expect(input.resultSubmittedByPlayerId).toBe(outsider.id);
    expect(applyMatchResult).toHaveBeenCalledTimes(1);
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("관리자도 회원과 같은 기준으로 참가자가 아니어도 수정할 수 있다", async () => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue({
      ...buildSession(outsider),
      payload: { playerId: outsider.id, isAdmin: true },
    });
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
      outsider,
    );

    const response = await putMatch(bodyWithoutRequester);

    expect(response.status).toBe(200);
    expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
  });

  it("참가자가 아니어도 경기 생성자면 수정할 수 있다", async () => {
    existing = buildExistingMatch({ creatorPlayerId: outsider.id });
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession(outsider));
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
      outsider,
    );

    const response = await putMatch({
      ...validBody,
      teams: [
        { playerIds: [partner.id, substitute.id] },
        { playerIds: [opponentM.id, opponentF.id] },
      ],
    });

    expect(response.status).toBe(200);
    expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
  });

  it("경기 생성자라도 24시간이 지났으면 403을 반환한다", async () => {
    existing = buildExistingMatch({
      creatorPlayerId: outsider.id,
      matchStartsAt: new Date(Date.now() - MATCH_EDIT_WINDOW_MS - 60_000),
    });
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession(outsider));

    const response = await putMatch();

    expect(response.status).toBe(403);
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("경기 시작 후 24시간이 지났으면 403을 반환한다", async () => {
    existing = buildExistingMatch({
      matchStartsAt: new Date(Date.now() - MATCH_EDIT_WINDOW_MS - 60_000),
    });

    const response = await putMatch();

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error:
        "경기 시작 후 24시간이 지나 수정할 수 없습니다. 관리자에게 요청해 주세요.",
    });
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("cancelled 경기면 409를 반환한다", async () => {
    existing = buildExistingMatch({ status: "cancelled" });

    const response = await putMatch();

    expect(response.status).toBe(409);
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("점수가 여러 개인 과거 2선승 기록이면 409를 반환한다", async () => {
    existing = buildExistingMatch({
      scores: [
        { scoreA: 9, scoreB: 11 },
        { scoreA: 11, scoreB: 8 },
        { scoreA: 11, scoreB: 6 },
      ],
    });

    const response = await putMatch();

    expect(response.status).toBe(409);
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("점수가 2개 이상이면 400을 반환한다", async () => {
    const response = await putMatch({
      ...validBody,
      scores: [
        { scoreA: 11, scoreB: 9 },
        { scoreA: 11, scoreB: 7 },
      ],
    });

    expect(response.status).toBe(400);
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("새 팀 구성에 본인이 없어도 수정된다", async () => {
    const response = await putMatch({
      ...validBody,
      teams: [
        { playerIds: [substitute.id, partner.id] },
        { playerIds: [opponentM.id, opponentF.id] },
      ],
    });

    expect(response.status).toBe(200);
    const input = updateRecordedMatch.mock.calls[0]![1];
    expect(input.teams[0].players.map((player) => player.id)).toEqual([
      substitute.id,
      partner.id,
    ]);
  });

  it("동점 점수면 400을 반환한다", async () => {
    const response = await putMatch({
      ...validBody,
      scores: [{ scoreA: 11, scoreB: 11 }],
    });

    expect(response.status).toBe(400);
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("평점 반영만 실패하면 500과 안내 문구를 응답한다", async () => {
    recalculate.mockRejectedValue(new Error("rating failure"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await putMatch();

    expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error:
        "경기는 저장됐지만 평점 반영에 실패했습니다. 관리자에게 평점 재계산을 요청해 주세요.",
    });
  });
});

describe("삭제된 합의·자동 합의 라우트", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession(requester));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["post", "/api/matches/match-001/result"],
    ["post", "/api/matches/match-001/approval"],
    ["delete", "/api/matches/match-001/approval"],
    ["post", "/api/matches/match-001/rejection"],
    ["post", "/api/internal/cron/auto-approvals"],
  ] as const)("%s %s는 404를 반환한다", async (method, path) => {
    const response = await request(app)
      [method](path)
      .set("Authorization", "Bearer test-token")
      .set("x-cron-secret", "any");

    expect(response.status).toBe(404);
  });
});
