import { computeMatchStartsAt, type Match } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const now = new Date("2026-07-08T10:00:00.000Z");

const creator: Player = {
  id: "player-creator",
  username: "creator",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
};

const femaleCreator: Player = {
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
    duprRating: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "player-m-2",
    username: "male-2",
    gender: "M",
    status: "active",
    duprRating: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "player-f-1",
    username: "female-1",
    gender: "F",
    status: "active",
    duprRating: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "player-f-2",
    username: "female-2",
    gender: "F",
    status: "active",
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

describe("POST /api/matches", () => {
  let capturedCreatePayload:
    | (Omit<Match, "id" | "createdAt" | "updatedAt"> & { id?: string })
    | null;

  beforeEach(() => {
    capturedCreatePayload = null;

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
    vi.restoreAllMocks();
  });

  const postMatch = async (teamPlayerIds: [string[], string[]]) =>
    request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        mode: "single-game",
        teams: [
          { name: "Team A", playerIds: teamPlayerIds[0] },
          { name: "Team B", playerIds: teamPlayerIds[1] },
        ],
        location: "Court TBD",
      });

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
    expect(capturedCreatePayload?.status).toBe("created");
    expect(capturedCreatePayload?.mode).toBe("single-game");
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

  it("matchStartsAt을 보내면 해당 값이 사용된다", async () => {
    const response = await request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        mode: "single-game",
        teams: [
          { name: "Team A", playerIds: [creator.id, "player-f-1"] },
          { name: "Team B", playerIds: ["player-m-1", "player-f-2"] },
        ],
        location: "PKELO Court A",
        matchStartsAt: "2026-07-08T11:00:00.000Z",
      });

    expect(response.status).toBe(201);
    expect(capturedCreatePayload?.matchStartsAt).toEqual(
      new Date("2026-07-08T11:00:00.000Z"),
    );
  });

  it("matchStartsAt을 보내지 않으면 현재 시각 기준 30분 단위로 자동 계산된다", async () => {
    const before = Date.now();

    const response = await request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        mode: "single-game",
        teams: [
          { name: "Team A", playerIds: [creator.id, "player-f-1"] },
          { name: "Team B", playerIds: ["player-m-1", "player-f-2"] },
        ],
        location: "PKELO Court A",
      });

    const after = Date.now();

    expect(response.status).toBe(201);

    const matchStartsAt = capturedCreatePayload?.matchStartsAt;
    expect(matchStartsAt).toBeDefined();
    expect(matchStartsAt!.getTime()).toBeGreaterThanOrEqual(
      computeMatchStartsAt(new Date(before)).getTime(),
    );
    expect(matchStartsAt!.getTime()).toBeLessThanOrEqual(
      computeMatchStartsAt(new Date(after)).getTime(),
    );
  });

  it("유효하지 않은 matchStartsAt이면 400을 반환한다", async () => {
    const response = await request(app)
      .post("/api/matches")
      .set("Authorization", "Bearer test-token")
      .send({
        mode: "single-game",
        teams: [
          { name: "Team A", playerIds: [creator.id, "player-f-1"] },
          { name: "Team B", playerIds: ["player-m-1", "player-f-2"] },
        ],
        location: "PKELO Court A",
        matchStartsAt: "not-a-date",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("유효한 매치 시작 시간이 필요합니다.");
  });
});
