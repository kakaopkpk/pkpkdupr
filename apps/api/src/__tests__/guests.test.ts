import type { ManagedMatchSession, Match } from "@pkpkdupr/shared/match";
import type {
  Player,
  PlayerRatingChangeLog,
  StoredPlayerDupr,
} from "@pkpkdupr/shared/player";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from "vitest";
import { db } from "../db";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";
import type { RatingServiceContract } from "../services/RatingContract";
import {
  buildRankingResponse,
  createRankingContext,
  type RankingMatch,
} from "../services/RankingService";

// 2026-11-12는 목요일, 2026-11-11은 수요일(정기 세션 요일이 아님)이다.
const thursdayMorning = new Date("2026-11-12T10:00:00+09:00");
const wednesdayMorning = new Date("2026-11-11T10:00:00+09:00");

const makePlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  username: id,
  gender: "M",
  status: "active",
  isGuest: false,
  duprRating: { singles: 3.5, doubles: 3.5 },
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
  ...overrides,
});

const requester = makePlayer("Pmember1");
const partner = makePlayer("Pmember2", { gender: "F" });
const opponentM = makePlayer("Pmember3");
const opponentF = makePlayer("Pmember4", { gender: "F" });
const guest = makePlayer("Pguest01", {
  username: "guest_kim",
  gender: null,
  isGuest: true,
  duprRating: null,
});

const requesterSession: AuthenticatedSession = {
  payload: { playerId: requester.id, isAdmin: false },
  player: requester,
  isFirstLogin: false,
};

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Scustom1",
  name: "번개",
  date: new Date("2026-11-12T00:00:00+09:00"),
  location: "탄천",
  participantIds: [],
  matchCount: 0,
  kind: "custom",
  startTime: null,
  endTime: null,
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
  ...overrides,
});

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
  id: "Mmatch01",
  type: "unrestricted-doubles",
  source: "player_created",
  creatorPlayerId: requester.id,
  status: "completed",
  teams: [
    { id: "team-a", name: "Team A", players: [requester, partner] },
    { id: "team-b", name: "Team B", players: [opponentM, guest] },
  ],
  scores: [{ scoreA: 11, scoreB: 7 }],
  resultSubmittedByPlayerId: requester.id,
  resultSubmittedAt: wednesdayMorning,
  location: "야탑초등학교",
  matchStartsAt: wednesdayMorning,
  completedAt: wednesdayMorning,
  createdAt: wednesdayMorning,
  updatedAt: wednesdayMorning,
  ratingExcluded: true,
  ...overrides,
});

const useNow = (now: Date) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/match-sessions/:sessionId/guests", () => {
  let sessionDate: Date;
  let createPlayer: MockInstance<typeof db.players.create>;
  let addSessionParticipants: MockInstance<
    MatchRepository["addSessionParticipants"]
  >;

  beforeEach(() => {
    useNow(thursdayMorning);
    sessionDate = new Date("2026-11-12T00:00:00+09:00");
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(requesterSession);
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async () => makeSession({ date: sessionDate }),
    );
    addSessionParticipants = vi
      .spyOn(MatchRepository.prototype, "addSessionParticipants")
      .mockResolvedValue(undefined);
    vi.spyOn(db.players, "findByUsernameIgnoringCase").mockResolvedValue(
      undefined,
    );
    createPlayer = vi
      .spyOn(db.players, "create")
      .mockImplementation(
        async (input) =>
          ({
            ...input,
            gender: input.gender ?? null,
            isGuest: input.isGuest ?? false,
            guestAddedByPlayerId: input.guestAddedByPlayerId ?? null,
            guestAddedSessionId: input.guestAddedSessionId ?? null,
            duprRating: null,
            authUserId: null,
            isFirstLogin: false,
          }) as any,
      );
  });

  const addGuest = (username: unknown, sessionId = "Scustom1") =>
    request(app)
      .post(`/api/match-sessions/${sessionId}/guests`)
      .set("Authorization", "Bearer token")
      .send({ username });

  it("게스트를 만들고 세션 참여자로 넣어 201로 돌려준다", async () => {
    const response = await addGuest(" guest_kim ");

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      username: "guest_kim",
      gender: null,
      status: "active",
      isGuest: true,
      duprRating: null,
    });
    // 추가 정보·Auth 연결은 공개 응답에 내보내지 않는다
    expect(response.body).not.toHaveProperty("guestAddedByPlayerId");
    expect(response.body).not.toHaveProperty("guestAddedSessionId");
    expect(response.body).not.toHaveProperty("authUserId");

    expect(createPlayer).toHaveBeenCalledTimes(1);
    const [input] = createPlayer.mock.calls[0]!;
    expect(input).toMatchObject({
      username: "guest_kim",
      gender: null,
      status: "active",
      isGuest: true,
      guestAddedByPlayerId: requester.id,
      guestAddedSessionId: "Scustom1",
    });
    expect(input.authUserId ?? null).toBeNull();
    expect(addSessionParticipants).toHaveBeenCalledWith("Scustom1", [
      response.body.id,
    ]);
  });

  it("미래 세션에도 추가할 수 있다", async () => {
    sessionDate = new Date("2026-11-16T00:00:00+09:00");

    const response = await addGuest("guest_lee");

    expect(response.status).toBe(201);
  });

  it("아이디 형식이 틀리면 400이고 아무것도 만들지 않는다", async () => {
    for (const username of ["", "게스트", "a b", undefined]) {
      const response = await addGuest(username);
      expect(response.status).toBe(400);
    }
    expect(createPlayer).not.toHaveBeenCalled();
    expect(addSessionParticipants).not.toHaveBeenCalled();
  });

  it("대소문자 무시로 이미 있는 아이디면 409", async () => {
    vi.spyOn(db.players, "findByUsernameIgnoringCase").mockImplementation(
      async (username) =>
        username.toLowerCase() === "pmember1"
          ? ({
              ...requester,
              authUserId: null,
              isFirstLogin: false,
              guestAddedByPlayerId: null,
              guestAddedSessionId: null,
            } as Awaited<ReturnType<typeof db.players.findByUsernameIgnoringCase>>)
          : undefined,
    );

    const response = await addGuest("PMEMBER1");

    expect(response.status).toBe(409);
    expect(createPlayer).not.toHaveBeenCalled();
    expect(addSessionParticipants).not.toHaveBeenCalled();
  });

  it("동시 요청으로 유니크 위반이 나도 409", async () => {
    createPlayer.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );

    const response = await addGuest("guest_kim");

    expect(response.status).toBe(409);
    expect(addSessionParticipants).not.toHaveBeenCalled();
  });

  it("지난 세션이면 403", async () => {
    sessionDate = new Date("2026-11-11T00:00:00+09:00");

    const response = await addGuest("guest_kim");

    expect(response.status).toBe(403);
    expect(createPlayer).not.toHaveBeenCalled();
  });

  it("세션이 없으면 404, 세션 ID 형식이 틀리면 400", async () => {
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      undefined,
    );

    expect((await addGuest("guest_kim")).status).toBe(404);
    expect((await addGuest("guest_kim", "not-a-session")).status).toBe(400);
    expect(createPlayer).not.toHaveBeenCalled();
  });
});

describe("게스트가 낀 경기 기록·수정의 ratingExcluded", () => {
  let publicPlayers: Player[];
  let applyMatchResult: MockInstance<
    AuthService["applyMatchResultToRatings"]
  >;

  beforeEach(() => {
    useNow(wednesdayMorning);
    publicPlayers = [requester, partner, opponentM, opponentF, guest];
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(requesterSession);
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
      requester,
    );
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockImplementation(
      async () => publicPlayers,
    );
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    vi.spyOn(
      MatchRepository.prototype,
      "findCompletedMatchOutcomes",
    ).mockResolvedValue([]);
    vi.spyOn(
      MatchRepository.prototype,
      "addSessionParticipants",
    ).mockResolvedValue(undefined);
    applyMatchResult = vi
      .spyOn(AuthService.prototype, "applyMatchResultToRatings")
      .mockResolvedValue({ ratingChangeLogs: [], changedPlayerCount: 0 });
  });

  describe("POST /api/matches", () => {
    let create: MockInstance<MatchRepository["create"]>;

    beforeEach(() => {
      create = vi
        .spyOn(MatchRepository.prototype, "create")
        .mockImplementation(async (input) => ({
          ...input,
          id: "Mmatch01",
          createdAt: wednesdayMorning,
          updatedAt: wednesdayMorning,
        }));
    });

    const record = (teamB: string[]) =>
      request(app)
        .post("/api/matches")
        .set("Authorization", "Bearer token")
        .send({
          teams: [
            { playerIds: [requester.id, partner.id] },
            { playerIds: teamB },
          ],
          location: "야탑초등학교",
          scores: [{ scoreA: 11, scoreB: 7 }],
        });

    it("게스트가 한 명이라도 있으면 ratingExcluded=true로 저장하고 응답에 싣는다", async () => {
      const response = await record([opponentM.id, guest.id]);

      expect(response.status).toBe(201);
      expect(create.mock.calls[0]![0]).toMatchObject({
        status: "completed",
        ratingExcluded: true,
      });
      expect(response.body.ratingExcluded).toBe(true);
    });

    it("정회원끼리 경기는 ratingExcluded=false로 평점에 반영한다", async () => {
      const response = await record([opponentM.id, opponentF.id]);

      expect(response.status).toBe(201);
      expect(create.mock.calls[0]![0]).toMatchObject({ ratingExcluded: false });
      expect(applyMatchResult).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/matches/:matchId", () => {
    let existing: Match;
    let updateRecordedMatch: MockInstance<
      MatchRepository["updateRecordedMatch"]
    >;
    let recalculate: MockInstance<AuthService["recalculateDuprRatings"]>;

    beforeEach(() => {
      vi.spyOn(MatchRepository.prototype, "findById").mockImplementation(
        async () => existing,
      );
      updateRecordedMatch = vi
        .spyOn(MatchRepository.prototype, "updateRecordedMatch")
        .mockImplementation(async (matchId, input) => ({
          ...existing,
          id: matchId,
          type: input.type,
          teams: input.teams,
          scores: input.scores,
          status: "completed",
          completedAt: existing.completedAt ?? input.resultSubmittedAt,
          ratingExcluded: input.ratingExcluded,
        }));
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

    const update = (teamB: string[]) =>
      request(app)
        .put(`/api/matches/${existing.id}`)
        .set("Authorization", "Bearer token")
        .send({
          teams: [
            { playerIds: [requester.id, partner.id] },
            { playerIds: teamB },
          ],
          location: "야탑초등학교",
          scores: [{ scoreA: 11, scoreB: 9 }],
        });

    it("수정으로 게스트가 빠지면 반영으로 바뀌고 전체 재계산한다", async () => {
      existing = buildMatch({ ratingExcluded: true });

      const response = await update([opponentM.id, opponentF.id]);

      expect(response.status).toBe(200);
      expect(updateRecordedMatch.mock.calls[0]![1]).toMatchObject({
        ratingExcluded: false,
      });
      expect(response.body.ratingExcluded).toBe(false);
      expect(recalculate).toHaveBeenCalledTimes(1);
    });

    it("수정으로 게스트가 들어오면 미반영으로 바뀐다", async () => {
      existing = buildMatch({
        ratingExcluded: false,
        teams: [
          { id: "team-a", name: "Team A", players: [requester, partner] },
          { id: "team-b", name: "Team B", players: [opponentM, opponentF] },
        ],
      });

      const response = await update([opponentM.id, guest.id]);

      expect(response.status).toBe(200);
      expect(updateRecordedMatch.mock.calls[0]![1]).toMatchObject({
        ratingExcluded: true,
      });
      expect(recalculate).toHaveBeenCalledTimes(1);
    });

    it("같은 참가자로 점수만 고치면, 그사이 게스트가 정회원이 됐어도 미반영을 유지한다", async () => {
      existing = buildMatch({ ratingExcluded: true });
      publicPlayers = publicPlayers.map((player) =>
        player.id === guest.id ? { ...player, isGuest: false } : player,
      );

      const response = await update([opponentM.id, guest.id]);

      expect(response.status).toBe(200);
      expect(updateRecordedMatch.mock.calls[0]![1]).toMatchObject({
        ratingExcluded: true,
      });
    });

    it("진행 중 경기에 첫 점수를 넣을 때 게스트가 있으면 미반영으로 완료한다", async () => {
      existing = buildMatch({
        status: "created",
        scores: [],
        completedAt: null,
        resultSubmittedByPlayerId: null,
        resultSubmittedAt: null,
        ratingExcluded: false,
      });

      const response = await update([opponentM.id, guest.id]);

      expect(response.status).toBe(200);
      expect(updateRecordedMatch.mock.calls[0]![1]).toMatchObject({
        ratingExcluded: true,
      });
      expect(recalculate).not.toHaveBeenCalled();
      expect(applyMatchResult).toHaveBeenCalledTimes(1);
    });
  });
});

describe("평점 반영에서 ratingExcluded 경기 제외", () => {
  const createState = (rating: number): StoredPlayerDupr => ({
    rating: { singles: rating, doubles: rating },
    metrics: {
      singles: { confidence: 50, accuracy: null },
      doubles: { confidence: 50, accuracy: null },
    },
  });

  const storedPlayer = (player: Player, state: StoredPlayerDupr | null) => ({
    ...player,
    duprRating: state ? JSON.stringify(state) : null,
    authUserId: null,
    isFirstLogin: false,
    guestAddedByPlayerId: null,
    guestAddedSessionId: null,
  });

  let storedPlayers: Map<string, ReturnType<typeof storedPlayer>>;
  let updateDuprState: MockInstance<typeof db.players.updateDuprState>;
  let replayMatch: Mock<RatingServiceContract["replayMatch"]>;
  let service: AuthService;

  beforeEach(() => {
    storedPlayers = new Map(
      [requester, partner, opponentM, opponentF].map((player) => [
        player.id,
        storedPlayer(player, createState(3.5)),
      ]),
    );
    storedPlayers.set(guest.id, storedPlayer(guest, null));

    vi.spyOn(db.ratingWriteLock, "run").mockImplementation((fn) => fn());
    vi.spyOn(db.players, "findAll").mockImplementation(
      async () => [...storedPlayers.values()] as any,
    );
    vi.spyOn(db.players, "findById").mockImplementation(
      async (playerId) => storedPlayers.get(playerId) as any,
    );
    vi.spyOn(db.officialDuprAdjustmentLogs, "findAll").mockResolvedValue([]);
    vi.spyOn(db.matches, "fillMissingParticipantDuprSnapshots").mockResolvedValue(
      { updatedParticipantCount: 0, updatedMatchCount: 0 },
    );
    vi.spyOn(db.matches, "findPreviousCompletedAt").mockResolvedValue(null);
    vi.spyOn(db.playerRatingChangeLogs, "findByMatchId").mockResolvedValue([]);
    vi.spyOn(db.playerRatingChangeLogs, "create").mockImplementation(
      async (log) => log,
    );
    vi.spyOn(db.playerRatingChangeLogs, "replaceMatchCompleted").mockImplementation(
      async (logs) => logs,
    );
    updateDuprState = vi
      .spyOn(db.players, "updateDuprState")
      .mockImplementation(async (playerId, duprState) => {
        const updated = {
          ...storedPlayers.get(playerId)!,
          duprRating: JSON.stringify(duprState),
        };
        storedPlayers.set(playerId, updated);
        return updated as any;
      });

    // 이긴 팀 +0.1, 진 팀 -0.1
    replayMatch = vi.fn<RatingServiceContract["replayMatch"]>((input) =>
      Object.fromEntries(
        input.participants.map((participant) => {
          const delta =
            participant.teamIndex === input.winnerTeamIndex ? 0.1 : -0.1;
          return [
            participant.playerId,
            {
              ...participant.state,
              rating: {
                singles: participant.state.rating.singles,
                doubles: participant.state.rating.doubles + delta,
              },
            },
          ];
        }),
      ),
    );
    service = new AuthService({
      getAccuracy: () => 0,
      getCorrectionWeight: () => 1,
      replayMatch,
    });
  });

  it("증분 반영: 게스트가 낀 경기는 평점·로그를 남기지 않는다", async () => {
    const match = buildMatch({ ratingExcluded: true });
    vi.spyOn(db.matches, "findById").mockResolvedValue(match);

    const result = await service.applyMatchResultToRatings(match);

    expect(result).toEqual({ ratingChangeLogs: [], changedPlayerCount: 0 });
    expect(replayMatch).not.toHaveBeenCalled();
    expect(updateDuprState).not.toHaveBeenCalled();
  });

  it("증분 반영: 정회원끼리 경기는 평점에 반영한다", async () => {
    const match = buildMatch({
      ratingExcluded: false,
      teams: [
        { id: "team-a", name: "Team A", players: [requester, partner] },
        { id: "team-b", name: "Team B", players: [opponentM, opponentF] },
      ],
    });
    vi.spyOn(db.matches, "findById").mockResolvedValue(match);

    const result = await service.applyMatchResultToRatings(match);

    expect(replayMatch).toHaveBeenCalledTimes(1);
    expect(result.ratingChangeLogs).toHaveLength(4);
    expect(updateDuprState).toHaveBeenCalledTimes(4);
  });

  it("전체 재계산: 게스트 경기는 승급 뒤에도 평점·경기별 로그에 넣지 않는다", async () => {
    // 승급해 정회원이 된 뒤 재계산해도 저장된 ratingExcluded로 계속 뺀다
    const promotedGuest = { ...guest, isGuest: false, gender: "M" as const };
    storedPlayers.set(guest.id, storedPlayer(promotedGuest, null));
    const excluded = buildMatch({
      id: "Mexclude",
      ratingExcluded: true,
      teams: [
        { id: "team-a", name: "Team A", players: [requester, partner] },
        { id: "team-b", name: "Team B", players: [opponentM, promotedGuest] },
      ],
    });
    const rated = buildMatch({
      id: "Mrated01",
      ratingExcluded: false,
      completedAt: new Date(wednesdayMorning.getTime() + 60_000),
      teams: [
        { id: "team-a", name: "Team A", players: [requester, partner] },
        { id: "team-b", name: "Team B", players: [opponentM, opponentF] },
      ],
    });

    const summary = await service.recalculateDuprRatings(
      async () => [excluded, rated],
      { perMatchLogs: true },
    );

    expect(replayMatch).toHaveBeenCalledTimes(1);
    expect(
      replayMatch.mock.calls[0]![0].participants.map(
        (participant) => participant.playerId,
      ),
    ).not.toContain(guest.id);
    const loggedMatchIds = new Set(
      summary.perMatchLogs.map((log: PlayerRatingChangeLog) =>
        log.sourceLogId.replace(/^match-completed-/, "").replace(/-\d+$/, ""),
      ),
    );
    expect([...loggedMatchIds]).toEqual(["Mrated01"]);
    expect(updateDuprState).not.toHaveBeenCalledWith(
      guest.id,
      expect.anything(),
    );
  });
});

describe("랭킹에서 게스트 제외", () => {
  const completedAt = new Date("2026-11-09T19:00:00+09:00");
  const outcome = (
    id: string,
    teamPlayerIds: [string[], string[]],
    ratingExcluded: boolean,
  ): RankingMatch => ({
    id,
    type: "unrestricted-doubles",
    sessionId: null,
    matchStartsAt: completedAt,
    completedAt,
    teamPlayerIds,
    scores: [{ scoreA: 11, scoreB: 5 }],
    ratingExcluded,
  });

  it("게스트는 순위·NR 목록에 없고, 게스트 경기는 경기 수에 세지 않는다", () => {
    const ratedGuest = { ...guest, duprRating: { singles: 4, doubles: 4 } };
    const context = createRankingContext(
      [
        requester,
        partner,
        opponentM,
        opponentF,
        ratedGuest,
        { ...guest, id: "Pguest02", username: "guest_lee" },
      ],
      [],
      [
        outcome(
          "Mrated01",
          [
            [requester.id, partner.id],
            [opponentM.id, opponentF.id],
          ],
          false,
        ),
        outcome(
          "Mexclude",
          [
            [requester.id, partner.id],
            [opponentM.id, ratedGuest.id],
          ],
          true,
        ),
      ],
    );

    const response = buildRankingResponse({
      context,
      category: "doubles",
      sessions: [],
      now: thursdayMorning,
    });

    const rankedIds = response.entries.map((entry) => entry.player.id);
    expect(rankedIds).not.toContain(ratedGuest.id);
    expect(rankedIds).toHaveLength(4);
    expect(response.unrated.map((entry) => entry.player.id)).not.toContain(
      "Pguest02",
    );
    expect(
      response.entries.find((entry) => entry.player.id === requester.id)
        ?.matchCount,
    ).toBe(1);
  });
});
