import type { ManagedMatchSession, Match, Team } from "@pkpkdupr/shared/match";
import {
  MATCHMAKING_GUEST_RATING,
  MATCHMAKING_REROLL_CYCLE,
  recommendDoublesMatches,
  type MatchSessionRecommendationResponse,
} from "@pkpkdupr/shared/matchmaking";
import type { CompletedMatchOutcome } from "@pkpkdupr/db";
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

// 추천 입력을 확인할 수 있게 원래 구현을 그대로 부르는 spy로 감싼다
vi.mock("@pkpkdupr/shared/matchmaking", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@pkpkdupr/shared/matchmaking")>();
  return {
    ...actual,
    recommendDoublesMatches: vi.fn(actual.recommendDoublesMatches),
  };
});

const thursdayEvening = new Date("2026-11-12T19:00:00+09:00");

const makePlayer = (id: string, doubles: number | null): Player => ({
  isGuest: false,
  id,
  username: `user-${id}`,
  gender: "M",
  status: "active",
  duprRating: doubles === null ? null : { singles: doubles, doubles },
  createdAt: thursdayEvening,
  updatedAt: thursdayEvening,
});

const players = Array.from({ length: 10 }, (_, index) =>
  makePlayer(`Pplayer${index}`, index === 9 ? null : 3 + index * 0.1),
);
const playerIds = players.map((player) => player.id);

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Stoday00",
  name: "정기 세션",
  date: new Date("2026-11-12T18:00:00+09:00"),
  location: "야탑초등학교",
  participantIds: playerIds,
  matchCount: 0,
  kind: "regular",
  autoCreated: true,
  startTime: null,
  endTime: null,
  completedAt: null,
  createdAt: thursdayEvening,
  updatedAt: thursdayEvening,
  ...overrides,
});

const makeTeam = (name: string, ids: string[]): Team => ({
  id: name,
  name,
  players: ids.map((id) => players.find((player) => player.id === id)!),
});

const completedMatch = {
  id: "Mdone",
  status: "completed",
  teams: [
    makeTeam("Team A", [playerIds[0], playerIds[1]]),
    makeTeam("Team B", [playerIds[2], playerIds[3]]),
  ],
} as Match;

/** winnerId가 이긴 완료 복식 경기 count개(최근 경기가 뒤). 랭킹 연승 원천이다 */
const winsFor = (winnerId: string, loserIds: string[], count: number) =>
  Array.from({ length: count }, (_, index): CompletedMatchOutcome => {
    const at = new Date(thursdayEvening.getTime() - (count - index) * 3_600_000);
    return {
      id: `Mwin-${winnerId}-${index}`,
      type: "men-doubles",
      sessionId: null,
      matchStartsAt: at,
      completedAt: at,
      teamPlayerIds: [
        [winnerId, `Pghost-${index}`],
        loserIds,
      ],
      scores: [{ scoreA: 11, scoreB: 5 }],
      ratingExcluded: false,
    };
  });

const collectIds = (body: MatchSessionRecommendationResponse) => ({
  courtIds: body.courts.flatMap((court) =>
    court.teams.flatMap((team) => team.players.map((player) => player.id)),
  ),
  restingIds: body.restingPlayers.map((player) => player.id),
});

describe("GET /api/match-sessions/:sessionId/recommendations", () => {
  let sessions: ManagedMatchSession[];
  let cleanupExpired: MockInstance<MatchRepository["cleanupExpired"]>;
  let findInProgressPlayerIds: MockInstance<
    MatchRepository["findInProgressPlayerIds"]
  >;
  let findCompletedMatchOutcomes: MockInstance<
    MatchRepository["findCompletedMatchOutcomes"]
  >;

  const recommend = (sessionId: string, query = "") =>
    request(app)
      .get(`/api/match-sessions/${sessionId}/recommendations${query}`)
      .set("Authorization", "Bearer token");

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(thursdayEvening);
    sessions = [
      makeSession(),
      makeSession({
        id: "Spast000",
        date: new Date("2026-11-09T18:00:00+09:00"),
      }),
    ];

    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue({
      payload: { playerId: playerIds[0], isAdmin: false },
      player: players[0],
      isFirstLogin: false,
    } satisfies AuthenticatedSession);
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue(
      players,
    );
    cleanupExpired = vi
      .spyOn(MatchRepository.prototype, "cleanupExpired")
      .mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) => sessions.find((session) => session.id === sessionId),
    );
    findInProgressPlayerIds = vi
      .spyOn(MatchRepository.prototype, "findInProgressPlayerIds")
      .mockResolvedValue([]);
    vi.spyOn(MatchRepository.prototype, "findBySession").mockResolvedValue([
      completedMatch,
    ]);
    // 특수 유형 판정·주인공 정보는 랭킹 원천(회원·평점 로그·완료 경기)으로 계산한다
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue(players);
    vi.spyOn(
      MatchRepository.prototype,
      "getAllRatingChangeLogs",
    ).mockResolvedValue([]);
    findCompletedMatchOutcomes = vi
      .spyOn(MatchRepository.prototype, "findCompletedMatchOutcomes")
      .mockResolvedValue([]);
    vi.spyOn(
      MatchRepository.prototype,
      "findSessionsWithParticipantIds",
    ).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("courts·reroll 생략 시 기본 3코트의 첫 추천을 돌려준다", async () => {
    const response = await recommend("Stoday00");

    expect(response.status).toBe(200);
    const body = response.body as MatchSessionRecommendationResponse;
    expect(body.sessionId).toBe("Stoday00");
    expect(body.requestedCourts).toBe(3);
    expect(body.reroll).toBe(0);
    expect(body).not.toHaveProperty("rank");
    expect(body.candidateCount).toBeGreaterThan(1);
    // 10명이라 2코트만 채워지고 2명이 쉰다
    expect(body.courts).toHaveLength(2);
    expect(body.restingPlayers).toHaveLength(2);
    expect(cleanupExpired).toHaveBeenCalled();

    const team = body.courts[0].teams[0];
    expect(typeof team.averageRating).toBe("number");
    expect(team.players[0]).toEqual({
      id: expect.any(String),
      username: expect.stringMatching(/^user-/),
      doublesRating: expect.toSatisfy(
        (value: unknown) => value === null || typeof value === "number",
      ),
      doublesRank: expect.toSatisfy(
        (value: unknown) => value === null || typeof value === "number",
      ),
      winStreak: 0,
    });
    // 참여자가 모두 남자라 두 코트 모두 남복이고, 특수 유형은 앞 코트 하나만 남복 매치로 보인다
    expect(body.courts.map((court) => court.specialMatch?.kind ?? null)).toEqual([
      "men_doubles",
      null,
    ]);
  });

  it("선수마다 복식 랭킹 순위와 지금 연승 수를 주고, NR은 순위가 null이다", async () => {
    findCompletedMatchOutcomes.mockResolvedValue(
      winsFor(playerIds[2], ["Pghost-a", "Pghost-b"], 3),
    );

    const response = await recommend("Stoday00", "?courts=4");

    expect(response.status).toBe(200);
    const body = response.body as MatchSessionRecommendationResponse;
    const everyone = [
      ...body.courts.flatMap((court) =>
        court.teams.flatMap((team) => team.players),
      ),
      ...body.restingPlayers,
    ];
    const byId = new Map(everyone.map((player) => [player.id, player]));
    // 평점이 높은 player8이 1위, NR인 player9는 랭킹에 없다
    expect(byId.get(playerIds[8])?.doublesRank).toBe(1);
    expect(byId.get(playerIds[0])?.doublesRank).toBe(9);
    expect(byId.get(playerIds[9])?.doublesRank).toBeNull();
    expect(byId.get(playerIds[2])?.winStreak).toBe(3);
    expect(byId.get(playerIds[3])?.winStreak).toBe(0);
  });

  it("연승 회원이 있는 코트 하나만 특수 유형으로 판정해 준다", async () => {
    // 두 코트 모두에 연승 회원이 있을 수 있게 두 사람을 5연승으로 만든다
    findCompletedMatchOutcomes.mockResolvedValue([
      ...winsFor(playerIds[1], ["Pghost-a", "Pghost-b"], 5),
      ...winsFor(playerIds[6], ["Pghost-c", "Pghost-d"], 6),
    ]);
    sessions = [makeSession({ participantIds: playerIds.slice(0, 8) })];

    const response = await recommend("Stoday00", "?courts=2");

    expect(response.status).toBe(200);
    const body = response.body as MatchSessionRecommendationResponse;
    const specialCourts = body.courts.filter(
      (court) => court.specialMatch !== null,
    );
    expect(specialCourts).toHaveLength(1);
    const [court] = specialCourts;
    expect(["streak_stopper", "champions"]).toContain(court.specialMatch?.kind);
    expect(court.specialMatch?.outcome).toBeNull();
    const courtIds = court.teams.flatMap((team) =>
      team.players.map((player) => player.id),
    );
    expect(
      courtIds.some((id) => id === playerIds[1] || id === playerIds[6]),
    ).toBe(true);
  });

  it("랭킹 원천을 못 읽으면 특수 유형·순위·연승 없이 추천한다", async () => {
    findCompletedMatchOutcomes.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await recommend("Stoday00", "?courts=2");

    expect(response.status).toBe(200);
    const body = response.body as MatchSessionRecommendationResponse;
    expect(body.courts).toHaveLength(2);
    expect(body.courts.every((court) => court.specialMatch === null)).toBe(
      true,
    );
    const everyone = [
      ...body.courts.flatMap((court) =>
        court.teams.flatMap((team) => team.players),
      ),
      ...body.restingPlayers,
    ];
    expect(
      everyone.every(
        (player) => player.doublesRank === null && player.winStreak === 0,
      ),
    ).toBe(true);
  });

  it("팀 평균은 NR 선수를 기본 평점 3.0으로 친다", async () => {
    // 참여자 평점 중앙값(3.1)으로 대체하는 팀 나누기와 달리, 표시용 평균은 NR을 3.0으로 계산한다.
    sessions = [
      makeSession({
        participantIds: [playerIds[0], playerIds[1], playerIds[2], playerIds[9]],
      }),
    ];

    const response = await recommend("Stoday00", "?courts=1");

    expect(response.status).toBe(200);
    const body = response.body as MatchSessionRecommendationResponse;
    const nrTeam = body.courts[0]!.teams.find((team) =>
      team.players.some((player) => player.id === playerIds[9]),
    )!;
    const partner = nrTeam.players.find(
      (player) => player.id !== playerIds[9],
    )!;
    expect(partner.doublesRating).not.toBeNull();
    expect(nrTeam.averageRating).toBeCloseTo(
      (partner.doublesRating! + 3) / 2,
      10,
    );
  });

  it("팀 평균은 게스트를 게스트 평점 2.5로 치고 응답 평점은 null로 보낸다", async () => {
    const guest: Player = {
      ...makePlayer("Pguest00", 4.5),
      isGuest: true,
    };
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([
      ...players,
      guest,
    ]);
    sessions = [
      makeSession({
        participantIds: [playerIds[0], playerIds[1], playerIds[2], guest.id],
      }),
    ];

    const response = await recommend("Stoday00", "?courts=1");

    expect(response.status).toBe(200);
    const body = response.body as MatchSessionRecommendationResponse;
    const guestTeam = body.courts[0]!.teams.find((team) =>
      team.players.some((player) => player.id === guest.id),
    )!;
    const guestPlayer = guestTeam.players.find(
      (player) => player.id === guest.id,
    )!;
    const partner = guestTeam.players.find(
      (player) => player.id !== guest.id,
    )!;
    expect(guestPlayer.doublesRating).toBeNull();
    expect(guestTeam.averageRating).toBeCloseTo(
      (partner.doublesRating! + MATCHMAKING_GUEST_RATING) / 2,
      10,
    );
  });

  it("같은 상황이면 누가 요청해도 같은 결과를 낸다", async () => {
    const first = await recommend("Stoday00", "?courts=2");
    const second = await recommend("Stoday00", "?courts=2&reroll=0");

    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it("다시 추천은 직전 횟수와 다른 대진이고, 같은 횟수면 같은 결과다", async () => {
    const first = await recommend("Stoday00", "?courts=2");
    const next = await recommend("Stoday00", "?courts=2&reroll=1");
    const again = await recommend("Stoday00", "?courts=2&reroll=1");

    expect(next.status).toBe(200);
    expect(next.body.reroll).toBe(1);
    expect(next.body.candidateCount).toBeGreaterThan(0);
    expect(next.body.courts).not.toEqual(first.body.courts);
    expect(again.body).toEqual(next.body);
  });

  it("reroll이 순환 주기를 넘으면 순환한 값으로 계산해 돌려준다", async () => {
    const cycled = await recommend(
      "Stoday00",
      `?courts=2&reroll=${MATCHMAKING_REROLL_CYCLE + 2}`,
    );
    const second = await recommend("Stoday00", "?courts=2&reroll=2");

    expect(cycled.status).toBe(200);
    expect(cycled.body.reroll).toBe(2);
    expect(cycled.body).toEqual(second.body);
  });

  it("rank 쿼리는 읽지 않는다", async () => {
    const first = await recommend("Stoday00", "?courts=2");
    const withRank = await recommend("Stoday00", "?courts=2&rank=3");
    const invalidRank = await recommend("Stoday00", "?courts=2&rank=abc");

    expect(withRank.status).toBe(200);
    expect(withRank.body).toEqual(first.body);
    expect(invalidRank.status).toBe(200);
    expect(invalidRank.body).toEqual(first.body);
  });

  it("세션 완료 경기를 완료 시각 오름차순으로 넘기고 완료 전 경기는 뺀다", async () => {
    const at = (minutes: number) =>
      new Date(thursdayEvening.getTime() - minutes * 60_000);
    const sessionMatch = (
      id: string,
      status: Match["status"],
      completedAt: Date | null,
      ids: [string, string, string, string],
    ) =>
      ({
        id,
        status,
        matchStartsAt: at(120),
        completedAt,
        teams: [
          makeTeam("Team A", [ids[0], ids[1]]),
          makeTeam("Team B", [ids[2], ids[3]]),
        ],
      }) as Match;
    // 저장소는 기록 시각 최신순으로 준다
    vi.spyOn(MatchRepository.prototype, "findBySession").mockResolvedValue([
      sessionMatch("Mlive", "created", null, [
        playerIds[6],
        playerIds[7],
        playerIds[8],
        playerIds[9],
      ]),
      sessionMatch("Mlate", "completed", at(10), [
        playerIds[0],
        playerIds[2],
        playerIds[1],
        playerIds[3],
      ]),
      sessionMatch("Mearly", "completed", at(40), [
        playerIds[0],
        playerIds[1],
        playerIds[2],
        playerIds[3],
      ]),
    ]);
    const recommendSpy = vi.mocked(recommendDoublesMatches);
    recommendSpy.mockClear();

    const response = await recommend("Stoday00");

    expect(response.status).toBe(200);
    expect(recommendSpy).toHaveBeenCalledTimes(1);
    expect(recommendSpy.mock.calls[0][0].completedMatches).toEqual([
      { teams: [[playerIds[0], playerIds[1]], [playerIds[2], playerIds[3]]] },
      { teams: [[playerIds[0], playerIds[2]], [playerIds[1], playerIds[3]]] },
    ]);
  });

  it("진행 중 경기에 들어간 선수는 코트와 쉬는 사람 모두에서 뺀다", async () => {
    const busy = [playerIds[4], playerIds[5]];
    findInProgressPlayerIds.mockResolvedValue(busy);

    const response = await recommend("Stoday00", "?courts=4");

    expect(response.status).toBe(200);
    const { courtIds, restingIds } = collectIds(response.body);
    expect(response.body.courts).toHaveLength(2);
    expect(restingIds).toEqual([]);
    expect(new Set(courtIds).size).toBe(8);
    for (const id of busy) {
      expect(courtIds).not.toContain(id);
      expect(restingIds).not.toContain(id);
    }
  });

  it("범위 밖 courts는 1~4로 자른다", async () => {
    const low = await recommend("Stoday00", "?courts=0");
    const high = await recommend("Stoday00", "?courts=9");

    expect(low.status).toBe(200);
    expect(low.body.requestedCourts).toBe(1);
    expect(low.body.courts).toHaveLength(1);
    expect(low.body.restingPlayers).toHaveLength(6);
    expect(high.status).toBe(200);
    expect(high.body.requestedCourts).toBe(4);
  });

  it.each([
    ["courts가 숫자가 아니면", "?courts=abc"],
    ["courts가 비어 있으면", "?courts="],
    ["reroll이 정수가 아니면", "?reroll=1.5"],
    ["reroll이 음수면", "?reroll=-1"],
    ["reroll이 숫자가 아니면", "?reroll=abc"],
  ])("%s 400", async (_label, query) => {
    const response = await recommend("Stoday00", query);
    expect(response.status).toBe(400);
  });

  it("reroll이 0 이상 정수가 아니면 안내 문구로 400", async () => {
    const response = await recommend("Stoday00", "?reroll=abc");
    expect(response.body).toMatchObject({
      error: "reroll은 0 이상 정수여야 합니다.",
    });
  });

  it("지난 세션이면 403, 없는 세션이면 404", async () => {
    expect((await recommend("Spast000")).status).toBe(403);
    expect((await recommend("Smissing")).status).toBe(404);
  });
});
