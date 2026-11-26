import type { ManagedMatchSession, Match } from "@pkpkdupr/shared/match";
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
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

// 2026-11-12는 목요일(정기 세션 요일)이다.
const thursdayEvening = new Date("2026-11-12T19:00:00+09:00");
const thursdayLateNight = new Date("2026-11-12T22:30:00+09:00");

const makePlayer = (id: string, gender: Player["gender"]): Player => ({
  isGuest: false,
  id,
  username: id,
  gender,
  status: "active",
  duprRating: null,
  createdAt: thursdayEvening,
  updatedAt: thursdayEvening,
});

const requester = makePlayer("Prequest", "M");
const playerA = makePlayer("Pplayera", "M");
const playerB = makePlayer("Pplayerb", "F");
const playerC = makePlayer("Pplayerc", "M");
const playerD = makePlayer("Pplayerd", "F");
const activePlayers = [requester, playerA, playerB, playerC, playerD];

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Scustom1",
  name: "번개",
  date: new Date("2026-11-12T09:00:00+09:00"),
  location: "탄천",
  participantIds: [],
  matchCount: 0,
  kind: "custom",
  autoCreated: false,
  startTime: null,
  endTime: null,
  completedAt: null,
  createdAt: thursdayEvening,
  updatedAt: thursdayEvening,
  ...overrides,
});

const regularSession = makeSession({
  id: "Sregular",
  name: "정기 세션",
  date: new Date("2026-11-12T18:00:00+09:00"),
  location: "야탑초등학교",
  kind: "regular",
});

const doublesBody = {
  teams: [
    { playerIds: [playerA.id, playerB.id] },
    { playerIds: [playerC.id, playerD.id] },
  ],
};

describe("POST /api/match-sessions/:sessionId/matches", () => {
  let sessions: ManagedMatchSession[];
  let cleanupExpired: MockInstance<MatchRepository["cleanupExpired"]>;
  let createInProgress: MockInstance<MatchRepository["createInProgress"]>;
  let applyMatchResult: MockInstance<AuthService["applyMatchResultToRatings"]>;

  const startMatch = (sessionId: string, body: object = doublesBody) =>
    request(app)
      .post(`/api/match-sessions/${sessionId}/matches`)
      .set("Authorization", "Bearer token")
      .send(body);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(thursdayEvening);
    sessions = [makeSession(), regularSession];

    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue({
      payload: { playerId: requester.id, isAdmin: false },
      player: requester,
      isFirstLogin: false,
    } satisfies AuthenticatedSession);
    vi.spyOn(AuthService.prototype, "getPlayerById").mockImplementation(
      async (playerId) => activePlayers.find((player) => player.id === playerId),
    );
    // 세션 시작 경기는 도전 매치 판정에 랭킹 원천을 읽는다. 기본은 빈 원천이라 특수 매치가 없다
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([]);
    vi.spyOn(MatchRepository.prototype, "getAllRatingChangeLogs").mockResolvedValue([]);
    vi.spyOn(MatchRepository.prototype, "findCompletedMatchOutcomes").mockResolvedValue([]);
    vi.spyOn(MatchRepository.prototype, "findSessionsWithParticipantIds").mockResolvedValue([]);
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue(
      activePlayers,
    );
    applyMatchResult = vi.spyOn(
      AuthService.prototype,
      "applyMatchResultToRatings",
    );
    cleanupExpired = vi
      .spyOn(MatchRepository.prototype, "cleanupExpired")
      .mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) => sessions.find((session) => session.id === sessionId),
    );
    vi.spyOn(
      MatchRepository.prototype,
      "findOrCreateRegularSession",
    ).mockResolvedValue(regularSession);
    createInProgress = vi
      .spyOn(MatchRepository.prototype, "createInProgress")
      .mockImplementation(async (input) => ({
        match: {
          ...input,
          id: "Mstarted",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Match,
      }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("점수 없는 진행 중 경기를 서버 시각으로 만들고 선수를 참여자로 추가한다", async () => {
    const response = await startMatch("Scustom1", {
      ...doublesBody,
      courtName: "코트 1",
    });

    expect(response.status).toBe(201);
    expect(cleanupExpired).toHaveBeenCalledWith(thursdayEvening);
    expect(cleanupExpired.mock.invocationCallOrder[0]).toBeLessThan(
      createInProgress.mock.invocationCallOrder[0]!,
    );
    const [input, now] = createInProgress.mock.calls[0]!;
    expect(now).toEqual(thursdayEvening);
    expect(input).toMatchObject({
      type: "mixed-doubles",
      status: "created",
      scores: [],
      source: "player_created",
      creatorPlayerId: requester.id,
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      completedAt: null,
      location: "탄천",
      courtName: "코트 1",
      session: { id: "Scustom1" },
    });
    expect(input.matchStartsAt).toEqual(thursdayEvening);
    expect(
      input.teams.flatMap((team) => team.players.map((player) => player.id)),
    ).toEqual([playerA.id, playerB.id, playerC.id, playerD.id]);
    expect(applyMatchResult).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      id: "Mstarted",
      status: "created",
      scores: [],
      completedAt: null,
    });
  });

  it("장소를 주면 세션 장소 대신 그 값을 쓴다", async () => {
    const response = await startMatch("Scustom1", {
      ...doublesBody,
      location: "  다른 코트  ",
    });

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].location).toBe("다른 코트");
  });

  it("오늘 정기 세션 시간대면 정기 세션에 저장한다", async () => {
    const response = await startMatch("Sregular");

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].session?.id).toBe("Sregular");
  });

  it("22:00 KST 이후 정기 세션에서 시작하면 세션 없이 저장한다", async () => {
    vi.setSystemTime(thursdayLateNight);

    const response = await startMatch("Sregular");

    expect(response.status).toBe(201);
    expect(createInProgress.mock.calls[0]![0].session).toBeUndefined();
    expect(createInProgress.mock.calls[0]![0].location).toBe("야탑초등학교");
  });

  it("세션이 없으면 404를 반환한다", async () => {
    const response = await startMatch("Smissing");

    expect(response.status).toBe(404);
    expect(createInProgress).not.toHaveBeenCalled();
  });

  it("오늘 세션이 아니면 정기·회원 세션 모두 403을 반환한다", async () => {
    sessions = [
      makeSession({ date: new Date("2026-11-11T09:00:00+09:00") }),
      { ...regularSession, date: new Date("2026-11-09T18:00:00+09:00") },
    ];

    const custom = await startMatch("Scustom1");
    const regular = await startMatch("Sregular");

    expect(custom.status).toBe(403);
    expect(regular.status).toBe(403);
    expect(createInProgress).not.toHaveBeenCalled();
  });

  it("유효하지 않은 세션 ID면 400을 반환한다", async () => {
    const response = await startMatch("not-a-session");

    expect(response.status).toBe(400);
  });

  it("요청자가 팀에 없어도 시작할 수 있다", async () => {
    const response = await startMatch("Scustom1");

    expect(response.status).toBe(201);
    expect(
      createInProgress.mock.calls[0]![0].teams.flatMap((team) =>
        team.players.map((player) => player.id),
      ),
    ).not.toContain(requester.id);
  });

  it("이미 진행 중인 경기에 들어간 선수가 있으면 409를 반환한다", async () => {
    createInProgress.mockResolvedValue({ conflictPlayerId: playerC.id });

    const response = await startMatch("Scustom1");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Pplayerc님이 다른 경기 중이에요" });
  });

  it("유형에 맞지 않는 팀 구성이면 400을 반환한다", async () => {
    const response = await startMatch("Scustom1", {
      ...doublesBody,
      type: "men-doubles",
    });

    expect(response.status).toBe(400);
    expect(createInProgress).not.toHaveBeenCalled();
  });

  it("활성 회원이 아닌 선수가 있으면 400을 반환한다", async () => {
    const response = await startMatch("Scustom1", {
      teams: [
        { playerIds: [playerA.id, playerB.id] },
        { playerIds: [playerC.id, "Pinactiv"] },
      ],
    });

    expect(response.status).toBe(400);
    expect(createInProgress).not.toHaveBeenCalled();
  });

  describe("추천 카드 특수 유형(recommendedSpecialKind)", () => {
    const rated = (player: Player, doubles: number): Player => ({
      ...player,
      duprRating: { singles: doubles, doubles },
    });
    // 복식 랭킹: C 3.52(1위), A 3.5(2위), B 3.0(3위), D 2.9(4위). A와 C가 상대로 만나 평점 차 0.02, 팀 평균 차 0.04다.
    const rankedPlayers = [
      requester,
      rated(playerA, 3.5),
      rated(playerB, 3.0),
      rated(playerC, 3.52),
      rated(playerD, 2.9),
    ];

    const mockRankingSource = (
      outcomes: Awaited<
        ReturnType<MatchRepository["findCompletedMatchOutcomes"]>
      > = [],
    ) => {
      vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue(
        rankedPlayers,
      );
      vi.spyOn(
        MatchRepository.prototype,
        "getAllRatingChangeLogs",
      ).mockResolvedValue([]);
      vi.spyOn(
        MatchRepository.prototype,
        "findCompletedMatchOutcomes",
      ).mockResolvedValue(outcomes);
      vi.spyOn(
        MatchRepository.prototype,
        "findSessionsWithParticipantIds",
      ).mockResolvedValue([]);
    };

    /** C가 다른 회원에게 연달아 이긴 완료 경기 count개 */
    const winsOfPlayerC = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `Mwin000${index}`,
        type: "singles" as const,
        sessionId: null,
        matchStartsAt: new Date(Date.UTC(2026, 10, 10, 10, index)),
        completedAt: new Date(Date.UTC(2026, 10, 10, 10, index)),
        teamPlayerIds: [[playerC.id], [requester.id]] as [string[], string[]],
        scores: [{ scoreA: 11, scoreB: 5 }],
        ratingExcluded: false,
      }));

    it("서버 재판정이 카드 유형과 같으면 그 특수 매치를 저장한다", async () => {
      mockRankingSource();

      const response = await startMatch("Scustom1", {
        ...doublesBody,
        recommendedSpecialKind: "rival",
      });

      expect(response.status).toBe(201);
      expect(createInProgress.mock.calls[0]![0].specialMatch).toEqual({
        kind: "rival",
        defendingTeamIndex: 1,
        protagonistIds: [playerA.id, playerC.id],
        rivalPairs: [{ attackerId: playerA.id, defenderId: playerC.id }],
        outcome: null,
      });
      expect(response.body.specialMatch.kind).toBe("rival");
    });

    it("연승 회원이 있으면 연승 매치로 판정해 저장한다", async () => {
      mockRankingSource(winsOfPlayerC(5));

      const response = await startMatch("Scustom1", {
        ...doublesBody,
        recommendedSpecialKind: "streak_stopper",
      });

      expect(response.status).toBe(201);
      expect(createInProgress.mock.calls[0]![0].specialMatch).toMatchObject({
        kind: "streak_stopper",
        defendingTeamIndex: 1,
        protagonistIds: [null, playerC.id],
      });
    });

    describe("게스트가 낀 코트", () => {
      const guestD: Player = { ...playerD, isGuest: true, duprRating: null };

      beforeEach(() => {
        vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue(
          activePlayers.map((player) =>
            player.id === guestD.id ? guestD : player,
          ),
        );
      });

      it("정회원 연승 회원이 있으면 연승 매치로 판정해 저장한다", async () => {
        mockRankingSource(winsOfPlayerC(5));

        const response = await startMatch("Scustom1", {
          ...doublesBody,
          recommendedSpecialKind: "streak_stopper",
        });

        expect(response.status).toBe(201);
        expect(createInProgress.mock.calls[0]![0].specialMatch).toMatchObject({
          kind: "streak_stopper",
          defendingTeamIndex: 1,
          protagonistIds: [null, playerC.id],
        });
      });

      it("라이벌전 조건이어도 특수 매치는 null이다", async () => {
        mockRankingSource();

        const response = await startMatch("Scustom1", {
          ...doublesBody,
          recommendedSpecialKind: "rival",
        });

        expect(response.status).toBe(201);
        expect(createInProgress.mock.calls[0]![0].specialMatch).toBeNull();
      });
    });

    it("재판정 유형이 카드 유형과 다르면 요청은 성공하고 특수 매치는 null이다", async () => {
      mockRankingSource(winsOfPlayerC(5));

      const response = await startMatch("Scustom1", {
        ...doublesBody,
        recommendedSpecialKind: "rival",
      });

      expect(response.status).toBe(201);
      expect(createInProgress.mock.calls[0]![0].specialMatch).toBeNull();
    });

    it("리벤지나 모르는 유형은 카드 유형 없이 본다(라이벌전 조건이면 null이다)", async () => {
      mockRankingSource();

      for (const recommendedSpecialKind of ["revenge", "unknown"]) {
        const response = await startMatch("Scustom1", {
          ...doublesBody,
          recommendedSpecialKind,
        });
        expect(response.status).toBe(201);
      }
      expect(
        createInProgress.mock.calls.map(([input]) => input.specialMatch),
      ).toEqual([null, null]);
    });

    // A+C(3.51) 대 B+D(2.95): 팀 평균 차 0.56이라 도전 매치다
    const challengeBody = {
      teams: [
        { playerIds: [playerA.id, playerC.id] },
        { playerIds: [playerB.id, playerD.id] },
      ],
    };

    it("카드 유형이 없어도 도전 매치면 저장한다", async () => {
      mockRankingSource();

      const response = await startMatch("Scustom1", challengeBody);

      expect(response.status).toBe(201);
      expect(createInProgress.mock.calls[0]![0].specialMatch).toEqual({
        kind: "challenge",
        defendingTeamIndex: 0,
        protagonistIds: [null, null],
        rivalPairs: [],
        ratingGap: 0.56,
        outcome: null,
      });
    });

    it("카드 유형과 달라도 재판정이 도전 매치면 도전 매치로 저장한다", async () => {
      mockRankingSource();

      const response = await startMatch("Scustom1", {
        ...challengeBody,
        recommendedSpecialKind: "rival",
      });

      expect(response.status).toBe(201);
      expect(createInProgress.mock.calls[0]![0].specialMatch?.kind).toBe("challenge");
    });

    it("카드 유형이 없으면 도전 매치가 아닌 특수 매치 조건(라이벌전)은 null이다", async () => {
      mockRankingSource();

      const response = await startMatch("Scustom1");

      expect(response.status).toBe(201);
      expect(createInProgress.mock.calls[0]![0].specialMatch).toBeNull();
    });
  });
});
