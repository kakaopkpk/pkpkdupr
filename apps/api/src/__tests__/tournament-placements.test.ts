import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import type { TournamentPlacement } from "@pkpkdupr/shared/tournament";
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

const now = new Date("2026-11-21T19:00:00+09:00");

const makePlayer = (
  id: string,
  overrides: Partial<Player> = {},
): Player => ({
  isGuest: false,
  id,
  username: id.toLowerCase(),
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const admin = makePlayer("Padminxx");
const member = makePlayer("Pmemberx");
const playerA = makePlayer("Pplayera");
const playerB = makePlayer("Pplayerb");
const guest = makePlayer("Pguestxx", { isGuest: true, gender: null });
const outsider = makePlayer("Poutside");

const asSession = (player: Player, isAdmin: boolean): AuthenticatedSession => ({
  payload: { playerId: player.id, isAdmin },
  player,
  isFirstLogin: false,
});

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Stourney",
  name: "가을 대회",
  date: new Date("2026-11-21T00:00:00+09:00"),
  location: "탄천",
  participantIds: [playerA.id, playerB.id, guest.id],
  matchCount: 3,
  kind: "tournament",
  autoCreated: false,
  startTime: "09:00",
  endTime: "17:00",
  completedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const storedPlacements: TournamentPlacement[] = [
  {
    place: 1,
    players: [
      { id: playerA.id, username: playerA.username },
      { id: guest.id, username: guest.username },
    ],
    record: { wins: 3, losses: 0 },
  },
];

describe("대회 최종 순위", () => {
  let authenticate: MockInstance<AuthService["authenticateAccessToken"]>;
  let sessions: ManagedMatchSession[];
  let findTournamentPlacements: MockInstance<
    MatchRepository["findTournamentPlacements"]
  >;
  let replaceSessionPlacements: MockInstance<
    MatchRepository["replaceSessionPlacements"]
  >;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    sessions = [makeSession()];
    authenticate = vi
      .spyOn(AuthService.prototype, "authenticateAccessToken")
      .mockResolvedValue(asSession(admin, true));
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([
      admin,
      member,
      playerA,
      playerB,
      guest,
      outsider,
    ]);
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) => sessions.find((session) => session.id === sessionId),
    );
    findTournamentPlacements = vi
      .spyOn(MatchRepository.prototype, "findTournamentPlacements")
      .mockResolvedValue(new Map([["Stourney", storedPlacements]]));
    replaceSessionPlacements = vi
      .spyOn(MatchRepository.prototype, "replaceSessionPlacements")
      .mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("PUT /api/admin/match-sessions/:sessionId/placements", () => {
    const putPlacements = (body: unknown, sessionId = "Stourney") =>
      request(app)
        .put(`/api/admin/match-sessions/${sessionId}/placements`)
        .set("Authorization", "Bearer token")
        .send(body as object);

    it("순위를 순위 오름차순·고른 순서로 통째로 바꾸고 바뀐 세션 상세를 돌려준다", async () => {
      const response = await putPlacements({
        placements: [
          { place: 2, playerIds: [playerB.id] },
          { place: 1, playerIds: [guest.id, playerA.id] },
        ],
      });

      expect(response.status).toBe(200);
      expect(replaceSessionPlacements).toHaveBeenCalledWith("Stourney", [
        { place: 1, playerIds: [guest.id, playerA.id] },
        { place: 2, playerIds: [playerB.id] },
      ]);
      expect(replaceSessionPlacements.mock.invocationCallOrder[0]).toBeLessThan(
        findTournamentPlacements.mock.invocationCallOrder[0]!,
      );
      expect(response.body).toMatchObject({
        id: "Stourney",
        kind: "tournament",
        placements: storedPlacements,
      });
    });

    it("빈 배열이면 순위를 모두 지운다", async () => {
      findTournamentPlacements.mockResolvedValue(new Map());

      const response = await putPlacements({ placements: [] });

      expect(response.status).toBe(200);
      expect(replaceSessionPlacements).toHaveBeenCalledWith("Stourney", []);
      expect(response.body.placements).toEqual([]);
    });

    it("세션이 없으면 404다", async () => {
      const response = await putPlacements({ placements: [] }, "Snothere");

      expect(response.status).toBe(404);
      expect(replaceSessionPlacements).not.toHaveBeenCalled();
    });

    it("대회 세션이 아니면 409다", async () => {
      sessions = [makeSession({ kind: "custom" })];

      const response = await putPlacements({ placements: [] });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("대회 세션만 순위를 정할 수 있어요.");
      expect(replaceSessionPlacements).not.toHaveBeenCalled();
    });

    it("관리자가 아니면 403이다", async () => {
      authenticate.mockResolvedValue(asSession(member, false));

      const response = await putPlacements({ placements: [] });

      expect(response.status).toBe(403);
      expect(replaceSessionPlacements).not.toHaveBeenCalled();
    });

    it.each([
      ["placements가 배열이 아님", {}, "placements 배열이 필요합니다."],
      [
        "1~3위 밖",
        { placements: [{ place: 4, playerIds: [playerA.id] }] },
        "순위는 1~3위만 정할 수 있어요.",
      ],
      [
        "같은 순위 두 번",
        {
          placements: [
            { place: 1, playerIds: [playerA.id] },
            { place: 1, playerIds: [playerB.id] },
          ],
        },
        "순위가 중복됐어요.",
      ],
      [
        "빈 선수",
        { placements: [{ place: 1, playerIds: [] }] },
        "순위마다 1명 이상 골라 주세요.",
      ],
      [
        "세션 참여자 아님",
        { placements: [{ place: 1, playerIds: [outsider.id] }] },
        "세션 참여자만 순위에 넣을 수 있어요.",
      ],
      [
        "한 사람이 두 순위",
        {
          placements: [
            { place: 1, playerIds: [playerA.id] },
            { place: 2, playerIds: [playerA.id, playerB.id] },
          ],
        },
        "한 사람은 한 순위에만 넣을 수 있어요.",
      ],
    ])("%s면 400이다", async (_label, body, message) => {
      const response = await putPlacements(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(message);
      expect(replaceSessionPlacements).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/match-sessions/:sessionId", () => {
    const getDetail = () =>
      request(app)
        .get("/api/match-sessions/Stourney")
        .set("Authorization", "Bearer token");

    it("대회 세션이면 placements를 붙인다", async () => {
      authenticate.mockResolvedValue(asSession(member, false));

      const response = await getDetail();

      expect(response.status).toBe(200);
      expect(findTournamentPlacements).toHaveBeenCalledWith(["Stourney"]);
      expect(response.body.placements).toEqual(storedPlacements);
    });

    it("순위를 넣기 전 대회 세션은 빈 배열이다", async () => {
      findTournamentPlacements.mockResolvedValue(new Map());

      const response = await getDetail();

      expect(response.body.placements).toEqual([]);
    });

    it("대회가 아닌 세션은 placements를 생략하고 순위를 읽지 않는다", async () => {
      sessions = [makeSession({ kind: "custom" })];

      const response = await getDetail();

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty("placements");
      expect(findTournamentPlacements).not.toHaveBeenCalled();
    });
  });
});
