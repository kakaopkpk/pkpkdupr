import type { SessionPraiseRecord } from "@pkpkdupr/shared/sessionPraise";
import type { DbClient } from "../db/client";

/**
 * 세션 칭찬 저장. 회원이 세션마다 한 번만 보낸다(PK session_id·voter_player_id).
 * 읽기는 세션 목록과 함께 MatchRepository.findSessionsWithParticipantIds가 한다
 */
export class SessionPraiseRepository {
  constructor(private readonly client: DbClient) {}

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
