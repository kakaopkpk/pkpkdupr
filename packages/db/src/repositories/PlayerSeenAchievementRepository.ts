import type { SeenAchievementRef } from "@pkpkdupr/shared/achievements";
import { placeholders, type DbClient } from "../db/client";

const COLUMNS_PER_ROW = 4;

/**
 * 회원이 축하 시트로 확인한 업적 기록. 업적은 저장하지 않고 조회 시 계산하므로,
 * 지금 받은 업적과 이 기록의 획득 경기가 다르면 미확인으로 본다.
 */
export class PlayerSeenAchievementRepository {
  constructor(private readonly client: DbClient) {}

  async findByPlayerId(playerId: string): Promise<SeenAchievementRef[]> {
    const result = await this.client.execute({
      sql: `SELECT achievement_id AS "achievementId",
                   earned_match_id AS "earnedMatchId"
            FROM player_seen_achievements
            WHERE player_id = $1`,
      args: [playerId],
    });
    return result.rows.map((row) => ({
      achievementId: String(row.achievementId),
      earnedMatchId: String(row.earnedMatchId),
    }));
  }

  /** 업적별로 확인한 획득 경기를 덮어쓴다. 같은 요청을 다시 보내도 결과가 같다 */
  async markSeen(
    playerId: string,
    items: readonly SeenAchievementRef[],
    seenAt: Date,
  ): Promise<void> {
    // 한 요청에 같은 업적이 두 번 오면 ON CONFLICT가 같은 행을 두 번 고치려다 실패하므로 마지막 값만 남긴다
    const byAchievementId = new Map(
      items.map((item) => [item.achievementId, item]),
    );
    if (byAchievementId.size === 0) return;

    const seenAtSeconds = Math.floor(seenAt.getTime() / 1000);
    const rows = [...byAchievementId.values()];
    const values = rows
      .map(
        (_, index) =>
          `(${placeholders(COLUMNS_PER_ROW, index * COLUMNS_PER_ROW + 1)})`,
      )
      .join(", ");
    const args = rows.flatMap((item) => [
      playerId,
      item.achievementId,
      item.earnedMatchId,
      seenAtSeconds,
    ]);
    await this.client.execute({
      sql: `INSERT INTO player_seen_achievements (
              player_id,
              achievement_id,
              earned_match_id,
              seen_at
            )
            VALUES ${values}
            ON CONFLICT (player_id, achievement_id) DO UPDATE
              SET earned_match_id = EXCLUDED.earned_match_id,
                  seen_at = EXCLUDED.seen_at`,
      args,
    });
  }
}
