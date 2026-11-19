import type { Match } from "@pkpkdupr/shared/match";
import { desc } from "drizzle-orm";
import { matchEditLogs } from "../db/schema";
import type { RawStatement } from "../db/client";

export interface CreateMatchEditLogInput {
  id: string;
  matchId: string;
  editedByPlayerId: string;
  editedByAdmin: boolean;
  before: Match;
  after: Match;
  editedAt: Date;
}

export interface MatchEditLog {
  id: string;
  matchId: string;
  editedByPlayerId: string;
  editedByAdmin: boolean;
  /** Match를 JSON으로 직렬화한 값이라 Date 필드는 ISO 문자열이다 */
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  editedAt: Date;
}

/**
 * 경기 수정과 같은 트랜잭션에서 실행할 감사 로그 INSERT 문.
 * edited_at은 schema의 unixTimestamp 규칙대로 Unix 초로 넣는다.
 */
export const buildMatchEditLogInsert = (
  input: CreateMatchEditLogInput,
): RawStatement => ({
  sql: `
    INSERT INTO match_edit_logs (
      id,
      match_id,
      edited_by_player_id,
      edited_by_admin,
      before_snapshot,
      after_snapshot,
      edited_at
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
  `,
  args: [
    input.id,
    input.matchId,
    input.editedByPlayerId,
    input.editedByAdmin,
    JSON.stringify(input.before),
    JSON.stringify(input.after),
    Math.floor(input.editedAt.getTime() / 1000),
  ],
});

const toTime = (value: Date | string | undefined) =>
  value === undefined ? undefined : new Date(value).getTime();

/** 수정 기록에 남길 만한 차이(종류·이름·장소·팀·점수·세션·경기 시각)가 있는지 */
export const hasRecordedMatchChanged = (before: Match, after: Match): boolean => {
  const teamPlayerIds = (match: Match) =>
    match.teams.map((team) => team.players.map((player) => player.id));
  const scores = (match: Match) =>
    (match.scores ?? []).map((score) => [score.scoreA, score.scoreB]);
  const summary = (match: Match) =>
    JSON.stringify([
      match.type,
      match.name || null,
      match.location,
      teamPlayerIds(match),
      scores(match),
      match.session?.id ?? null,
      toTime(match.matchStartsAt),
    ]);
  return summary(before) !== summary(after);
};

/** 경기 수정 감사 로그 조회. 기록은 MatchRepository.updateRecordedMatch가 수정과 함께 남긴다 */
export class MatchEditLogRepository {
  constructor(private db: any) {}

  async findAll(): Promise<MatchEditLog[]> {
    return await this.db
      .select()
      .from(matchEditLogs)
      .orderBy(desc(matchEditLogs.editedAt));
  }
}
