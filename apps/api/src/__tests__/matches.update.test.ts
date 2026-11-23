import {
  MATCH_STALE_UPDATE_ERROR_MESSAGE,
  type CompletedMatchOutcome,
} from "@pkpkdupr/db";
import {
  MATCH_EDIT_WINDOW_MS,
  type ManagedMatchSession,
  type Match,
} from "@pkpkdupr/shared/match";
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
import {
  MatchRepository,
  MatchRepositoryError,
} from "../repositories/MatchRepository";
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
    vi.spyOn(
      MatchRepository.prototype,
      "getPlayerRatingChangeLogs",
    ).mockResolvedValue([]);
    // 새 업적을 받은 참가자의 업적 점수 합은 랭킹 원천(회원·평점 로그·세션)으로 계산한다
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([]);
    vi.spyOn(
      MatchRepository.prototype,
      "getAllRatingChangeLogs",
    ).mockResolvedValue([]);
    vi.spyOn(
      MatchRepository.prototype,
      "findSessionsWithParticipantIds",
    ).mockResolvedValue([]);
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
    // 완료 경기 수정 기록은 저장소가 같은 트랜잭션에서 남긴다
    expect(input.editLog).toEqual({
      id: expect.stringMatching(/^match-edit-/),
      editedByAdmin: false,
    });
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

  it("이미 완료된 경기를 수정하면 이 경기로 받은 평점 업적을 다시 새 업적으로 응답하지 않는다", async () => {
    findCompletedMatchOutcomes.mockResolvedValue([
      {
        ratingExcluded: false,
        id: existing.id,
        type: "mixed-doubles",
        sessionId: null,
        matchStartsAt: existing.matchStartsAt,
        completedAt: existing.completedAt ?? new Date(),
        teamPlayerIds: [
          [requester.id, partner.id],
          [opponentM.id, opponentF.id],
        ],
        scores: [{ scoreA: 9, scoreB: 11 }],
      },
    ]);
    const createdAt = new Date();
    vi.mocked(MatchRepository.prototype.getAllRatingChangeLogs).mockResolvedValue(
      [requester.id, partner.id, opponentM.id, opponentF.id].map((playerId) => ({
        id: `log-${playerId}`,
        playerId,
        source: "match_completed" as const,
        sourceLogId: `match-completed-${existing.id}-${createdAt.getTime()}`,
        previousRating: { singles: 3, doubles: 3.45 },
        nextRating: { singles: 3, doubles: 3.6 },
        delta: { singles: 0, doubles: 0.15 },
        createdAt,
      })),
    );

    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(
      (response.body.newAchievements as { achievementId: string }[]).filter(
        (item) => item.achievementId.startsWith("rating-"),
      ),
    ).toEqual([]);
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

  // 예정 경기에 바로 점수를 넣는 것은 관리자 정정뿐이다.
  const signInAsAdmin = () =>
    vi
      .spyOn(AuthService.prototype, "authenticateAccessToken")
      .mockResolvedValue({
        ...buildSession(requester),
        payload: { playerId: requester.id, isAdmin: true },
      });

  it("회원은 대진 예정 경기(scheduled)에 바로 점수를 넣을 수 없다(409)", async () => {
    existing = buildExistingMatch({
      status: "scheduled",
      source: "admin_created",
      round: 1,
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      matchStartsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const response = await putMatch();

    expect(response.status).toBe(409);
    expect(updateRecordedMatch).not.toHaveBeenCalled();
    expect(applyMatchResult).not.toHaveBeenCalled();
  });

  it("관리자가 대진 예정 경기(scheduled)에 점수를 넣으면 첫 점수와 같이 입력 시각에 completed가 되고 증분 반영한다", async () => {
    signInAsAdmin();
    existing = buildExistingMatch({
      status: "scheduled",
      source: "admin_created",
      round: 1,
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      matchStartsAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });

    const response = await putMatch();

    expect(response.status).toBe(200);
    const [, input] = updateRecordedMatch.mock.calls[0]!;
    expect(input.ratingExcluded).toBe(false);
    expect(response.body.status).toBe("completed");
    expect(new Date(response.body.completedAt).getTime()).toBe(
      input.resultSubmittedAt.getTime(),
    );
    expect(applyMatchResult).toHaveBeenCalledTimes(1);
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("관리자가 넣은 대진 예정 경기에 게스트가 끼면 평점 미반영으로 저장한다", async () => {
    signInAsAdmin();
    const guest = { ...buildPlayer("player-guest", "M"), isGuest: true };
    vi.mocked(AuthService.prototype.getPublicPlayers).mockResolvedValue([
      ...publicPlayers,
      guest,
    ]);
    existing = buildExistingMatch({
      status: "scheduled",
      source: "admin_created",
      round: 1,
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
    });

    const response = await putMatch({
      ...validBody,
      teams: [
        { name: "Team A", playerIds: [requester.id, partner.id] },
        { name: "Team B", playerIds: [guest.id, opponentF.id] },
      ],
    });

    expect(response.status).toBe(200);
    expect(updateRecordedMatch.mock.calls[0]![1].ratingExcluded).toBe(true);
  });

  it("시작 2시간이 지난 점수 없는 대진 경기(라운드 있는 created)는 404가 아니라 점수를 받는다", async () => {
    existing = buildExistingMatch({
      status: "created",
      source: "admin_created",
      round: 2,
      scores: [],
      completedAt: null,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      matchStartsAt: new Date(Date.now() - 2 * 60 * 60 * 1000 - 1000),
    });

    const response = await putMatch();

    expect(response.status).toBe(200);
    expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
    expect(applyMatchResult).toHaveBeenCalledTimes(1);
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

  describe("관리자 정정", () => {
    const admin = buildPlayer("player-admin", "M");
    const movedSession: ManagedMatchSession = {
      id: "Ssession2",
      name: "목요 정기운동",
      date: now,
      location: "야탑초등학교",
      participantIds: [],
      matchCount: 0,
      kind: "regular",
      autoCreated: true,
      startTime: "18:00",
      endTime: "22:00",
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    let findSessionById: MockInstance<MatchRepository["findSessionById"]>;

    beforeEach(() => {
      vi.spyOn(
        AuthService.prototype,
        "authenticateAccessToken",
      ).mockResolvedValue({
        ...buildSession(admin),
        payload: { playerId: admin.id, isAdmin: true },
      });
      vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
        admin,
      );
      findSessionById = vi
        .spyOn(MatchRepository.prototype, "findSessionById")
        .mockImplementation(async (sessionId) =>
          sessionId === movedSession.id ? movedSession : undefined,
        );
    });

    it("24시간이 지난 경기도 고치고 전체 재계산한다", async () => {
      existing = buildExistingMatch({
        matchStartsAt: new Date(Date.now() - MATCH_EDIT_WINDOW_MS - 60_000),
      });

      const response = await putMatch();

      expect(response.status).toBe(200);
      expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
      const [, input] = updateRecordedMatch.mock.calls[0]!;
      expect(input.resultSubmittedByPlayerId).toBe(admin.id);
      expect(input).not.toHaveProperty("sessionId");
      expect(input).not.toHaveProperty("matchStartsAt");
      expect(recalculate).toHaveBeenCalledTimes(1);
    });

    it("세션을 옮기고 경기 시각을 바꾸면 같은 저장 호출로 넘기고 새 세션에 선수를 넣는다", async () => {
      existing = buildExistingMatch({
        session: {
          id: "Ssession1",
          name: "월요 정기운동",
          date: now,
          location: "야탑초등학교",
        },
        matchStartsAt: new Date(Date.now() - 3 * MATCH_EDIT_WINDOW_MS),
      });
      const matchStartsAt = "2026-07-13T09:30:00.000Z";

      const response = await putMatch({
        ...validBody,
        sessionId: movedSession.id,
        matchStartsAt,
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      });

      expect(response.status).toBe(200);
      expect(findSessionById).toHaveBeenCalledWith(movedSession.id);
      expect(addSessionParticipants).toHaveBeenCalledTimes(1);
      expect(addSessionParticipants).toHaveBeenCalledWith(movedSession.id, [
        requester.id,
        partner.id,
        opponentM.id,
        opponentF.id,
      ]);
      expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
      const [, input] = updateRecordedMatch.mock.calls[0]!;
      expect(input.sessionId).toBe(movedSession.id);
      expect(input.matchStartsAt).toEqual(new Date(matchStartsAt));
      expect(input.expectedUpdatedAt).toEqual(existing.updatedAt);
      expect(recalculate).toHaveBeenCalledTimes(1);
    });

    it("sessionId null이면 세션에서 빼고 참여자는 건드리지 않는다", async () => {
      existing = buildExistingMatch({
        session: {
          id: "Ssession1",
          name: "월요 정기운동",
          date: now,
          location: "야탑초등학교",
        },
      });

      const response = await putMatch({ ...validBody, sessionId: null });

      expect(response.status).toBe(200);
      const [, input] = updateRecordedMatch.mock.calls[0]!;
      expect(input.sessionId).toBeNull();
      expect(addSessionParticipants).not.toHaveBeenCalled();
      expect(findSessionById).not.toHaveBeenCalled();
    });

    it("없는 세션으로 옮기면 400이고 저장하지 않는다", async () => {
      const response = await putMatch({ ...validBody, sessionId: "Smissing" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "세션을 찾을 수 없어요." });
      expect(addSessionParticipants).not.toHaveBeenCalled();
      expect(updateRecordedMatch).not.toHaveBeenCalled();
    });

    it("경기 시각 형식이 틀리면 400이다", async () => {
      const response = await putMatch({
        ...validBody,
        matchStartsAt: "not-a-date",
      });

      expect(response.status).toBe(400);
      expect(updateRecordedMatch).not.toHaveBeenCalled();
    });

    it("경기에 이미 있던 비활성 선수는 그대로 둘 수 있지만 새로 넣을 수는 없다", async () => {
      const inactive: Player = {
        ...buildPlayer("player-inactive", "F"),
        status: "inactive",
      };
      existing = buildExistingMatch({
        matchStartsAt: new Date(Date.now() - 3 * MATCH_EDIT_WINDOW_MS),
        teams: [
          { id: "team-a", name: "Team A", players: [requester, inactive] },
          { id: "team-b", name: "Team B", players: [opponentM, opponentF] },
        ],
      });
      const keptBody = {
        ...validBody,
        teams: [
          { playerIds: [requester.id, inactive.id] },
          { playerIds: [opponentM.id, opponentF.id] },
        ],
      };

      const kept = await putMatch(keptBody);

      expect(kept.status).toBe(200);
      const [, input] = updateRecordedMatch.mock.calls[0]!;
      expect(input.teams[0].players.map((player) => player.id)).toEqual([
        requester.id,
        inactive.id,
      ]);

      existing = buildExistingMatch({
        matchStartsAt: new Date(Date.now() - 3 * MATCH_EDIT_WINDOW_MS),
      });
      const added = await putMatch(keptBody);

      expect(added.status).toBe(400);
      expect(updateRecordedMatch).toHaveBeenCalledTimes(1);
    });

    it("expectedUpdatedAt이 서버 값과 다르면 409다", async () => {
      existing = buildExistingMatch({
        matchStartsAt: new Date(Date.now() - 3 * MATCH_EDIT_WINDOW_MS),
      });

      const response = await putMatch({
        ...validBody,
        matchStartsAt: "2026-07-13T09:30:00.000Z",
        expectedUpdatedAt: new Date(now.getTime() - 60_000).toISOString(),
      });

      expect(response.status).toBe(409);
      expect(updateRecordedMatch).not.toHaveBeenCalled();
    });

    it("그사이 다른 수정이 저장돼 저장소가 409를 내면 409다", async () => {
      updateRecordedMatch.mockRejectedValue(
        new MatchRepositoryError(MATCH_STALE_UPDATE_ERROR_MESSAGE, 409),
      );

      const response = await putMatch({
        ...validBody,
        sessionId: movedSession.id,
      });

      expect(response.status).toBe(409);
      expect(recalculate).not.toHaveBeenCalled();
    });
  });

  describe("회원이 관리자 전용 필드를 보내면", () => {
    it.each([
      ["sessionId 문자열", { sessionId: "Ssession2" }],
      ["sessionId null", { sessionId: null }],
      ["matchStartsAt", { matchStartsAt: "2026-07-13T09:30:00.000Z" }],
    ])("%s도 403이고 저장하지 않는다", async (_label, extra) => {
      const response = await putMatch({ ...validBody, ...extra });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: "세션·경기 시각은 관리자만 바꿀 수 있어요.",
      });
      expect(updateRecordedMatch).not.toHaveBeenCalled();
      expect(addSessionParticipants).not.toHaveBeenCalled();
    });
  });

  describe("특수 매치 결과", () => {
    const hoursAgo = (hours: number) =>
      new Date(Date.now() - hours * 60 * 60 * 1000);
    // 요청자 팀 연승 저지 경기. validBody(9:11)는 상대 팀이 이긴다
    const streakStopper: Match["specialMatch"] = {
      kind: "streak_stopper",
      defendingTeamIndex: 0,
      protagonistIds: [requester.id, null],
      challengePairs: [],
      outcome: null,
    };
    const requesterWin = (id: string, completedAt: Date): CompletedMatchOutcome => ({
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
      scores: [{ scoreA: 11, scoreB: 5 }],
    });
    let updateSpecialMatch: MockInstance<MatchRepository["updateSpecialMatch"]>;

    beforeEach(() => {
      updateSpecialMatch = vi
        .spyOn(MatchRepository.prototype, "updateSpecialMatch")
        .mockResolvedValue(undefined);
      // 요청자는 이 경기 전 5연승이다
      findCompletedMatchOutcomes.mockImplementation(async () => [
        ...[6, 5, 4, 3, 2].map((hours) =>
          requesterWin(`match-prior-${hours}`, hoursAgo(hours)),
        ),
        {
          ...requesterWin(existing.id, existing.completedAt ?? new Date()),
          scores: [{ scoreA: 9, scoreB: 11 }],
        },
      ]);
    });

    it("진행 중 특수 매치에 첫 점수를 넣으면 결과를 저장하고 큰 연출 데이터를 응답한다", async () => {
      existing = buildExistingMatch({
        status: "created",
        scores: [],
        completedAt: null,
        resultSubmittedByPlayerId: null,
        resultSubmittedAt: null,
        matchStartsAt: hoursAgo(0.5),
        specialMatch: streakStopper,
      });
      updateRecordedMatch.mockImplementation(async (matchId, input) => ({
        ...existing,
        teams: input.teams,
        scores: input.scores,
        status: "completed",
        completedAt: hoursAgo(0.1),
      }));

      const response = await putMatch();

      expect(response.status).toBe(200);
      expect(updateRecordedMatch.mock.calls[0]![1]).not.toHaveProperty(
        "specialMatch",
      );
      expect(updateSpecialMatch).toHaveBeenCalledWith(existing.id, {
        ...streakStopper,
        outcome: "streak_stopped",
      });
      expect(response.body.specialMatch.outcome).toBe("streak_stopped");
      expect(response.body.specialMatchCelebration).toEqual({
        kind: "streak_stopper",
        stopped: {
          player: { id: requester.id, username: requester.username },
          streakBefore: 5,
        },
      });
    });

    it("특수 매치가 아닌 경기는 큰 연출 데이터가 null이고 결과를 저장하지 않는다", async () => {
      const response = await putMatch();

      expect(response.status).toBe(200);
      expect(response.body.specialMatchCelebration).toBeNull();
      expect(updateSpecialMatch).not.toHaveBeenCalled();
    });

    it("완료된 특수 매치를 고쳐 승패가 바뀌면 결과를 다시 정하지만 연출은 하지 않는다", async () => {
      existing = buildExistingMatch({
        specialMatch: { ...streakStopper!, outcome: "streak_defended" },
      });

      const response = await putMatch();

      expect(response.status).toBe(200);
      expect(updateSpecialMatch).toHaveBeenCalledWith(existing.id, {
        ...streakStopper,
        outcome: "streak_stopped",
      });
      expect(response.body.specialMatch.outcome).toBe("streak_stopped");
      expect(response.body.specialMatchCelebration).toBeNull();
    });

    it("완료된 특수 매치를 고쳐 다시 정한 결과가 그대로면 저장하지 않는다", async () => {
      existing = buildExistingMatch({
        scores: [{ scoreA: 5, scoreB: 11 }],
        specialMatch: { ...streakStopper!, outcome: "streak_stopped" },
      });

      const response = await putMatch();

      expect(response.status).toBe(200);
      expect(updateSpecialMatch).not.toHaveBeenCalled();
      expect(response.body.specialMatch.outcome).toBe("streak_stopped");
      expect(response.body.specialMatchCelebration).toBeNull();
    });

    describe("도전 매치", () => {
      const challengeMatch: Match["specialMatch"] = {
        kind: "challenge",
        defendingTeamIndex: 1,
        protagonistIds: [requester.id, opponentM.id],
        challengePairs: [{ attackerId: requester.id, defenderId: opponentM.id }],
        outcome: null,
      };
      // 요청자 팀이 이기는 수정 점수(승패는 기존 11:5와 같다)
      const sameWinnerBody = { ...validBody, scores: [{ scoreA: 11, scoreB: 7 }] };

      // 이 경기 반영 전 순위는 상대(3.52)가 요청자(3.48)보다 높고, 반영 직후 평점은 인자로 정한다
      const mockRankingSource = (afterRequester: number, afterOpponent: number) => {
        const completedAt = existing.completedAt ?? new Date();
        const before = {
          [requester.id]: 3.48,
          [partner.id]: 3.2,
          [opponentM.id]: 3.52,
          [opponentF.id]: 3.8,
        };
        const after = {
          ...before,
          [requester.id]: afterRequester,
          [opponentM.id]: afterOpponent,
        };
        vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue(
          Object.entries(after).map(([id, doubles]) => ({
            ...buildPlayer(id, "M"),
            duprRating: { singles: null, doubles },
          })) as Player[],
        );
        vi.spyOn(
          MatchRepository.prototype,
          "getAllRatingChangeLogs",
        ).mockResolvedValue(
          Object.keys(before).map((id) => ({
            id: `log-${id}`,
            playerId: id,
            source: "match_completed",
            sourceLogId: `match-completed-${existing.id}-${completedAt.getTime()}`,
            previousRating: { singles: 3, doubles: before[id]! },
            nextRating: { singles: 3, doubles: after[id]! },
            delta: { singles: 0, doubles: after[id]! - before[id]! },
            createdAt: completedAt,
          })),
        );
        findCompletedMatchOutcomes.mockResolvedValue([
          {
            ratingExcluded: false,
            id: existing.id,
            type: "mixed-doubles",
            sessionId: null,
            matchStartsAt: completedAt,
            completedAt,
            teamPlayerIds: [
              [requester.id, partner.id],
              [opponentM.id, opponentF.id],
            ],
            scores: [{ scoreA: 11, scoreB: 7 }],
          },
        ]);
      };

      it("승패가 같은 점수 수정으로 순위가 달라지면 결과를 다시 정하지만 연출은 하지 않는다", async () => {
        mockRankingSource(3.5, 3.51);
        existing = buildExistingMatch({
          specialMatch: { ...challengeMatch!, outcome: "challenge_success" },
        });

        const response = await putMatch(sameWinnerBody);

        expect(response.status).toBe(200);
        expect(updateSpecialMatch).toHaveBeenCalledWith(existing.id, {
          ...challengeMatch,
          outcome: "defense_success",
        });
        expect(response.body.specialMatch.outcome).toBe("defense_success");
        expect(response.body.specialMatchCelebration).toBeNull();
      });

      it("결과가 null로 남은 완료 경기는 승패가 같아도 수정 때 결과를 채우고 연출을 싣는다", async () => {
        mockRankingSource(3.56, 3.44);
        existing = buildExistingMatch({ specialMatch: challengeMatch });

        const response = await putMatch(sameWinnerBody);

        expect(response.status).toBe(200);
        expect(updateSpecialMatch).toHaveBeenCalledWith(existing.id, {
          ...challengeMatch,
          outcome: "challenge_success",
        });
        expect(response.body.specialMatch.outcome).toBe("challenge_success");
        expect(response.body.specialMatchCelebration).toMatchObject({
          kind: "challenge",
        });
      });
    });

    it("참가자가 바뀌면 특수 매치를 지운다", async () => {
      existing = buildExistingMatch({
        specialMatch: { ...streakStopper!, outcome: "streak_defended" },
      });

      const response = await putMatch({
        ...validBody,
        teams: [
          { name: "Team A", playerIds: [requester.id, substitute.id] },
          { name: "Team B", playerIds: [opponentM.id, opponentF.id] },
        ],
      });

      expect(response.status).toBe(200);
      expect(updateRecordedMatch.mock.calls[0]![1]).toMatchObject({
        specialMatch: null,
      });
    });

    it("팀 안 순서만 바뀐 수정은 특수 매치를 지우지 않는다", async () => {
      existing = buildExistingMatch({
        specialMatch: { ...streakStopper!, outcome: "streak_defended" },
      });

      await putMatch({
        ...validBody,
        teams: [
          { name: "Team A", playerIds: [partner.id, requester.id] },
          { name: "Team B", playerIds: [opponentM.id, opponentF.id] },
        ],
      });

      expect(updateRecordedMatch.mock.calls[0]![1]).not.toHaveProperty(
        "specialMatch",
      );
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
