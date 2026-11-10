import type { PlayerStatus, PlayerStatusChangeLog } from "@pkpkdupr/shared/player";
import { desc, eq } from "drizzle-orm";
import { playerStatusChangeLogs } from "../db/schema";

export interface CreatePlayerStatusChangeLogInput {
  id: string;
  playerId: string;
  previousStatus: PlayerStatus;
  nextStatus: PlayerStatus;
  changedByPlayerId: string;
  changedByUsername: string;
  changedAt: Date;
}

export class PlayerStatusChangeLogRepository {
  constructor(private db: any) {}

  async create(data: CreatePlayerStatusChangeLogInput): Promise<PlayerStatusChangeLog> {
    await this.db.insert(playerStatusChangeLogs).values({
      ...data,
      changedAt: new Date(data.changedAt),
    });
    const created = await this.db
      .select()
      .from(playerStatusChangeLogs)
      .where(eq(playerStatusChangeLogs.id, data.id))
      .get();

    if (!created) {
      throw new Error("상태 변경 로그 저장에 실패했습니다.");
    }
    return created;
  }

  async findAll(): Promise<PlayerStatusChangeLog[]> {
    return await this.db
      .select()
      .from(playerStatusChangeLogs)
      .orderBy(desc(playerStatusChangeLogs.changedAt))
      .all();
  }
}
