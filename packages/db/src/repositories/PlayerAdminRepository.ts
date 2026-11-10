import { eq } from "drizzle-orm";
import { playerAdmins } from "../db/schema";
import { firstRow } from "../db/client";

export class PlayerAdminRepository {
  constructor(private db: any) {}

  async isAdmin(playerId: string): Promise<boolean> {
    const row = await this.db
      .select({ playerId: playerAdmins.playerId })
      .from(playerAdmins)
      .where(eq(playerAdmins.playerId, playerId))
      .limit(1)
      .then(firstRow);
    return !!row;
  }

  /** 이미 관리자면 아무것도 바꾸지 않는다. */
  async add(playerId: string, createdAt: Date = new Date()): Promise<void> {
    await this.db
      .insert(playerAdmins)
      .values({ playerId, createdAt })
      .onConflictDoNothing();
  }
}
