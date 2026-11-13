import { randomUUID } from "crypto";
import type {
  PlayerDuprCategory,
  PlayerRatingHistory,
  PlayerRatingHistoryPoint,
} from "@pkpkdupr/shared/player";

export interface PlayerRatingChartProjection {
  history: PlayerRatingHistory;
  generatedAt: Date;
}

const categories: PlayerDuprCategory[] = ["singles", "doubles"];

const createEmptyHistory = (): PlayerRatingHistory => ({
  singles: [],
  doubles: [],
});

const toUnixSeconds = (value: Date) => Math.floor(value.getTime() / 1000);

const isCategory = (value: unknown): value is PlayerDuprCategory =>
  value === "singles" || value === "doubles";

const isSource = (
  value: unknown,
): value is PlayerRatingHistoryPoint["source"] =>
  value === "match" || value === "current" || value === "anchor";

/**
 * 저장된 경기일별 평점 projection은 원본 평점 로그의 대체물이 아니다. 같은
 * playerId의 포인트와 생성 시각을 하나의 트랜잭션으로 바꿔 독자가 섞인
 * snapshot을 보지 않도록 한다.
 */
export class PlayerRatingChartProjectionRepository {
  constructor(private readonly client: any) {}

  async findByPlayerId(
    playerId: string,
  ): Promise<PlayerRatingChartProjection | null> {
    const projectionResult = await this.client.execute({
      sql: `SELECT generated_at AS "generatedAt"
            FROM player_rating_chart_projections
            WHERE player_id = $1`,
      args: [playerId],
    });
    const projection = projectionResult.rows[0] as
      | Record<string, unknown>
      | undefined;
    if (!projection) return null;

    const pointsResult = await this.client.execute({
      sql: `SELECT category, rating, source, point_at AS "pointAt"
            FROM player_rating_chart_points
            WHERE player_id = $1
            ORDER BY category ASC, point_at ASC, id ASC`,
      args: [playerId],
    });
    const history = createEmptyHistory();

    for (const record of pointsResult.rows as Array<Record<string, unknown>>) {
      if (!isCategory(record.category) || !isSource(record.source)) continue;

      const rating = Number(record.rating);
      const pointAt = new Date(Number(record.pointAt) * 1000);
      if (!Number.isFinite(rating) || Number.isNaN(pointAt.getTime())) continue;

      history[record.category].push({
        rating,
        source: record.source,
        createdAt: pointAt,
      });
    }

    return {
      history,
      generatedAt: new Date(Number(projection.generatedAt) * 1000),
    };
  }

  async replace(
    playerId: string,
    history: PlayerRatingHistory,
    generatedAt: Date = new Date(),
  ): Promise<PlayerRatingChartProjection> {
    const transaction = await this.client.transaction("write");
    let committed = false;
    const generatedAtSeconds = toUnixSeconds(generatedAt);

    try {
      await transaction.execute({
        sql: "DELETE FROM player_rating_chart_points WHERE player_id = $1",
        args: [playerId],
      });

      const rows: unknown[][] = [];
      for (const category of categories) {
        for (const point of history[category]) {
          const pointAt = new Date(point.createdAt);
          if (
            !Number.isFinite(point.rating) ||
            Number.isNaN(pointAt.getTime()) ||
            !isSource(point.source)
          ) {
            continue;
          }
          rows.push([
            randomUUID(),
            playerId,
            category,
            point.rating,
            point.source,
            toUnixSeconds(pointAt),
            generatedAtSeconds,
          ]);
        }
      }

      // 경기일 수만큼 점이 쌓이므로 한 문장으로 넣는다
      if (rows.length > 0) {
        const columnCount = rows[0].length;
        const values = rows
          .map((_, rowIndex) => {
            const offset = rowIndex * columnCount;
            const placeholders = Array.from(
              { length: columnCount },
              (_, columnIndex) => `$${offset + columnIndex + 1}`,
            );
            return `(${placeholders.join(", ")})`;
          })
          .join(", ");
        await transaction.execute({
          sql: `INSERT INTO player_rating_chart_points
                  (id, player_id, category, rating, source, point_at, generated_at)
                VALUES ${values}`,
          args: rows.flat(),
        });
      }

      await transaction.execute({
        sql: `INSERT INTO player_rating_chart_projections (player_id, generated_at)
              VALUES ($1, $2)
              ON CONFLICT (player_id) DO UPDATE SET generated_at = EXCLUDED.generated_at`,
        args: [playerId, generatedAtSeconds],
      });
      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) transaction.close();
    }

    return { history, generatedAt };
  }
}
