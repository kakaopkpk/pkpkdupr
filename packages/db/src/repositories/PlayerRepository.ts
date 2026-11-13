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
import { playerAdmins, players } from "../db/schema";
import { firstRow } from "../db/client";

export interface StoredPlayerRecord extends Player {
  /** 연결된 Supabase Auth 사용자 ID. API 응답에는 내보내지 않는다. */
  authUserId: string | null;
  /** 관리자가 발급·초기화한 비밀번호를 아직 바꾸지 않은 상태. */
  isFirstLogin: boolean;
  /** 게스트를 추가한 회원과 세션. 정회원은 null이다. API 공개 응답에는 내보내지 않는다. */
  guestAddedByPlayerId: string | null;
  guestAddedSessionId: string | null;
}

export interface CreateStoredPlayerInput {
  id: string;
  username: string;
  duprRating: PlayerDupr | null;
  /** 게스트만 null */
  gender: "M" | "F" | null;
  status: PlayerStatus;
  isGuest?: boolean;
  guestAddedByPlayerId?: string | null;
  guestAddedSessionId?: string | null;
  avatarUrl?: string | null;
  affiliations?: PlayerAffiliation[];
  statusMessage?: string | null;
  statusMessageBackgroundColor?: string | null;
  authUserId?: string | null;
  isFirstLogin?: boolean;
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

  /** 인증 경로에서 회원과 관리자 여부를 쿼리 1회(players LEFT JOIN player_admins)로 가져온다. */
  async findByAuthUserIdWithAdmin(
    authUserId: string,
  ): Promise<{ player: StoredPlayerRecord; isAdmin: boolean } | undefined> {
    const row = await this.db
      .select({ player: players, adminPlayerId: playerAdmins.playerId })
      .from(players)
      .leftJoin(playerAdmins, eq(playerAdmins.playerId, players.id))
      .where(eq(players.authUserId, authUserId))
      .limit(1)
      .then(firstRow);
    return row
      ? { player: this.hydrate(row.player), isAdmin: row.adminPlayerId != null }
      : undefined;
  }

  /** username은 lower(username) 기준으로 unique이므로 대소문자 구분 없이 최대 한 명이다. */
  async findByUsernameIgnoringCase(
    username: string,
  ): Promise<StoredPlayerRecord | undefined> {
    const player = await this.db
      .select()
      .from(players)
      .where(sql`lower(${players.username}) = lower(${username})`)
      .limit(1)
      .then(firstRow);
    return player ? this.hydrate(player) : undefined;
  }

  /**
   * 아직 연결되지 않은 active 회원에만 Auth 사용자를 연결한다.
   * 동시 요청으로 이미 연결됐거나 조회 후 inactive로 바뀌었으면 false를 돌려준다.
   */
  async linkAuthUser(
    id: string,
    authUserId: string,
    isFirstLogin: boolean,
  ): Promise<boolean> {
    const updated = await this.db
      .update(players)
      .set({ authUserId, isFirstLogin, updatedAt: new Date() })
      .where(
        and(
          eq(players.id, id),
          isNull(players.authUserId),
          eq(players.status, "active"),
        ),
      )
      .returning({ id: players.id });
    return updated.length > 0;
  }

  /**
   * active 게스트를 정회원으로 바꾸고 성별을 저장하며 첫 로그인 비밀번호 변경을 켠다.
   * authUserId를 주면 아직 Auth 사용자가 연결되지 않은 게스트에만 연결한다.
   * 조건에 맞는 행이 없으면(이미 정회원·inactive·이미 연결됨) undefined다.
   */
  async promoteGuest(
    id: string,
    gender: "M" | "F",
    authUserId: string | null,
  ): Promise<StoredPlayerRecord | undefined> {
    const conditions = [
      eq(players.id, id),
      eq(players.isGuest, true),
      eq(players.status, "active"),
    ];
    if (authUserId) {
      conditions.push(isNull(players.authUserId));
    }
    const updated = await this.db
      .update(players)
      .set({
        isGuest: false,
        gender,
        isFirstLogin: true,
        ...(authUserId ? { authUserId } : {}),
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning({ id: players.id });
    return updated.length > 0 ? await this.findById(id) : undefined;
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
      isFirstLogin: !!player.isFirstLogin,
      gender: player.gender ?? null,
      isGuest: player.isGuest === true,
      guestAddedByPlayerId: player.guestAddedByPlayerId ?? null,
      guestAddedSessionId: player.guestAddedSessionId ?? null,
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
      isGuest: storedData.isGuest ?? false,
      guestAddedByPlayerId: storedData.guestAddedByPlayerId ?? null,
      guestAddedSessionId: storedData.guestAddedSessionId ?? null,
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

  async updateFirstLogin(
    id: string,
    isFirstLogin: boolean,
  ): Promise<StoredPlayerRecord | undefined> {
    await this.db
      .update(players)
      .set({ isFirstLogin, updatedAt: new Date() })
      .where(eq(players.id, id));
    return await this.findById(id);
  }

  /** lower(username) 유니크 인덱스 위반이면 Postgres unique_violation(23505)을 그대로 던진다. */
  async updateUsername(
    id: string,
    username: string,
  ): Promise<StoredPlayerRecord | undefined> {
    await this.db
      .update(players)
      .set({ username, updatedAt: new Date() })
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
