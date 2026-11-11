import type { Match } from "@pkpkdupr/shared/match";
import type { Player, PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import { describe, expect, it } from "vitest";
import { buildPlayerRatingHistory } from "../services/PlayerRatingHistoryService";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-08-01T12:00:00.000Z");
const player: Player = {
  id: "cloud",
  username: "cloud.lee",
  gender: "M",
  status: "active",
  duprRating: { singles: 3, doubles: 3 },
  createdAt: now,
  updatedAt: now,
};

const buildMatch = (
  id: string,
  completedAt: Date,
  rating: number,
  category: "singles" | "doubles" = "doubles",
) => {
  const type = category === "singles" ? "singles" : "men-doubles";
  const log: PlayerRatingChangeLog = {
    id: `log-${id}`,
    playerId: player.id,
    source: "match_completed",
    sourceLogId: `match-completed-${id}-${completedAt.getTime()}`,
    previousRating: { singles: 3, doubles: rating - 0.01 },
    nextRating: { singles: category === "singles" ? rating : 3, doubles: category === "doubles" ? rating : 3 },
    delta: { singles: category === "singles" ? 0.01 : 0, doubles: category === "doubles" ? 0.01 : 0 },
    createdAt: completedAt,
  };
  const match: Match = {
    id,
    type,
    source: "player_created",
    creatorPlayerId: player.id,
    status: "completed",
    teams: [
      { id: `${id}-a`, name: "A", players: [player] },
      { id: `${id}-b`, name: "B", players: [player] },
    ],
    scores: [{ scoreA: 11, scoreB: 8 }],
    resultSubmittedByPlayerId: player.id,
    resultSubmittedAt: completedAt,
    location: "Court",
    matchStartsAt: completedAt,
    completedAt,
    createdAt: completedAt,
    updatedAt: completedAt,
  };
  return { ...match, ratingChanges: [log] };
};

const adjustment = (
  id: string,
  createdAt: Date,
  nextDoubles: number,
): PlayerRatingChangeLog => ({
  id,
  playerId: player.id,
  source: "official_adjustment_recalculation",
  sourceLogId: id,
  previousRating: { singles: 3, doubles: 3 },
  nextRating: { singles: 3, doubles: nextDoubles },
  delta: { singles: 0, doubles: nextDoubles - 3 },
  createdAt,
});

describe("buildPlayerRatingHistory", () => {
  it("공식 DUPR 반영이 없으면 재계산된 경기 점을 그대로 반환한다", () => {
    const first = buildMatch("first", new Date(now.getTime() - 2 * DAY_MS), 3.1);
    const second = buildMatch("second", new Date(now.getTime() - DAY_MS), 3.2);

    const history = buildPlayerRatingHistory(
      [second, first],
      player.id,
      { singles: 3, doubles: 3.2 },
      [],
      now,
    );

    expect(history.doubles).toEqual([
      expect.objectContaining({ rating: 3.1, source: "match" }),
      expect.objectContaining({ rating: 3.2, source: "match" }),
    ]);
    expect(history.singles).toEqual([
      expect.objectContaining({ rating: 3, source: "current" }),
    ]);
  });

  it("공식 반영값을 오래된 경기보다 가까운 경기 점에 더 크게 분배한다", () => {
    const oldMatch = buildMatch("old", new Date(now.getTime() - 60 * DAY_MS), 3);
    const recentMatch = buildMatch("recent", new Date(now.getTime() - DAY_MS), 3.2);

    const history = buildPlayerRatingHistory(
      [oldMatch, recentMatch],
      player.id,
      { singles: 3, doubles: 4 },
      [adjustment("official", now, 4)],
      now,
    );

    expect(history.doubles.at(-1)?.rating).toBe(4);
    expect(history.doubles[0]!.rating).toBeLessThan(history.doubles[1]!.rating);
    expect(history.doubles[0]!.rating).toBeGreaterThan(3);
    expect(history.doubles.every((point) => point.source === "match")).toBe(true);
  });

  it("공식 반영 뒤의 경기 점을 유지하면서 현재 레이팅으로 끝난다", () => {
    const beforeAdjustment = buildMatch(
      "before",
      new Date(now.getTime() - 2 * DAY_MS),
      3.2,
    );
    const afterAdjustment = buildMatch(
      "after",
      new Date(now.getTime() - DAY_MS),
      4.05,
    );

    const history = buildPlayerRatingHistory(
      [beforeAdjustment, afterAdjustment],
      player.id,
      { singles: 3, doubles: 4.05 },
      [adjustment("official", new Date(now.getTime() - DAY_MS - 1), 4)],
      now,
    );

    expect(history.doubles).toHaveLength(2);
    expect(history.doubles[0]).toMatchObject({ rating: 4, source: "match" });
    expect(history.doubles[1]).toMatchObject({ rating: 4.05, source: "match" });
  });

  it("여러 공식 반영을 시간순으로 누적해 현재 레이팅으로 연결한다", () => {
    const first = buildMatch("first", new Date(now.getTime() - 60 * DAY_MS), 3);
    const second = buildMatch("second", new Date(now.getTime() - 20 * DAY_MS), 3.2);
    const third = buildMatch("third", new Date(now.getTime() - 5 * DAY_MS), 3.8);
    const firstAdjustmentAt = new Date(now.getTime() - 15 * DAY_MS);

    const history = buildPlayerRatingHistory(
      [first, second, third],
      player.id,
      { singles: 3, doubles: 4 },
      [
        adjustment("first-official", firstAdjustmentAt, 3.7),
        adjustment("second-official", now, 4),
      ],
      now,
    );

    expect(history.doubles.at(-1)).toMatchObject({
      rating: 4,
      source: "match",
    });
    expect(history.doubles[0]!.rating).toBeGreaterThan(3);
    expect(history.doubles.every((point) => point.source === "match")).toBe(true);
  });

  it("같은 날 여러 완료 경기를 모두 유지하고 종목을 섞지 않는다", () => {
    const date = new Date(now.getTime() - DAY_MS);
    const doubles = buildMatch("doubles", date, 3.2);
    const singles = buildMatch("singles", new Date(date.getTime() + 1), 3.4, "singles");
    const doublesAgain = buildMatch("doubles-again", new Date(date.getTime() + 2), 3.3);

    const history = buildPlayerRatingHistory(
      [doubles, singles, doublesAgain],
      player.id,
      { singles: 3.4, doubles: 3.3 },
      [],
      now,
    );

    expect(history.doubles.map((point) => point.rating)).toEqual([3.2, 3.3]);
    expect(history.singles.map((point) => point.rating)).toEqual([3.4]);
  });

  it("완료 경기가 없는 종목은 현재 레이팅 하나만 반환한다", () => {
    const history = buildPlayerRatingHistory(
      [],
      player.id,
      { singles: 3.4, doubles: 3.8 },
      [adjustment("official", now, 3.8)],
      now,
    );

    expect(history).toEqual({
      singles: [expect.objectContaining({ rating: 3.4, source: "current" })],
      doubles: [expect.objectContaining({ rating: 3.8, source: "current" })],
    });
  });
});
