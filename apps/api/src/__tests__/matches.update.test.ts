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
  id: "match-edit-001",
  type: "mixed-doubles",
  mode: "single-game",
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

  const putMatch = (body: object = validBody, matchId = existing.id) =>
    request(app)
      .put(`/api/matches/${matchId}`)
      .set("Authorization", "Bearer test-token")
      .send(body);

  beforeEach(() => {
    existing = buildExistingMatch();
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
        mode: input.mode,
        name: input.name,
        location: input.location,
        teams: input.teams,
        scores: input.scores,
        status: "completed",
        resultSubmittedByPlayerId: input.resultSubmittedByPlayerId,
        resultSubmittedAt: input.resultSubmittedAt,
        completedAt: existing.completedAt ?? input.resultSubmittedAt,
      }));
    vi.spyOn(MatchRepository.prototype, "findAll").mockImplementation(
      async () => ({ matches: [existing], total: 1 }),
    );
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
      mode: "single-game",
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

  it("수정 전 참가자가 아니면 403을 반환한다", async () => {
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
        { playerIds: [outsider.id, partner.id] },
        { playerIds: [opponentM.id, opponentF.id] },
      ],
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "경기 참가자만 기록을 수정할 수 있습니다.",
    });
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("관리자여도 참가자가 아니면 403을 반환한다", async () => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue({
      ...buildSession(outsider),
      payload: { playerId: outsider.id, isAdmin: true },
    });

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
