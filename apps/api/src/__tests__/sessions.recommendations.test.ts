import type { ManagedMatchSession, Match, Team } from "@pkpkdupr/shared/match";
import type { MatchSessionRecommendationResponse } from "@pkpkdupr/shared/matchmaking";
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

  it("courts·rank 생략 시 기본 3코트의 1등 후보를 돌려준다", async () => {
    const response = await recommend("Stoday00");

    expect(response.status).toBe(200);
    const body = response.body as MatchSessionRecommendationResponse;
    expect(body.sessionId).toBe("Stoday00");
    expect(body.requestedCourts).toBe(3);
    expect(body.rank).toBe(0);
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
    expect(body.courts.every((court) => court.specialMatch === null)).toBe(
      true,
    );
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

  it("같은 상황이면 누가 요청해도 같은 결과를 낸다", async () => {
    const first = await recommend("Stoday00", "?courts=2");
    const second = await recommend("Stoday00", "?courts=2&rank=0");

    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it("rank번째 후보를 돌려주고 후보 수를 넘으면 처음으로 돌아간다", async () => {
    const first = await recommend("Stoday00", "?courts=2");
    const next = await recommend("Stoday00", "?courts=2&rank=1");
    const { candidateCount } = first.body as MatchSessionRecommendationResponse;
    const wrapped = await recommend(
      "Stoday00",
      `?courts=2&rank=${candidateCount}`,
    );

    expect(next.status).toBe(200);
    expect(next.body.rank).toBe(1);
    expect(next.body.candidateCount).toBe(candidateCount);
    expect(next.body.courts).not.toEqual(first.body.courts);
    expect(wrapped.body).toEqual(first.body);
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
    ["rank가 정수가 아니면", "?rank=1.5"],
    ["rank가 음수면", "?rank=-1"],
    ["rank가 숫자가 아니면", "?rank=abc"],
  ])("%s 400", async (_label, query) => {
    const response = await recommend("Stoday00", query);
    expect(response.status).toBe(400);
  });

  it("지난 세션이면 403, 없는 세션이면 404", async () => {
    expect((await recommend("Spast000")).status).toBe(403);
    expect((await recommend("Smissing")).status).toBe(404);
  });
});
