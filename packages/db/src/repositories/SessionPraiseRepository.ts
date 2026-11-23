import type { SessionPraiseRecord } from "@pkpkdupr/shared/sessionPraise";
import { placeholders, type DbClient } from "../db/client";

const toRecord = (row: Record<string, unknown>): SessionPraiseRecord => ({
  sessionId: String(row.sessionId),
  voterPlayerId: String(row.voterPlayerId),
  targetPlayerId: String(row.targetPlayerId),
  createdAt: new Date(Number(row.createdAt) * 1000),
});

const SELECT_COLUMNS = `session_id AS "sessionId",
       voter_player_id AS "voterPlayerId",
       target_player_id AS "targetPlayerId",
       created_at AS "createdAt"`;

/** 세션 칭찬. 회원이 세션마다 한 번만 보낸다(PK session_id·voter_player_id) */
export class SessionPraiseRepository {
  constructor(private readonly client: DbClient) {}

  /** 전체 칭찬(칭찬 업적 계산용). 동호회 규모라 통째로 읽는다 */
  async findAll(): Promise<SessionPraiseRecord[]> {
    const result = await this.client.execute({
      sql: `SELECT ${SELECT_COLUMNS} FROM session_praises`,
      args: [],
    });
    return result.rows.map(toRecord);
  }

  async findBySessionIds(
    sessionIds: readonly string[],
  ): Promise<SessionPraiseRecord[]> {
    if (sessionIds.length === 0) return [];
    const result = await this.client.execute({
      sql: `SELECT ${SELECT_COLUMNS}
            FROM session_praises
            WHERE session_id IN (${placeholders(sessionIds.length)})`,
      args: [...sessionIds],
    });
    return result.rows.map(toRecord);
  }

  /** 칭찬을 저장한다. 이미 이 세션에 칭찬했으면 저장하지 않고 false */
  async create(
    praise: Omit<SessionPraiseRecord, "createdAt">,
    createdAt: Date,
  ): Promise<boolean> {
    const result = await this.client.execute({
      sql: `INSERT INTO session_praises (
              session_id,
              voter_player_id,
              target_player_id,
              created_at
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (session_id, voter_player_id) DO NOTHING
            RETURNING session_id`,
      args: [
        praise.sessionId,
        praise.voterPlayerId,
        praise.targetPlayerId,
        Math.floor(createdAt.getTime() / 1000),
      ],
    });
    return result.rows.length > 0;
  }
}
