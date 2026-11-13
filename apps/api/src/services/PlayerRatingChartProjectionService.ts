import type { Match } from "@pkpkdupr/shared/match";
import type {
  Player,
  PlayerDuprCategory,
  PlayerRatingChangeLog,
  PlayerRatingHistory,
  PlayerRatingHistoryPoint,
} from "@pkpkdupr/shared/player";
import type {
  MatchRepository,
  PlayerRatingChartProjection,
} from "../repositories/MatchRepository";
import type { AuthService } from "./AuthService";
import { toKstDateKey } from "@pkpkdupr/shared/session";
import { buildPlayerRatingHistory } from "./PlayerRatingHistoryService";

export const PROFILE_RATING_TREND_WINDOW_DAYS = 30;
const RANKING_RATING_TREND_WINDOW_DAYS = 90;
// 양끝점 + 내부 변곡점 최대 여섯 개
export const RANKING_RATING_TREND_MAX_POINTS = 8;

type MatchWithRatingChanges = Match & {
  ratingChanges?: PlayerRatingChangeLog[];
};

const categories: PlayerDuprCategory[] = ["singles", "doubles"];
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SIGNIFICANT_CHART_DEVIATION = 0.0005;

const isValidPoint = (point: PlayerRatingHistoryPoint) =>
  Number.isFinite(point.rating) && !Number.isNaN(point.createdAt.getTime());

const clonePoint = (
  point: PlayerRatingHistoryPoint,
  overrides: Partial<PlayerRatingHistoryPoint> = {},
): PlayerRatingHistoryPoint => ({
  ...point,
  ...overrides,
  createdAt: new Date(overrides.createdAt ?? point.createdAt),
});

const getLargestDeviationIndex = (
  points: PlayerRatingHistoryPoint[],
  startIndex: number,
  endIndex: number,
) => {
  const start = points[startIndex];
  const end = points[endIndex];
  if (!start || !end || endIndex - startIndex < 2) return null;

  const duration = end.createdAt.getTime() - start.createdAt.getTime();
  let candidate: number | null = null;
  let largestDeviation = 0;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const point = points[index];
    if (!point) continue;
    const ratio = duration === 0
      ? (index - startIndex) / (endIndex - startIndex)
      : (point.createdAt.getTime() - start.createdAt.getTime()) / duration;
    const expectedRating = start.rating + (end.rating - start.rating) * ratio;
    const deviation = Math.abs(point.rating - expectedRating);
    if (deviation > largestDeviation) {
      largestDeviation = deviation;
      candidate = index;
    }
  }

  return candidate;
};

const sortValidPoints = (points: PlayerRatingHistoryPoint[]) =>
  points
    .filter(isValidPoint)
    .map((point) => clonePoint(point))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

/**
 * 저장용 projection. 전체 decay 보정이 끝난 선에서 경기한 날(KST)마다
 * 그날 마지막 평점 하나만 남긴다. 기간 자르기는 읽을 때 한다.
 */
export const collapseRatingHistoryByKstDay = (
  history: PlayerRatingHistory,
): PlayerRatingHistory =>
  Object.fromEntries(
    categories.map((category) => {
      const daily: PlayerRatingHistoryPoint[] = [];
      let lastDateKey: string | null = null;
      for (const point of sortValidPoints(history[category])) {
        const dateKey = toKstDateKey(point.createdAt);
        if (dateKey === lastDateKey) daily[daily.length - 1] = point;
        else daily.push(point);
        lastDateKey = dateKey;
      }
      return [category, daily];
    }),
  ) as PlayerRatingHistory;

/**
 * 프로필 추세 차트용으로 최근 windowDays일만 고른다. 기간 이전 평점이 있으면
 * 마지막 값을 기간 시작 시각의 anchor로 앞에 둔다.
 */
export const selectRatingTrendWindow = (
  history: PlayerRatingHistory,
  windowDays: number,
  now: Date = new Date(),
): PlayerRatingHistory => {
  const cutoffMs = now.getTime() - windowDays * DAY_MS;
  return Object.fromEntries(
    categories.map((category) => {
      const sorted = sortValidPoints(history[category]);
      const beforeCutoff = sorted
        .filter((point) => point.createdAt.getTime() < cutoffMs)
        .at(-1);
      const inWindow = sorted.filter(
        (point) =>
          point.createdAt.getTime() >= cutoffMs &&
          point.createdAt.getTime() <= now.getTime(),
      );
      const anchor = beforeCutoff
        ? [
            clonePoint(beforeCutoff, {
              createdAt: new Date(cutoffMs),
              source: "anchor",
            }),
          ]
        : [];
      return [category, [...anchor, ...inWindow]];
    }),
  ) as PlayerRatingHistory;
};

/**
 * 랭킹 추이용으로 최근 90일 선을 작은 sparkline 점 목록으로 압축한다.
 * 양끝점은 고정하고, 실제 최고/최저와 선형 추세에서 가장 많이 벗어나는 지점만
 * 최대 여섯 개 보존한다.
 */
export const buildRankingRatingTrend = (
  history: PlayerRatingHistory,
  now: Date = new Date(),
): PlayerRatingHistory => {
  const windowed = selectRatingTrendWindow(
    history,
    RANKING_RATING_TREND_WINDOW_DAYS,
    now,
  );

  return Object.fromEntries(
    categories.map((category) => {
      const timeline = windowed[category];

      const latest = timeline.at(-1);
      // 같은 날 완료된 매치가 있어도, 해당 시점보다 현재가 늦으면 오늘의
      // 현재 레이팅 지점을 끝점으로 추가한다.
      if (
        latest &&
        latest.source !== "current" &&
        latest.createdAt.getTime() < now.getTime()
      ) {
        timeline.push(
          clonePoint(latest, { createdAt: now, source: "current" }),
        );
      }

      const uniqueTimeline = timeline.filter(
        (point, index, points) =>
          index === 0 ||
          point.createdAt.getTime() !== points[index - 1]?.createdAt.getTime(),
      );
      if (uniqueTimeline.length <= RANKING_RATING_TREND_MAX_POINTS) {
        return [category, uniqueTimeline];
      }

      const selected = new Set<number>([0, uniqueTimeline.length - 1]);
      const maximum = Math.max(...uniqueTimeline.map((point) => point.rating));
      const minimum = Math.min(...uniqueTimeline.map((point) => point.rating));
      const maxIndex = uniqueTimeline.findIndex((point) => point.rating === maximum);
      const minIndex = uniqueTimeline.findIndex((point) => point.rating === minimum);
      if (maxIndex > 0 && maxIndex < uniqueTimeline.length - 1) selected.add(maxIndex);
      if (minIndex > 0 && minIndex < uniqueTimeline.length - 1) selected.add(minIndex);

      while (selected.size < RANKING_RATING_TREND_MAX_POINTS) {
        const selectedIndexes = [...selected].sort((left, right) => left - right);
        let nextIndex: number | null = null;
        let largestDeviation = 0;

        for (let index = 1; index < selectedIndexes.length; index += 1) {
          const startIndex = selectedIndexes[index - 1];
          const endIndex = selectedIndexes[index];
          if (startIndex == null || endIndex == null) continue;
          const candidate = getLargestDeviationIndex(
            uniqueTimeline,
            startIndex,
            endIndex,
          );
          if (candidate == null) continue;

          const start = uniqueTimeline[startIndex]!;
          const end = uniqueTimeline[endIndex]!;
          const point = uniqueTimeline[candidate]!;
          const duration = end.createdAt.getTime() - start.createdAt.getTime();
          const ratio = duration === 0
            ? (candidate - startIndex) / (endIndex - startIndex)
            : (point.createdAt.getTime() - start.createdAt.getTime()) / duration;
          const expectedRating = start.rating + (end.rating - start.rating) * ratio;
          const deviation = Math.abs(point.rating - expectedRating);
          if (deviation > largestDeviation) {
            largestDeviation = deviation;
            nextIndex = candidate;
          }
        }

        if (
          nextIndex == null ||
          largestDeviation <= MIN_SIGNIFICANT_CHART_DEVIATION
        ) {
          break;
        }
        selected.add(nextIndex);
      }

      return [
        category,
        [...selected]
          .sort((left, right) => left - right)
          .map((index) => uniqueTimeline[index]!),
      ];
    }),
  ) as PlayerRatingHistory;
};

export const attachMatchRatingChanges = (
  matches: Match[],
  ratingChangeLogs: PlayerRatingChangeLog[],
): MatchWithRatingChanges[] => {
  const logsByMatch = new Map<string, PlayerRatingChangeLog[]>();
  for (const log of ratingChangeLogs) {
    if (log.source !== "match_completed") continue;
    const matchId = log.sourceLogId
      .replace(/^match-completed-/, "")
      .replace(/-[^-]+$/, "");
    const logs = logsByMatch.get(matchId) ?? [];
    logs.push(log);
    logsByMatch.set(matchId, logs);
  }

  return matches.map((match) => ({
    ...match,
    ratingChanges: logsByMatch.get(match.id) ?? [],
  }));
};

type ProjectionRepository = Pick<
  MatchRepository,
  | "findByPlayerId"
  | "getPlayerRatingChangeLogs"
  | "getPlayerRatingChartProjection"
  | "replacePlayerRatingChartProjection"
>;

type PlayerLookup = Pick<AuthService, "getPlayerById">;

export class PlayerRatingChartProjectionService {
  constructor(
    private readonly matchRepository: ProjectionRepository,
    private readonly playerLookup: PlayerLookup,
  ) {}

  async getOrRebuild(playerId: string): Promise<PlayerRatingChartProjection> {
    const existing = await this.matchRepository.getPlayerRatingChartProjection(
      playerId,
    );
    return existing ?? this.rebuildPlayer(playerId);
  }

  async rebuildPlayer(playerId: string): Promise<PlayerRatingChartProjection> {
    const [result, ratingChangeLogs, player] = await Promise.all([
      this.matchRepository.findByPlayerId(playerId, 0, 10_000),
      this.matchRepository.getPlayerRatingChangeLogs(playerId),
      this.playerLookup.getPlayerById(playerId),
    ]);
    const history = buildPlayerRatingHistory(
      attachMatchRatingChanges(result.matches, ratingChangeLogs),
      playerId,
      player?.duprRating,
      ratingChangeLogs,
    );
    const projection = {
      history: collapseRatingHistoryByKstDay(history),
      generatedAt: new Date(),
    };
    return this.matchRepository.replacePlayerRatingChartProjection(
      playerId,
      projection,
    );
  }

  async rebuildPlayers(playerIds: Iterable<string>): Promise<void> {
    const uniquePlayerIds = [...new Set([...playerIds].filter(Boolean))];
    // 각 projection 교체는 기존 포인트를 지운 뒤 다시 넣는 write
    // transaction이다. 병렬 실행하면 InnoDB의 보조 인덱스 gap lock이
    // 서로 충돌할 수 있으므로 한 번에 하나씩 갱신한다.
    for (const playerId of uniquePlayerIds) {
      await this.rebuildPlayer(playerId);
    }
  }
}
