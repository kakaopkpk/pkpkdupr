import { MATCH_EDIT_WINDOW_MS, type Match } from "@pkpkdupr/shared/match";
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
import { db } from "../db";
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
const HOUR_MS = 60 * 60 * 1000;

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

const buildSession = (player: Player): AuthenticatedSession => ({
  payload: { playerId: player.id, isAdmin: false },
  player,
  isFirstLogin: false,
});

// updatedAt은 저장소처럼 초 단위로 맞춘다
const secondsPrecision = (date: Date) =>
  new Date(Math.floor(date.getTime() / 1000) * 1000);

const buildExistingMatch = (overrides: Partial<Match> = {}): Match => ({
  id: "Mdelete1",
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
  resultSubmittedAt: new Date(Date.now() - HOUR_MS),
  location: "야탑초등학교",
  matchStartsAt: new Date(Date.now() - HOUR_MS),
  completedAt: new Date(Date.now() - HOUR_MS),
  createdAt: new Date(Date.now() - HOUR_MS),
  updatedAt: secondsPrecision(new Date(Date.now() - HOUR_MS)),
  ...overrides,
});

const buildInProgressMatch = (overrides: Partial<Match> = {}): Match =>
  buildExistingMatch({
    status: "created",
    scores: [],
    completedAt: null,
    resultSubmittedByPlayerId: null,
    resultSubmittedAt: null,
    matchStartsAt: new Date(Date.now() - 10 * 60 * 1000),
    ...overrides,
  });

describe("DELETE /api/matches/:matchId", () => {
  let existing: Match;
  let deleteRecorded: MockInstance<MatchRepository["deleteRecorded"]>;
  let recalculate: MockInstance<AuthService["recalculateDuprRatings"]>;
  let findAll: MockInstance<MatchRepository["findAll"]>;

  const deleteMatch = (matchId = existing.id, query = "") =>
    request(app)
      .delete(`/api/matches/${matchId}${query}`)
      .set("Authorization", "Bearer test-token");

  beforeEach(() => {
    existing = buildExistingMatch();
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue(
      undefined,
    );
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession(requester));
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
      requester,
    );
    vi.spyOn(MatchRepository.prototype, "findById").mockImplementation(
      async (matchId) => (matchId === existing.id ? existing : undefined),
    );
    deleteRecorded = vi
      .spyOn(MatchRepository.prototype, "deleteRecorded")
      .mockImplementation(async () => ({
        status: existing.status,
        match: existing,
      }));
    findAll = vi
      .spyOn(MatchRepository.prototype, "findAll")
      .mockImplementation(async () => ({ matches: [], total: 0 }));
    recalculate = vi
      .spyOn(AuthService.prototype, "recalculateDuprRatings")
      .mockResolvedValue({
        ratingChangeLogs: [],
        perMatchLogs: [],
        changedPlayerCount: 0,
        restoredMatchDuprSnapshotCount: 0,
        restoredMatchDuprSnapshotMatchCount: 0,
        perMatchLogCount: 0,
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("허용", () => {
    it("참가자가 아닌 회원도 완료 경기를 지우면 204이고 처음부터 재계산한다", async () => {
      const response = await deleteMatch();

      expect(response.status).toBe(204);
      expect(deleteRecorded).toHaveBeenCalledWith(existing.id, {
        deletedByPlayerId: requester.id,
        deletedByAdmin: false,
        expectedUpdatedAt: undefined,
        notFoundMessage: "다른 회원이 지운 경기예요",
      });
      expect(recalculate).toHaveBeenCalledTimes(1);
      expect(recalculate.mock.calls[0]?.[1]).toMatchObject({
        source: "manual_recalculation",
        perMatchLogs: true,
      });
      expect(recalculate.mock.calls[0]?.[1]?.sourceLogId).toMatch(
        new RegExp(`^match-delete-${existing.id}-`),
      );
    });

    it("재계산 입력은 잠금 안에서 다시 읽은 완료 경기만이다", async () => {
      const remaining = buildExistingMatch({ id: "Mremain1" });
      findAll.mockImplementation(async () => ({
        matches: [remaining, buildInProgressMatch({ id: "Mprogress" })],
        total: 2,
      }));

      await deleteMatch();

      expect(findAll).not.toHaveBeenCalled();
      const [loadCompletedMatches] = recalculate.mock.calls[0]!;
      const replayed = await loadCompletedMatches();
      expect(replayed.map((match) => match.id)).toEqual([remaining.id]);
    });

    it("진행 중 경기를 지우면 재계산하지 않는다", async () => {
      existing = buildInProgressMatch();

      const response = await deleteMatch();

      expect(response.status).toBe(204);
      expect(deleteRecorded).toHaveBeenCalledTimes(1);
      expect(recalculate).not.toHaveBeenCalled();
    });

    it("막 만든 진행 중 경기(시작 시각 = 지금)도 지울 수 있다", async () => {
      existing = buildInProgressMatch({ matchStartsAt: new Date() });

      const response = await deleteMatch();

      expect(response.status).toBe(204);
      expect(deleteRecorded).toHaveBeenCalledTimes(1);
    });

    it("완료된 관리자 예정 경기는 지울 수 있다", async () => {
      existing = buildExistingMatch({ source: "admin_created" });

      const response = await deleteMatch();

      expect(response.status).toBe(204);
      expect(recalculate).toHaveBeenCalledTimes(1);
    });

    it("미리 읽은 상태가 진행 중이어도 실제로 지운 행이 완료였으면 재계산한다", async () => {
      existing = buildInProgressMatch();
      deleteRecorded.mockResolvedValue({
        status: "completed",
        match: { ...existing, status: "completed" },
      });

      const response = await deleteMatch();

      expect(response.status).toBe(204);
      expect(recalculate).toHaveBeenCalledTimes(1);
    });

    it("expectedUpdatedAt이 서버 값과 같으면 지우고 저장소에도 넘긴다", async () => {
      const response = await deleteMatch(
        existing.id,
        `?expectedUpdatedAt=${encodeURIComponent(existing.updatedAt.toISOString())}`,
      );

      expect(response.status).toBe(204);
      expect(deleteRecorded.mock.calls[0]?.[1].expectedUpdatedAt).toEqual(
        existing.updatedAt,
      );
    });
  });

  describe("거부", () => {
    const expectForbidden = async (match: Match) => {
      existing = match;

      const response = await deleteMatch();

      expect(response.status).toBe(403);
      expect(response.body.error).toEqual(expect.any(String));
      expect(deleteRecorded).not.toHaveBeenCalled();
      expect(recalculate).not.toHaveBeenCalled();
      return response;
    };

    it("시작 후 24시간이 지난 경기는 403", async () => {
      const response = await expectForbidden(
        buildExistingMatch({
          matchStartsAt: new Date(Date.now() - MATCH_EDIT_WINDOW_MS - 60_000),
        }),
      );
      expect(response.body.error).toContain("24시간");
    });

    it("아직 시작하지 않은 경기는 403", async () => {
      const response = await expectForbidden(
        buildInProgressMatch({ matchStartsAt: new Date(Date.now() + HOUR_MS) }),
      );
      expect(response.body.error).toContain("아직 시작하지 않은");
    });

    it("완료되지 않은 관리자 예정 경기는 이미 시작했어도 403", async () => {
      const response = await expectForbidden(
        buildInProgressMatch({
          source: "admin_created",
          creatorPlayerId: "admin-001",
        }),
      );
      expect(response.body.error).toContain("관리자 예정 경기");
    });

    it("취소된 경기는 403", async () => {
      await expectForbidden(buildExistingMatch({ status: "cancelled" }));
    });

    it("점수가 여러 개인 과거 2선승 기록은 403", async () => {
      await expectForbidden(
        buildExistingMatch({
          scores: [
            { scoreA: 9, scoreB: 11 },
            { scoreA: 11, scoreB: 8 },
            { scoreA: 11, scoreB: 6 },
          ],
        }),
      );
    });
  });

  describe("동시 삭제·수정", () => {
    it("이미 지워진 경기면 404와 안내 문구", async () => {
      const response = await deleteMatch("Mmissing");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "다른 회원이 지운 경기예요" });
      expect(deleteRecorded).not.toHaveBeenCalled();
    });

    it("미리 읽은 뒤 다른 회원이 먼저 지웠으면 저장소의 404를 그대로 응답한다", async () => {
      deleteRecorded.mockRejectedValue(
        new MatchRepositoryError("다른 회원이 지운 경기예요", 404),
      );

      const response = await deleteMatch();

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "다른 회원이 지운 경기예요" });
      expect(recalculate).not.toHaveBeenCalled();
    });

    it("시작 2시간이 지난 점수 없는 진행 중 경기는 이미 없는 경기로 404", async () => {
      existing = buildInProgressMatch({
        matchStartsAt: new Date(Date.now() - 2 * HOUR_MS - 1000),
      });

      const response = await deleteMatch();

      expect(response.status).toBe(404);
      expect(deleteRecorded).not.toHaveBeenCalled();
    });

    it("expectedUpdatedAt이 서버 값과 다르면 409", async () => {
      const response = await deleteMatch(
        existing.id,
        `?expectedUpdatedAt=${encodeURIComponent(
          new Date(existing.updatedAt.getTime() - 60_000).toISOString(),
        )}`,
      );

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: "다른 회원이 먼저 고쳤어요" });
      expect(deleteRecorded).not.toHaveBeenCalled();
    });

    it("저장소가 그사이 바뀐 updatedAt을 찾으면 409", async () => {
      deleteRecorded.mockRejectedValue(
        new MatchRepositoryError("다른 회원이 먼저 고쳤어요", 409),
      );

      const response = await deleteMatch(
        existing.id,
        `?expectedUpdatedAt=${encodeURIComponent(existing.updatedAt.toISOString())}`,
      );

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: "다른 회원이 먼저 고쳤어요" });
      expect(recalculate).not.toHaveBeenCalled();
    });

    it("expectedUpdatedAt 형식이 틀리면 400", async () => {
      const response = await deleteMatch(existing.id, "?expectedUpdatedAt=abc");

      expect(response.status).toBe(400);
      expect(deleteRecorded).not.toHaveBeenCalled();
    });
  });
});

describe("PUT /api/matches/:matchId expectedUpdatedAt", () => {
  let existing: Match;
  let updateRecordedMatch: MockInstance<MatchRepository["updateRecordedMatch"]>;

  const body = (expectedUpdatedAt?: string) => ({
    teams: [
      { playerIds: [requester.id, partner.id] },
      { playerIds: [opponentM.id, opponentF.id] },
    ],
    location: "야탑초등학교",
    scores: [{ scoreA: 11, scoreB: 9 }],
    expectedUpdatedAt,
  });

  beforeEach(() => {
    existing = buildInProgressMatch();
    vi.spyOn(
      MatchRepository.prototype,
      "findCompletedMatchOutcomes",
    ).mockResolvedValue([]);
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue(
      undefined,
    );
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession(requester));
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
      requester,
    );
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([
      partner,
      opponentM,
      opponentF,
    ]);
    vi.spyOn(MatchRepository.prototype, "findById").mockImplementation(
      async (matchId) => (matchId === existing.id ? existing : undefined),
    );
    updateRecordedMatch = vi
      .spyOn(MatchRepository.prototype, "updateRecordedMatch")
      .mockImplementation(async (matchId, input) => ({
        ...existing,
        id: matchId,
        teams: input.teams,
        scores: input.scores,
        status: "completed",
        completedAt: input.resultSubmittedAt,
      }));
    vi.spyOn(
      AuthService.prototype,
      "applyMatchResultToRatings",
    ).mockResolvedValue({ ratingChangeLogs: [], changedPlayerCount: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("서버 값과 다르면 409로 막고 저장하지 않는다", async () => {
    const response = await request(app)
      .put(`/api/matches/${existing.id}`)
      .set("Authorization", "Bearer test-token")
      .send(
        body(new Date(existing.updatedAt.getTime() - 60_000).toISOString()),
      );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "다른 회원이 먼저 고쳤어요" });
    expect(updateRecordedMatch).not.toHaveBeenCalled();
  });

  it("생략해도 미리 읽은 updatedAt을 조건으로 저장해 동시 첫 점수 입력을 가른다", async () => {
    const response = await request(app)
      .put(`/api/matches/${existing.id}`)
      .set("Authorization", "Bearer test-token")
      .send(body());

    expect(response.status).toBe(200);
    expect(updateRecordedMatch.mock.calls[0]?.[1].expectedUpdatedAt).toEqual(
      existing.updatedAt,
    );
  });

  it("저장 중 다른 회원이 먼저 고친 것이 드러나면 409", async () => {
    updateRecordedMatch.mockRejectedValue(
      new MatchRepositoryError("다른 회원이 먼저 고쳤어요", 409),
    );

    const response = await request(app)
      .put(`/api/matches/${existing.id}`)
      .set("Authorization", "Bearer test-token")
      .send(body(existing.updatedAt.toISOString()));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "다른 회원이 먼저 고쳤어요" });
  });
});

describe("경기 삭제 감사 로그", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("지운 행의 상태와 경기 전체 스냅샷을 돌려주고 로그 입력을 저장소에 넘긴다", async () => {
    const snapshot = buildExistingMatch();
    const deleteRecordedMatch = vi
      .spyOn(db.matches, "deleteRecordedMatch")
      .mockResolvedValue({ status: "completed", match: snapshot });
    const repository = new MatchRepository();
    const expectedUpdatedAt = snapshot.updatedAt;

    const result = await repository.deleteRecorded(snapshot.id, {
      deletedByPlayerId: requester.id,
      deletedByAdmin: false,
      expectedUpdatedAt,
    });

    expect(result.status).toBe("completed");
    expect(result.match).toMatchObject({
      id: snapshot.id,
      completedAt: snapshot.completedAt,
    });
    const [matchId, input] = deleteRecordedMatch.mock.calls[0]!;
    expect(matchId).toBe(snapshot.id);
    expect(input).toMatchObject({
      deletedByPlayerId: requester.id,
      deletedByAdmin: false,
      expectedUpdatedAt,
    });
    expect(input.logId).toMatch(/^match-deletion-/);
    expect(input.deletedAt).toBeInstanceOf(Date);
  });

  it("관리자 삭제 로그는 deletedByAdmin이 참이다", async () => {
    const deleteRecordedMatch = vi
      .spyOn(db.matches, "deleteRecordedMatch")
      .mockResolvedValue({ status: "created", match: buildInProgressMatch() });

    await new MatchRepository().deleteRecorded("Mdelete1", {
      deletedByPlayerId: "admin-001",
      deletedByAdmin: true,
    });

    expect(deleteRecordedMatch.mock.calls[0]?.[1]).toMatchObject({
      deletedByPlayerId: "admin-001",
      deletedByAdmin: true,
    });
  });

  it("db 저장소의 감사 로그 INSERT에 경기 전체 스냅샷을 JSON으로 싣는다", async () => {
    const { buildMatchDeletionLogInsert } = await import("@pkpkdupr/db");
    const snapshot = buildExistingMatch();
    const deletedAt = new Date("2026-07-14T10:00:30.500Z");

    const statement = buildMatchDeletionLogInsert({
      id: "match-deletion-1",
      matchId: snapshot.id,
      deletedByPlayerId: requester.id,
      deletedByAdmin: false,
      matchSnapshot: snapshot,
      deletedAt,
    });

    expect(typeof statement).toBe("object");
    const { sql, args } = statement as { sql: string; args: unknown[] };
    expect(sql).toContain("INSERT INTO match_deletion_logs");
    expect(args.slice(0, 4)).toEqual([
      "match-deletion-1",
      snapshot.id,
      requester.id,
      false,
    ]);
    expect(JSON.parse(args[4] as string)).toMatchObject({
      id: snapshot.id,
      status: "completed",
      scores: snapshot.scores,
      completedAt: snapshot.completedAt!.toISOString(),
    });
    expect(args[5]).toBe(Math.floor(deletedAt.getTime() / 1000));
  });
});

describe("평점 쓰기 직렬화", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("증분 반영은 잠금 안에서 경기를 다시 읽고, 지워졌으면 평점 효과를 남기지 않는다", async () => {
    const run = vi
      .spyOn(db.ratingWriteLock, "run")
      .mockImplementation((fn) => fn());
    vi.spyOn(db.matches, "findById").mockResolvedValue(undefined);
    const createLog = vi.spyOn(db.playerRatingChangeLogs, "create");
    const updateDuprState = vi.spyOn(db.players, "updateDuprState");

    const result = await new AuthService().applyMatchResultToRatings(
      buildExistingMatch(),
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ratingChangeLogs: [], changedPlayerCount: 0 });
    expect(createLog).not.toHaveBeenCalled();
    expect(updateDuprState).not.toHaveBeenCalled();
  });

  it("두 평점 쓰기가 겹치면 잠금 순서대로 하나씩 실행된다", async () => {
    let tail: Promise<unknown> = Promise.resolve();
    const order: string[] = [];
    vi.spyOn(db.ratingWriteLock, "run").mockImplementation((fn) => {
      const next = tail.then(() => fn());
      tail = next.catch(() => undefined);
      return next;
    });
    vi.spyOn(db.matches, "findById").mockImplementation(async (matchId) => {
      order.push(`start:${matchId}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end:${matchId}`);
      return undefined;
    });
    const service = new AuthService();

    await Promise.all([
      service.applyMatchResultToRatings(buildExistingMatch({ id: "Ma" })),
      service.applyMatchResultToRatings(buildExistingMatch({ id: "Mb" })),
    ]);

    expect(order).toEqual(["start:Ma", "end:Ma", "start:Mb", "end:Mb"]);
  });
});
