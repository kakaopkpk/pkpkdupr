import {
  normalizeStoredPlayerDupr,
  serializeStoredPlayerDupr,
  shouldStorePlayerDuprAsNull,
  type Player,
  type PlayerAffiliation,
  type PlayerDupr,
  type PlayerStatus,
  type StoredPlayerDupr,
} from "@pkpkdupr/shared/player";
import { desc, eq } from "drizzle-orm";
import { isEntityId } from "@pkpkdupr/shared/entityId";
import { players } from "../db/schema";

export interface StoredPlayerRecord extends Player {
  passwordHash: string;
  isFirstLogin: boolean;
}

export interface CreateStoredPlayerInput {
  id: string;
  username: string;
  duprRating: PlayerDupr | null;
  gender: "M" | "F";
  status: PlayerStatus;
  avatarUrl?: string | null;
  affiliations?: PlayerAffiliation[];
  statusMessage?: string | null;
  statusMessageBackgroundColor?: string | null;
  passwordHash: string;
  isFirstLogin: boolean;
  createdAt: Date;
  updatedAt: Date;
  duprState?: StoredPlayerDupr;
}

export class PlayerRepository {
  constructor(private db: any) {}

  async findById(id: string): Promise<StoredPlayerRecord | undefined> {
    const player = await this.db
      .select()
      .from(players)
      .where(eq(players.id, id))
      .get();
    return player ? this.hydrate(player) : undefined;
  }

  async findByUsername(username: string): Promise<StoredPlayerRecord | undefined> {
    const player = await this.db
      .select()
      .from(players)
      .where(eq(players.username, username))
      .get();
    return player ? this.hydrate(player) : undefined;
  }

  async findAll(): Promise<StoredPlayerRecord[]> {
    const records = await this.db
      .select()
      .from(players)
      .orderBy(desc(players.createdAt))
      .all();
    return records.map((record: any) => this.hydrate(record));
  }

  private hydrate(record: any): StoredPlayerRecord {
    let affiliations: PlayerAffiliation[] = [];
    try {
      const parsed = JSON.parse(record.affiliationsJson ?? "[]") as unknown;
      if (Array.isArray(parsed)) {
        affiliations = parsed.filter(
          (item): item is PlayerAffiliation =>
            !!item &&
            typeof item === "object" &&
            typeof (item as PlayerAffiliation).name === "string" &&
            typeof (item as PlayerAffiliation).isPrimary === "boolean",
        );
      }
    } catch {
      affiliations = [];
    }

    const {
      affiliationsJson: _affiliationsJson,
      statusMessage,
      statusMessageBackgroundColor,
      ...player
    } = record;
    return {
      ...player,
      affiliations,
      ...(statusMessage ? { statusMessage } : {}),
      ...(statusMessageBackgroundColor ? { statusMessageBackgroundColor } : {}),
    } as StoredPlayerRecord;
  }

  async create(data: CreateStoredPlayerInput): Promise<StoredPlayerRecord> {
    if (!isEntityId(data.id, "player")) {
      throw new Error("유효한 플레이어 ID가 필요합니다.");
    }
    const { duprState, affiliations, statusMessage, statusMessageBackgroundColor, ...storedData } = data;
    const duprRating = duprState
      ? serializeStoredPlayerDupr(duprState)
      : shouldStorePlayerDuprAsNull(storedData.duprRating)
        ? null
        : serializeStoredPlayerDupr(
            normalizeStoredPlayerDupr(storedData.duprRating),
          );

    await this.db.insert(players).values({
      ...storedData,
      avatarUrl: storedData.avatarUrl ?? null,
      affiliationsJson: JSON.stringify(affiliations ?? []),
      statusMessage: statusMessage ?? null,
      statusMessageBackgroundColor: statusMessageBackgroundColor ?? null,
      duprRating,
      createdAt: new Date(storedData.createdAt),
      updatedAt: new Date(storedData.updatedAt),
    });
    const created = await this.findById(data.id);
    if (!created) {
      throw new Error("플레이어 생성에 실패했습니다.");
    }
    return created;
  }

  async updateStatus(id: string, status: PlayerStatus): Promise<StoredPlayerRecord | undefined> {
    await this.db
      .update(players)
      .set({ status, updatedAt: new Date() })
      .where(eq(players.id, id));
    return await this.findById(id);
  }

  async updateGender(
    id: string,
    gender: Player["gender"],
  ): Promise<StoredPlayerRecord | undefined> {
    await this.db
      .update(players)
      .set({ gender, updatedAt: new Date() })
      .where(eq(players.id, id));
    return await this.findById(id);
  }

  async updatePassword(
    id: string,
    passwordHash: string,
    isFirstLogin: boolean,
  ): Promise<StoredPlayerRecord | undefined> {
    await this.db
      .update(players)
      .set({ passwordHash, isFirstLogin, updatedAt: new Date() })
      .where(eq(players.id, id));
    return await this.findById(id);
  }

  async updateProfile(
    id: string,
    data: {
      avatarUrl?: string | null;
      affiliations?: PlayerAffiliation[];
      statusMessage?: string | null;
      statusMessageBackgroundColor?: string | null;
    },
  ): Promise<StoredPlayerRecord | undefined> {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (Object.prototype.hasOwnProperty.call(data, "avatarUrl")) {
      update.avatarUrl = data.avatarUrl ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, "affiliations")) {
      update.affiliationsJson = JSON.stringify(data.affiliations ?? []);
    }
    if (Object.prototype.hasOwnProperty.call(data, "statusMessage")) {
      update.statusMessage = data.statusMessage ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, "statusMessageBackgroundColor")) {
      update.statusMessageBackgroundColor = data.statusMessageBackgroundColor ?? null;
    }
    await this.db
      .update(players)
      .set(update)
      .where(eq(players.id, id));
    return await this.findById(id);
  }

  async initAdminIfMissing(data: CreateStoredPlayerInput): Promise<StoredPlayerRecord> {
    const existing = await this.findByUsername(data.username);
    if (existing) {
      return existing;
    }
    return await this.create(data);
  }

  async updateDuprState(
    id: string,
    duprState: StoredPlayerDupr,
  ): Promise<StoredPlayerRecord | undefined> {
    await this.db
      .update(players)
      .set({
        duprRating: serializeStoredPlayerDupr(duprState),
        updatedAt: new Date(),
      })
      .where(eq(players.id, id));
    return await this.findById(id);
  }

  async clearDuprState(id: string): Promise<StoredPlayerRecord | undefined> {
    await this.db
      .update(players)
      .set({
        duprRating: null,
        updatedAt: new Date(),
      })
      .where(eq(players.id, id));
    return await this.findById(id);
  }
}
