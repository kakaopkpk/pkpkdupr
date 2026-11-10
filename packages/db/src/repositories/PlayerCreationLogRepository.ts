import type { PlayerCreationLog, PlayerCreationSource } from "@pkpkdupr/shared/player";
import { desc, eq } from "drizzle-orm";
import { playerCreationLogs } from "../db/schema";

export interface CreatePlayerCreationLogInput {
  id: string;
  playerId: string;
  createdByPlayerId: string | null;
  createdByUsername: string;
  creationSource: PlayerCreationSource;
  createdAt: Date;
}

export class PlayerCreationLogRepository {
  constructor(private db: any) {}

  async create(data: CreatePlayerCreationLogInput): Promise<PlayerCreationLog> {
    await this.db.insert(playerCreationLogs).values({
      ...data,
      createdAt: new Date(data.createdAt),
    });
    const created = await this.db
      .select()
      .from(playerCreationLogs)
      .where(eq(playerCreationLogs.id, data.id))
      .get();

    if (!created) {
      throw new Error("생성 로그 저장에 실패했습니다.");
    }
    return created;
  }

  async findAll(): Promise<PlayerCreationLog[]> {
    return await this.db
      .select()
      .from(playerCreationLogs)
      .orderBy(desc(playerCreationLogs.createdAt))
      .all();
  }
}
