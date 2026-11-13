import type { Match } from "@pkpkdupr/shared/match";
import { desc, eq } from "drizzle-orm";
import { matchDeletionLogs } from "../db/schema";
import type { RawStatement } from "../db/client";

export interface CreateMatchDeletionLogInput {
  id: string;
  matchId: string;
  deletedByPlayerId: string;
  deletedByAdmin: boolean;
  /** 지운 시점의 경기 전체. 되살릴 때 원래 id·completedAt을 그대로 쓴다 */
  matchSnapshot: Match;
  deletedAt: Date;
}

export interface MatchDeletionLog {
  id: string;
  matchId: string;
  deletedByPlayerId: string;
  deletedByAdmin: boolean;
  /** Match를 JSON으로 직렬화한 값이라 Date 필드는 ISO 문자열이다 */
  matchSnapshot: Record<string, unknown>;
  deletedAt: Date;
}

/**
 * 경기 삭제와 같은 트랜잭션에서 실행할 감사 로그 INSERT 문.
 * deleted_at은 schema의 unixTimestamp 규칙대로 Unix 초로 넣는다.
 */
export const buildMatchDeletionLogInsert = (
  input: CreateMatchDeletionLogInput,
): RawStatement => ({
  sql: `
    INSERT INTO match_deletion_logs (
      id,
      match_id,
      deleted_by_player_id,
      deleted_by_admin,
      match_snapshot,
      deleted_at
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
  `,
  args: [
    input.id,
    input.matchId,
    input.deletedByPlayerId,
    input.deletedByAdmin,
    JSON.stringify(input.matchSnapshot),
    Math.floor(input.deletedAt.getTime() / 1000),
  ],
});

/** 경기 삭제 감사 로그 조회. 기록은 MatchRepository.deleteRecordedMatch가 삭제와 함께 남긴다 */
export class MatchDeletionLogRepository {
  constructor(private db: any) {}

  async findAll(): Promise<MatchDeletionLog[]> {
    return await this.db
      .select()
      .from(matchDeletionLogs)
      .orderBy(desc(matchDeletionLogs.deletedAt));
  }

  async findByMatchId(matchId: string): Promise<MatchDeletionLog[]> {
    return await this.db
      .select()
      .from(matchDeletionLogs)
      .where(eq(matchDeletionLogs.matchId, matchId))
      .orderBy(desc(matchDeletionLogs.deletedAt));
  }
}
