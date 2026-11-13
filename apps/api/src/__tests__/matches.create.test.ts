import type { CompletedMatchOutcome } from "@pkpkdupr/db";
import type { ManagedMatchSession, Match } from "@pkpkdupr/shared/match";
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

const now = new Date("2026-07-08T10:00:00.000Z");

const creator: Player = {
  isGuest: false,
  id: "player-creator",
  username: "creator",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
};

const femaleCreator: Player = {
  isGuest: false,
  id: "player-f-creator",
  username: "female-creator",
  gender: "F",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
};

const players: Player[] = [
  {
    id: "player-m-1",
    username: "male-1",
    gender: "M",
    status: "active",
    isGuest: false,
    duprRating: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "player-m-2",
    username: "male-2",
    gender: "M",
    status: "active",
    isGuest: false,
    duprRating: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "player-f-1",
    username: "female-1",
    gender: "F",
    status: "active",
    isGuest: false,
    duprRating: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "player-f-2",
    username: "female-2",
    gender: "F",
    status: "active",
    isGuest: false,
    duprRating: null,
    createdAt: now,
    updatedAt: now,
  },
];

const playersById = new Map<string, Player>(
  [creator, ...players].map((player) => [player.id, player]),
);

const buildSession = (player: Player = creator): AuthenticatedSession => ({
  payload: {
    playerId: player.id,
    isAdmin: false,
  },
  player,
  isFirstLogin: false,
});

const buildCreatedMatch = (
  input: Omit<Match, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Match => ({
  id: input.id ?? "match-test-001",
  ...input,
  createdAt: now,
  updatedAt: now,
});

const ratingChangeLog: PlayerRatingChangeLog = {
  id: "log-001",
  playerId: creator.id,
  source: "match_completed",
  sourceLogId: "match-completed-match-test-001-1",
  previousRating: { singles: 3, doubles: 3 },
  nextRating: { singles: 3.1, doubles: 3 },
  delta: { singles: 0.1, doubles: 0 },
  createdAt: now,
};

const buildManagedSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Sregular1",
  name: "정기 세션",
  // 2026-11-12(목) 18:00 KST
  date: new Date("2026-11-12T09:00:00.000Z"),
  location: "야탑초등학교",
  participantIds: [],
  matchCount: 0,
  kind: "regular",
  startTime: null,
  endTime: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe("POST /api/matches", () => {
  let capturedCreatePayload:
    | (Omit<Match, "id" | "createdAt" | "updatedAt"> & { id?: string })
    | null;
  let applyMatchResult: MockInstance<
    AuthService["applyMatchResultToRatings"]
  >;
  let findOrCreateRegularSession: MockInstance<
    MatchRepository["findOrCreateRegularSession"]
  >;
  let addSessionParticipants: MockInstance<
    MatchRepository["addSessionParticipants"]
  >;
  let findSessionById: MockInstance<MatchRepository["findSessionById"]>;
  let findCompletedMatchOutcomes: MockInstance<
    MatchRepository["findCompletedMatchOutcomes"]
  >;

  beforeEach(() => {
    capturedCreatePayload = null;
    findCompletedMatchOutcomes = vi
      .spyOn(MatchRepository.prototype, "findCompletedMatchOutcomes")
      .mockResolvedValue([]);
    findOrCreateRegularSession = vi
      .spyOn(MatchRepository.prototype, "findOrCreateRegularSession")
      .mockResolvedValue(buildManagedSession());
    addSessionParticipants = vi
      .spyOn(MatchRepository.prototype, "addSessionParticipants")
      .mockResolvedValue(undefined);
    findSessionById = vi
      .spyOn(MatchRepository.prototype, "findSessionById")
      .mockResolvedValue(undefined);
    applyMatchResult = vi
      .spyOn(AuthService.prototype, "applyMatchResultToRatings")
      .mockResolvedValue({
        ratingChangeLogs: [ratingChangeLog],
        changedPlayerCount: 1,
      });

    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(buildSession());
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(creator);
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue(
      players,
    );
    vi.spyOn(MatchRepository.prototype, "create").mockImplementation(
      async (input) => {
        capturedCreatePayload = input;
        return buildCreatedMatch(input);
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const postMatch = async (teamPlayerIds: [string[], string[]]) =>
    request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        teams: [
          { name: "Team A", playerIds: teamPlayerIds[0] },
          { name: "Team B", playerIds: teamPlayerIds[1] },
        ],
        location: "Court TBD",
        scores: [{ scoreA: 11, scoreB: 7 }],
      });

  const validDoublesTeams = [
    { name: "Team A", playerIds: [creator.id, "player-f-1"] },
    { name: "Team B", playerIds: ["player-m-1", "player-f-2"] },
  ];

  it.each([
    {
      name: "서로 다른 성별 1:1은 singles",
      teams: [[creator.id], ["player-f-1"]] as [string[], string[]],
      expectedType: "singles",
    },
    {
      name: "같은 성별 1:1은 unrestricted-singles",
      teams: [[creator.id], ["player-m-1"]] as [string[], string[]],
      expectedType: "unrestricted-singles",
    },
    {
      name: "양 팀 모두 혼성 복식은 mixed-doubles",
      teams: [
        [creator.id, "player-f-1"],
        ["player-m-1", "player-f-2"],
      ] as [string[], string[]],
      expectedType: "mixed-doubles",
    },
    {
      name: "남성 4인 복식은 men-doubles",
      teams: [
        [creator.id, "player-m-1"],
        ["player-m-2", "player-m-1"],
      ] as [string[], string[]],
      expectedType: "men-doubles",
      invalid: true,
    },
    {
      name: "여성 4인 복식은 women-doubles",
      teams: [
        ["player-f-1", "player-f-2"],
        ["player-f-1", "player-f-2"],
      ] as [string[], string[]],
      expectedType: "women-doubles",
      invalid: true,
    },
    {
      name: "그 외 복식 구성은 unrestricted-doubles",
      teams: [
        [creator.id, "player-m-1"],
        ["player-m-2", "player-f-1"],
      ] as [string[], string[]],
      expectedType: "unrestricted-doubles",
    },
  ])("$name", async ({ teams, expectedType, invalid }) => {
    let expectedCreatorId = creator.id;

    if (invalid) {
      // duplicate player IDs are invalid; preserve unique fixtures while keeping target gender composition
      if (expectedType === "men-doubles") {
        playersById.set("player-m-3", {
          id: "player-m-3",
          username: "male-3",
          gender: "M",
          status: "active",
          isGuest: false,
          duprRating: null,
          createdAt: now,
          updatedAt: now,
        });
        vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([
          ...players,
          playersById.get("player-m-3")!,
        ]);
        teams = [
          [creator.id, "player-m-1"],
          ["player-m-2", "player-m-3"],
        ];
      }

      if (expectedType === "women-doubles") {
        playersById.set("player-f-3", {
          id: "player-f-3",
          username: "female-3",
          gender: "F",
          status: "active",
          isGuest: false,
          duprRating: null,
          createdAt: now,
          updatedAt: now,
        });
        vi.spyOn(
          AuthService.prototype,
          "authenticateAccessToken",
        ).mockResolvedValue(buildSession(femaleCreator));
        vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(
          femaleCreator,
        );
        expectedCreatorId = femaleCreator.id;
        vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([
          ...players,
          playersById.get("player-f-3")!,
        ]);
        teams = [
          [femaleCreator.id, "player-f-1"],
          ["player-f-2", "player-f-3"],
        ];
      }
    }

    const response = await postMatch(teams);

    expect(response.status).toBe(201);
    expect(capturedCreatePayload).not.toBeNull();
    expect(capturedCreatePayload?.type).toBe(expectedType);
    expect(capturedCreatePayload?.creatorPlayerId).toBe(expectedCreatorId);
    expect(capturedCreatePayload?.status).toBe("completed");
    expect(response.body.type).toBe(expectedType);
  });

  it("type을 보내지 않아도 생성에 성공한다", async () => {
    const response = await postMatch([
      [creator.id, "player-f-1"],
      ["player-m-1", "player-f-2"],
    ]);

    expect(response.status).toBe(201);
    expect(capturedCreatePayload?.type).toBe("mixed-doubles");
  });

  it("점수와 함께 completed로 저장하고 시작 시각은 바디 값을 무시한 서버 now다", async () => {
    const before = Date.now();

    const response = await request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        name: "  ",
        teams: validDoublesTeams,
        location: "PKELO Court A",
        courtName: "1번 코트",
        matchStartsAt: "2020-01-01T00:00:00.000Z",
        scores: [{ scoreA: 15, scoreB: 13 }],
      });

    const after = Date.now();

    expect(response.status).toBe(201);
    const payload = capturedCreatePayload!;
    expect(payload.status).toBe("completed");
    expect(payload.source).toBe("player_created");
    expect(payload.creatorPlayerId).toBe(creator.id);
    expect(payload.resultSubmittedByPlayerId).toBe(creator.id);
    expect(payload.scores).toEqual([{ scoreA: 15, scoreB: 13 }]);
    expect(payload.name).toBeUndefined();
    expect(payload.courtName).toBeUndefined();
    const startsAt = payload.matchStartsAt.getTime();
    expect(startsAt).toBeGreaterThanOrEqual(before);
    expect(startsAt).toBeLessThanOrEqual(after);
    expect(payload.completedAt?.getTime()).toBe(startsAt);
    expect(payload.resultSubmittedAt?.getTime()).toBe(startsAt);
  });

  it("저장 후 applyMatchResultToRatings를 1회 호출하고 ratingChanges를 응답한다", async () => {
    const response = await request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        teams: validDoublesTeams,
        location: "PKELO Court A",
        scores: [{ scoreA: 11, scoreB: 9 }],
      });

    expect(response.status).toBe(201);
    expect(applyMatchResult).toHaveBeenCalledTimes(1);
    expect(applyMatchResult.mock.calls[0]?.[0]).toMatchObject({
      id: "match-test-001",
      status: "completed",
    });
    expect(response.body.status).toBe("completed");
    expect(response.body.ratingChanges).toEqual([
      expect.objectContaining({ id: ratingChangeLog.id }),
    ]);
  });

  it.each([
    { name: "점수가 없으면", scores: undefined },
    { name: "점수가 비었으면", scores: [] },
    { name: "동점이면", scores: [{ scoreA: 10, scoreB: 10 }] },
    {
      name: "점수가 2개면",
      scores: [
        { scoreA: 11, scoreB: 9 },
        { scoreA: 11, scoreB: 9 },
      ],
    },
    {
      name: "2선승 형식(점수 3개)이면",
      scores: [
        { scoreA: 11, scoreB: 9 },
        { scoreA: 8, scoreB: 11 },
        { scoreA: 11, scoreB: 6 },
      ],
    },
  ] as Array<{ name: string; scores?: unknown }>)(
    "$name 400을 반환하고 저장하지 않는다",
    async ({ scores }) => {
    const response = await request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        teams: validDoublesTeams,
        location: "PKELO Court A",
        scores,
      });

    expect(response.status).toBe(400);
    expect(capturedCreatePayload).toBeNull();
    expect(applyMatchResult).not.toHaveBeenCalled();
    },
  );

  describe("newAchievements", () => {
    const priorWin = (id: string, completedAt: Date): CompletedMatchOutcome => ({
      ratingExcluded: false,
      id,
      type: "mixed-doubles",
      sessionId: null,
      matchStartsAt: completedAt,
      completedAt,
      teamPlayerIds: [
        [creator.id, "player-f-1"],
        ["player-m-1", "player-f-2"],
      ],
      scores: [{ scoreA: 11, scoreB: 5 }],
    });

    it("저장 전후 계산 차이로 참가자 전원이 새로 받은 업적을 응답한다", async () => {
      // 저장한 경기는 서버 now에 완료되므로 앞선 두 승리보다 늦다.
      findCompletedMatchOutcomes.mockImplementation(async () => {
        const saved = capturedCreatePayload;
        return [
          priorWin("match-prior-1", new Date("2026-01-01T00:00:00.000Z")),
          priorWin("match-prior-2", new Date("2026-01-02T00:00:00.000Z")),
          priorWin("match-test-001", saved?.completedAt ?? new Date()),
        ];
      });

      const response = await request(app)
        .post("/api/matches")
        .set("Authorization", "Bearer test-token")
        .send({
          teams: validDoublesTeams,
          location: "PKELO Court A",
          scores: [{ scoreA: 11, scoreB: 5 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.newAchievements).toEqual([
        expect.objectContaining({
          playerId: creator.id,
          achievementId: "streak-3",
          earnedMatchId: "match-test-001",
        }),
        expect.objectContaining({
          playerId: "player-f-1",
          achievementId: "streak-3",
          earnedMatchId: "match-test-001",
        }),
      ]);
    });

    it("새로 받은 업적이 없으면 빈 배열이고, 업적 계산이 실패해도 저장 응답은 201이다", async () => {
      const empty = await postMatch([[creator.id], ["player-m-1"]]);
      expect(empty.status).toBe(201);
      expect(empty.body.newAchievements).toEqual([]);

      vi.spyOn(console, "error").mockImplementation(() => undefined);
      findCompletedMatchOutcomes.mockRejectedValue(new Error("db down"));
      const failed = await postMatch([[creator.id], ["player-m-1"]]);
      expect(failed.status).toBe(201);
      expect(failed.body.newAchievements).toEqual([]);
    });
  });

  it("이긴 팀 점수가 11점이 아니어도 저장한다", async () => {
    const response = await request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        teams: validDoublesTeams,
        location: "PKELO Court A",
        scores: [{ scoreA: 7, scoreB: 21 }],
      });

    expect(response.status).toBe(201);
    expect(capturedCreatePayload?.scores).toEqual([{ scoreA: 7, scoreB: 21 }]);
  });

  it("평점 반영만 실패하면 경기는 저장되고 500과 안내 문구를 응답한다", async () => {
    applyMatchResult.mockRejectedValue(new Error("rating failure"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        teams: validDoublesTeams,
        location: "PKELO Court A",
        scores: [{ scoreA: 11, scoreB: 7 }],
      });

    expect(capturedCreatePayload).not.toBeNull();
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error:
        "경기는 저장됐지만 평점 반영에 실패했습니다. 관리자에게 평점 재계산을 요청해 주세요.",
    });
  });

  it("요청자가 팀에 없어도 기록된다", async () => {
    const response = await postMatch([["player-m-1"], ["player-f-1"]]);

    expect(response.status).toBe(201);
    expect(capturedCreatePayload?.creatorPlayerId).toBe(creator.id);
    expect(
      capturedCreatePayload?.teams.flatMap((team) =>
        team.players.map((player) => player.id),
      ),
    ).toEqual(["player-m-1", "player-f-1"]);
  });

  it("요청자가 active가 아니면 403을 반환한다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue({
      ...creator,
      status: "inactive",
    });

    const response = await postMatch([[creator.id], ["player-f-1"]]);

    expect(response.status).toBe(403);
  });

  describe("세션 지정", () => {
    const setNow = (iso: string) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(iso));
    };

    const postDoublesMatch = (sessionId?: string) =>
      request(app)
        .post("/api/matches")
        .set("Authorization", "Bearer test-token")
        .send({
          teams: validDoublesTeams,
          location: "야탑초등학교",
          scores: [{ scoreA: 11, scoreB: 7 }],
          sessionId,
        });

    const allPlayerIds = [creator.id, "player-f-1", "player-m-1", "player-f-2"];

    it("정기 시간대에 기록하면 그날 정기 세션에 넣고 선수 전원을 참여자로 추가한다", async () => {
      // 2026-11-12(목) 19:00 KST
      setNow("2026-11-12T10:00:00.000Z");
      const regularSession = buildManagedSession();
      findOrCreateRegularSession.mockResolvedValue(regularSession);

      const response = await postDoublesMatch();

      expect(response.status).toBe(201);
      expect(findOrCreateRegularSession).toHaveBeenCalledWith("2026-11-12");
      expect(addSessionParticipants).toHaveBeenCalledWith(
        regularSession.id,
        allPlayerIds,
      );
      expect(capturedCreatePayload?.session).toEqual({
        id: regularSession.id,
        name: regularSession.name,
        date: regularSession.date,
        location: regularSession.location,
      });
    });

    it("22:00에 시작한 경기는 세션 없이 저장한다", async () => {
      // 2026-11-12(목) 22:00 KST
      setNow("2026-11-12T13:00:00.000Z");

      const response = await postDoublesMatch();

      expect(response.status).toBe(201);
      expect(findOrCreateRegularSession).not.toHaveBeenCalled();
      expect(addSessionParticipants).not.toHaveBeenCalled();
      expect(capturedCreatePayload?.session).toBeUndefined();
    });

    it("정기 세션 id를 넘겨도 정기 시간대가 아니면 세션 없이 저장한다", async () => {
      // 2026-11-12(목) 22:30 KST
      setNow("2026-11-12T13:30:00.000Z");
      findSessionById.mockResolvedValue(buildManagedSession());

      const response = await postDoublesMatch("Sregular1");

      expect(response.status).toBe(201);
      expect(findOrCreateRegularSession).not.toHaveBeenCalled();
      expect(capturedCreatePayload?.session).toBeUndefined();
    });

    it("오늘 회원 세션 id를 지정하면 그 세션에 넣는다", async () => {
      // 2026-11-12(목) 19:00 KST — 정기 시간대여도 지정한 회원 세션이 우선한다
      setNow("2026-11-12T10:00:00.000Z");
      const customSession = buildManagedSession({
        id: "Scustom1",
        name: "번개",
        // 2026-11-12 17:00 KST
        date: new Date("2026-11-12T08:00:00.000Z"),
        location: "탄천",
        kind: "custom",
      });
      findSessionById.mockResolvedValue(customSession);

      const response = await postDoublesMatch(customSession.id);

      expect(response.status).toBe(201);
      expect(findSessionById).toHaveBeenCalledWith(customSession.id);
      expect(findOrCreateRegularSession).not.toHaveBeenCalled();
      expect(addSessionParticipants).toHaveBeenCalledWith(
        customSession.id,
        allPlayerIds,
      );
      expect(capturedCreatePayload?.session).toMatchObject({
        id: customSession.id,
        name: "번개",
        location: "탄천",
      });
    });

    it("지난 회원 세션 id를 지정하면 403을 반환하고 저장하지 않는다", async () => {
      // 2026-11-12(목) 19:00 KST
      setNow("2026-11-12T10:00:00.000Z");
      findSessionById.mockResolvedValue(
        buildManagedSession({
          id: "Scustom2",
          // 2026-11-11 20:00 KST
          date: new Date("2026-11-11T11:00:00.000Z"),
          kind: "custom",
        }),
      );

      const response = await postDoublesMatch("Scustom2");

      expect(response.status).toBe(403);
      expect(capturedCreatePayload).toBeNull();
      expect(addSessionParticipants).not.toHaveBeenCalled();
    });

    it("없는 세션 id를 지정하면 404를 반환한다", async () => {
      const response = await postDoublesMatch("Smissing");

      expect(response.status).toBe(404);
      expect(capturedCreatePayload).toBeNull();
    });
  });
});
