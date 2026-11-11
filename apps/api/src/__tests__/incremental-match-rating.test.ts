import type { Match } from "@pkpkdupr/shared/match";
import type {
  Player,
  PlayerRatingChangeLog,
  StoredPlayerDupr,
} from "@pkpkdupr/shared/player";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../services/AuthService";
import type { RatingServiceContract } from "../services/RatingService";
import { db } from "../db";

const completedAt = new Date("2026-08-01T10:00:00.000Z");

const createState = (rating: number): StoredPlayerDupr => ({
  rating: { singles: rating, doubles: rating },
  metrics: {
    singles: { confidence: 50, accuracy: null },
    doubles: { confidence: 50, accuracy: null },
  },
});

const createPlayer = (id: string, rating: number): Player & {
  authUserId: string | null;
} => ({
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: { singles: rating, doubles: rating },
  authUserId: null,
  createdAt: completedAt,
  updatedAt: completedAt,
});

describe("incremental match rating", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("projection 갱신이 실패해도 완료 경기의 평점 로그를 저장하고 재처리는 건너뛴다", async () => {
    const players = new Map([
      ["winner", createPlayer("winner", 3)],
      ["loser", createPlayer("loser", 2.8)],
    ]);
    const persistedStates = new Map<string, StoredPlayerDupr>();
    const persistedLogs: PlayerRatingChangeLog[] = [];
    const replayMatch = vi.fn<RatingServiceContract["replayMatch"]>((input) =>
      Object.fromEntries(
        input.participants.map((participant) => [
          participant.playerId,
          {
            ...participant.state,
            rating: {
              ...participant.state.rating,
              singles:
                participant.state.rating.singles +
                (participant.teamIndex === input.winnerTeamIndex ? 0.1 : -0.1),
            },
          },
        ]),
      ),
    );
    const ratingService: RatingServiceContract = {
      getAccuracy: () => 0,
      getCorrectionWeight: () => 1,
      replayMatch,
    };
    const match: Match = {
      id: "match-incremental",
      type: "singles",
      mode: "single-game",
      source: "player_created",
      creatorPlayerId: "winner",
      status: "completed",
      teams: [
        { id: "team-a", name: "A", players: [players.get("winner")!] },
        { id: "team-b", name: "B", players: [players.get("loser")!] },
      ],
      scores: [{ scoreA: 11, scoreB: 8 }],
      resultSubmittedByPlayerId: "winner",
      resultSubmittedAt: completedAt,
      location: "Court",
      matchStartsAt: completedAt,
      completedAt,
      createdAt: completedAt,
      updatedAt: completedAt,
    };

    vi.spyOn(db.playerRatingChangeLogs, "findByMatchId").mockImplementation(
      async (matchId) => (matchId === match.id ? [...persistedLogs] : []),
    );
    const findPreviousCompletedAt = vi
      .spyOn(db.matches, "findPreviousCompletedAt")
      .mockImplementation(async (playerId) =>
        playerId === "winner"
          ? new Date(completedAt.getTime() - 24 * 60 * 60 * 1000)
          : null,
      );
    vi.spyOn(db.players, "updateDuprState").mockImplementation(
      async (playerId, duprState) => {
        persistedStates.set(playerId, duprState);
        const player = players.get(playerId)!;
        players.set(playerId, { ...player, duprRating: duprState.rating });
        return { ...players.get(playerId)! } as any;
      },
    );
    vi.spyOn(db.matches, "fillMissingParticipantDuprSnapshots").mockResolvedValue(
      { updatedParticipantCount: 2, updatedMatchCount: 1 },
    );
    vi.spyOn(db.playerRatingChangeLogs, "create").mockImplementation(
      async (log) => {
        persistedLogs.push(log);
        return log;
      },
    );
    vi.spyOn(db.players, "findById").mockImplementation(
      async (playerId) => players.get(playerId) as any,
    );
    const findAllMatches = vi
      .spyOn(db.matches, "findAll")
      .mockResolvedValue({ matches: [], total: 0 });

    const service = new AuthService(ratingService);
    const rebuildPlayers = vi
      .fn()
      .mockRejectedValue(new Error("Deadlock found when trying to get lock"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    service.setPlayerRatingChartProjectionRefresher({ rebuildPlayers });
    const result = await service.applyMatchResultToRatings(match);

    expect(replayMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "singles",
        winnerTeamIndex: 0,
        inactiveElapsedMsByPlayerId: {
          winner: 24 * 60 * 60 * 1000,
          loser: 0,
        },
      }),
    );
    expect(result.changedPlayerCount).toBe(2);
    expect(result.ratingChangeLogs).toHaveLength(2);
    expect(persistedStates.get("winner")?.rating.singles).toBeCloseTo(3.1);
    expect(persistedStates.get("loser")?.rating.singles).toBeCloseTo(2.7);
    expect(persistedLogs.map((log) => log.sourceLogId)).toEqual([
      `match-completed-${match.id}-${completedAt.getTime()}`,
      `match-completed-${match.id}-${completedAt.getTime()}`,
    ]);
    expect(rebuildPlayers).toHaveBeenCalledWith(["winner", "loser"]);
    expect(consoleError).toHaveBeenCalledWith(
      "[RATING_CHART_PROJECTION] projection 갱신 실패; 평점 반영은 유지합니다.",
      expect.objectContaining({
        playerIds: ["winner", "loser"],
        error: expect.any(Error),
      }),
    );
    expect(findAllMatches).not.toHaveBeenCalled();
    expect(findPreviousCompletedAt).toHaveBeenCalled();

    await service.applyMatchResultToRatings(match);

    expect(replayMatch).toHaveBeenCalledTimes(1);
    expect(persistedLogs).toHaveLength(2);
  });
});
