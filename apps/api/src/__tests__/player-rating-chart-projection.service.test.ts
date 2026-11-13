import type { PlayerRatingHistory } from "@pkpkdupr/shared/player";
import { describe, expect, it, vi } from "vitest";
import type { MatchRepository } from "../repositories/MatchRepository";
import type { AuthService } from "../services/AuthService";
import {
  RANKING_RATING_TREND_MAX_POINTS,
  buildRankingRatingTrend,
  collapseRatingHistoryByKstDay,
  PlayerRatingChartProjectionService,
  PROFILE_RATING_TREND_WINDOW_DAYS,
  selectRatingTrendWindow,
} from "../services/PlayerRatingChartProjectionService";

const now = new Date("2026-08-03T12:00:00.000Z");
const dayBefore = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe("collapseRatingHistoryByKstDay", () => {
  it("KST 날짜마다 그날 마지막 평점만 남긴다", () => {
    const history: PlayerRatingHistory = {
      singles: [],
      doubles: [
        // 8월 1일 21:00 KST
        { rating: 3.4, createdAt: new Date("2026-08-01T12:00:00.000Z"), source: "match" },
        // 8월 1일 19:00 KST
        { rating: 3.5, createdAt: new Date("2026-08-01T10:00:00.000Z"), source: "match" },
        // UTC로는 8월 1일이지만 KST로는 8월 2일 00:30
        { rating: 3.3, createdAt: new Date("2026-08-01T15:30:00.000Z"), source: "match" },
      ],
    };

    expect(collapseRatingHistoryByKstDay(history).doubles).toEqual([
      expect.objectContaining({ rating: 3.4 }),
      expect.objectContaining({ rating: 3.3 }),
    ]);
  });
});

describe("selectRatingTrendWindow", () => {
  it("NR에서 처음 받은 평점부터는 anchor 없이 경기일 점만 준다", () => {
    const history: PlayerRatingHistory = {
      singles: [],
      doubles: [
        { rating: 3.5, createdAt: dayBefore(1), source: "match" },
        { rating: 3.2, createdAt: dayBefore(0.1), source: "match" },
      ],
    };

    const trend = selectRatingTrendWindow(
      history,
      PROFILE_RATING_TREND_WINDOW_DAYS,
      now,
    ).doubles;

    expect(trend.map((point) => [point.rating, point.source])).toEqual([
      [3.5, "match"],
      [3.2, "match"],
    ]);
  });

  it("기간 이전 마지막 평점을 기간 시작 anchor로 앞에 둔다", () => {
    const history: PlayerRatingHistory = {
      singles: [],
      doubles: [
        { rating: 3.1, createdAt: dayBefore(45), source: "match" },
        { rating: 3.25, createdAt: dayBefore(31), source: "match" },
        { rating: 3.3, createdAt: dayBefore(10), source: "match" },
      ],
    };

    const trend = selectRatingTrendWindow(history, 30, now).doubles;

    expect(trend).toEqual([
      expect.objectContaining({
        rating: 3.25,
        source: "anchor",
        createdAt: dayBefore(30),
      }),
      expect.objectContaining({ rating: 3.3, source: "match" }),
    ]);
  });
});

describe("buildRankingRatingTrend", () => {
  it("90일 시작 anchor와 현재 양끝점을 고정하고 내부 지점을 최대 여섯 개만 남긴다", () => {
    const history: PlayerRatingHistory = {
      singles: [
        { rating: 3.2, createdAt: dayBefore(120), source: "match" },
        { rating: 3.4, createdAt: dayBefore(85), source: "match" },
        { rating: 2.7, createdAt: dayBefore(78), source: "match" },
        { rating: 3.5, createdAt: dayBefore(70), source: "match" },
        { rating: 2.5, createdAt: dayBefore(63), source: "match" },
        { rating: 3.7, createdAt: dayBefore(56), source: "match" },
        { rating: 3.1, createdAt: dayBefore(49), source: "match" },
        { rating: 4.2, createdAt: dayBefore(42), source: "match" },
        { rating: 3.2, createdAt: dayBefore(35), source: "match" },
        { rating: 3.8, createdAt: dayBefore(28), source: "match" },
        { rating: 3.0, createdAt: dayBefore(21), source: "match" },
        { rating: 3.6, createdAt: dayBefore(14), source: "match" },
        { rating: 3.3, createdAt: dayBefore(7), source: "match" },
      ],
      doubles: [],
    };

    const projection = buildRankingRatingTrend(history, now).singles;

    expect(projection).toHaveLength(RANKING_RATING_TREND_MAX_POINTS);
    expect(projection[0]).toMatchObject({
      rating: 3.2,
      source: "anchor",
      createdAt: dayBefore(90),
    });
    expect(projection.at(-1)).toMatchObject({
      rating: 3.3,
      source: "current",
      createdAt: now,
    });
    expect(projection.map((point) => point.rating)).toEqual(
      expect.arrayContaining([2.5, 4.2]),
    );
  });

  it("같은 날 완료된 매치 뒤에도 오늘의 현재 레이팅 지점을 추가한다", () => {
    const history: PlayerRatingHistory = {
      singles: [
        { rating: 3.4, createdAt: dayBefore(0.5), source: "match" },
      ],
      doubles: [],
    };

    const projection = buildRankingRatingTrend(history, now).singles;

    expect(projection).toEqual([
      expect.objectContaining({ rating: 3.4, source: "match" }),
      expect.objectContaining({
        rating: 3.4,
        source: "current",
        createdAt: now,
      }),
    ]);
  });

  it("이력 없는 종목의 현재 평점은 오늘 점 하나만 유지한다", () => {
    const history: PlayerRatingHistory = {
      singles: [
        { rating: 3.163, createdAt: now, source: "current" },
      ],
      doubles: [],
    };

    const projection = buildRankingRatingTrend(history, now).singles;

    expect(projection).toEqual([
      expect.objectContaining({
        rating: 3.163,
        source: "current",
        createdAt: now,
      }),
    ]);
  });

  it("직선 추세에서는 불필요한 내부 변곡점을 저장하지 않는다", () => {
    const history: PlayerRatingHistory = {
      singles: Array.from({ length: 12 }, (_, index) => ({
        rating: 3 + index * 0.05,
        createdAt: dayBefore(80 - index * (80 / 11)),
        source: "match" as const,
      })),
      doubles: [],
    };

    const projection = buildRankingRatingTrend(history, now).singles;

    expect(projection).toHaveLength(2);
    expect(projection[0]?.source).toBe("match");
    expect(projection[1]).toMatchObject({ source: "match", createdAt: now });
  });
});

describe("PlayerRatingChartProjectionService", () => {
  it("여러 선수 projection 교체를 순차 실행한다", async () => {
    let activeReplacementCount = 0;
    let maxActiveReplacementCount = 0;
    const replacedPlayerIds: string[] = [];
    const repository = {
      findByPlayerId: vi.fn().mockResolvedValue({ matches: [], total: 0 }),
      getPlayerRatingChangeLogs: vi.fn().mockResolvedValue([]),
      replacePlayerRatingChartProjection: vi.fn(
        async (playerId: string, projection: unknown) => {
          activeReplacementCount += 1;
          maxActiveReplacementCount = Math.max(
            maxActiveReplacementCount,
            activeReplacementCount,
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
          replacedPlayerIds.push(playerId);
          activeReplacementCount -= 1;
          return projection;
        },
      ),
    } as unknown as MatchRepository;
    const playerLookup = {
      getPlayerById: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const service = new PlayerRatingChartProjectionService(
      repository,
      playerLookup,
    );

    await service.rebuildPlayers(["player-a", "player-b", "player-a"]);

    expect(replacedPlayerIds).toEqual(["player-a", "player-b"]);
    expect(maxActiveReplacementCount).toBe(1);
  });
});
