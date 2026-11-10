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
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { isEntityId } from "@pkpkdupr/shared/entityId";
import { players } from "../db/schema";
import { firstRow } from "../db/client";

export interface StoredPlayerRecord extends Player {
  /** 연결된 Supabase Auth 사용자 ID. API 응답에는 내보내지 않는다. */
  authUserId: string | null;
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
  authUserId?: string | null;
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
      .limit(1)
      .then(firstRow);
    return player ? this.hydrate(player) : undefined;
  }

  async findByUsername(username: string): Promise<StoredPlayerRecord | undefined> {
    const player = await this.db
      .select()
      .from(players)
      .where(eq(players.username, username))
      .limit(1)
      .then(firstRow);
    return player ? this.hydrate(player) : undefined;
  }

  async findByAuthUserId(
    authUserId: string,
  ): Promise<StoredPlayerRecord | undefined> {
    const player = await this.db
      .select()
      .from(players)
      .where(eq(players.authUserId, authUserId))
      .limit(1)
      .then(firstRow);
    return player ? this.hydrate(player) : undefined;
  }

  /** username은 대소문자를 구분해 unique이므로 대소문자만 다른 회원이 여럿일 수 있다. */
  async findAllByUsernameIgnoringCase(
    username: string,
  ): Promise<StoredPlayerRecord[]> {
    const records = await this.db
      .select()
      .from(players)
      .where(sql`lower(${players.username}) = lower(${username})`);
    return records.map((record: any) => this.hydrate(record));
  }

  /**
   * 아직 연결되지 않은 회원에만 Auth 사용자를 연결한다.
   * 동시 요청으로 이미 연결됐으면 false를 돌려준다.
   */
  async linkAuthUser(id: string, authUserId: string): Promise<boolean> {
    const updated = await this.db
      .update(players)
      .set({ authUserId, updatedAt: new Date() })
      .where(and(eq(players.id, id), isNull(players.authUserId)))
      .returning({ id: players.id });
    return updated.length > 0;
  }

  async findAll(): Promise<StoredPlayerRecord[]> {
    const records = await this.db
      .select()
      .from(players)
      .orderBy(desc(players.createdAt));
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
      authUserId: player.authUserId ?? null,
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
      authUserId: storedData.authUserId ?? null,
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
