import type { OfficialDuprAdjustmentLog } from "@pkpkdupr/shared/player";
import { desc } from "drizzle-orm";
import { officialDuprAdjustmentLogs } from "../db/schema";

export type CreateOfficialDuprAdjustmentLogInput = OfficialDuprAdjustmentLog;

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const hydrateLog = (record: any): OfficialDuprAdjustmentLog => ({
  id: record.id,
  playerId: record.playerId,
  changedByPlayerId: record.changedByPlayerId,
  changedByUsername: record.changedByUsername,
  ratings: parseJson(record.ratingsJson),
  confidence: parseJson(record.confidenceJson),
  previousRating: parseJson(record.previousRatingJson),
  nextRating: parseJson(record.nextRatingJson),
  preUpdateAccuracy: parseJson(record.preUpdateAccuracyJson),
  reason: record.reason ?? null,
  createdAt: new Date(record.createdAt),
});

export class OfficialDuprAdjustmentLogRepository {
  constructor(private db: any) {}

  async findAll(): Promise<OfficialDuprAdjustmentLog[]> {
    const rows = await this.db
      .select()
      .from(officialDuprAdjustmentLogs)
      .orderBy(desc(officialDuprAdjustmentLogs.createdAt))
      .all();
    return rows.map(hydrateLog);
  }

  async create(
    data: CreateOfficialDuprAdjustmentLogInput,
  ): Promise<OfficialDuprAdjustmentLog> {
    await this.db.insert(officialDuprAdjustmentLogs).values({
      id: data.id,
      playerId: data.playerId,
      changedByPlayerId: data.changedByPlayerId,
      changedByUsername: data.changedByUsername,
      ratingsJson: JSON.stringify(data.ratings),
      confidenceJson: JSON.stringify(data.confidence),
      previousRatingJson: JSON.stringify(data.previousRating),
      nextRatingJson: JSON.stringify(data.nextRating),
      preUpdateAccuracyJson: JSON.stringify(data.preUpdateAccuracy),
      reason: data.reason,
      createdAt: new Date(data.createdAt),
    });
    const logs = await this.findAll();
    const created = logs.find((log) => log.id === data.id);
    if (!created) {
      throw new Error("공식 DUPR 반영 로그 생성에 실패했습니다.");
    }
    return created;
  }
}
