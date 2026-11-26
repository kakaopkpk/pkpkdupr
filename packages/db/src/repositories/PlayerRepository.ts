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
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { isEntityId } from "@pkpkdupr/shared/entityId";
import { playerAdmins, players } from "../db/schema";
import { firstRow, placeholders, type DbClient } from "../db/client";

export interface StoredPlayerRecord extends Player {
  /** 연결된 Supabase Auth 사용자 ID. API 응답에는 내보내지 않는다. */
  authUserId: string | null;
  /** 관리자가 발급·초기화한 비밀번호를 아직 바꾸지 않은 상태. */
  isFirstLogin: boolean;
  /** 게스트를 추가한 회원과 세션. 정회원은 null이다. API 공개 응답에는 내보내지 않는다. */
  guestAddedByPlayerId: string | null;
  guestAddedSessionId: string | null;
  /** 마지막으로 앱에 들어온 시각. 관리자 회원 목록에만 내보낸다. */
  lastActiveAt: Date | null;
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

export type DeletePlayerWithoutMatchesResult =
  | {
      status: "deleted";
      /** 지운 회원에 연결돼 있던 Supabase Auth 사용자. DB 삭제 뒤 호출부가 지운다 */
      authUserId: string | null;
      /** 참여 신청을 지운 세션 */
      sessionIds: string[];
    }
  | { status: "not_found" }
  | { status: "admin" }
  | { status: "has_matches" };

/** 회원 삭제 때 player_id로 함께 지우는 회원별 행. player_admins·player_seen_achievements는 FK CASCADE로 지워진다 */
const PLAYER_OWNED_TABLES = [
  "player_creation_logs",
  "player_status_change_logs",
  "player_rating_change_logs",
  "player_rating_chart_projections",
  "player_rating_chart_points",
  "official_dupr_adjustment_logs",
] as const;

export class PlayerRepository {
  /** client는 트랜잭션이 필요한 쓰기(deletePlayerWithoutMatches)에만 쓴다 */
  constructor(
    private db: any,
    private client?: DbClient,
  ) {}

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
   * active 게스트를 정회원으로 바꾸고 성별을 저장한다.
   * authUserId를 주면 아직 Auth 사용자가 연결되지 않은 게스트에만 연결하고 첫 로그인 비밀번호 변경을 켠다.
   * null이면 이미 연결된 계정과 첫 로그인 상태를 그대로 둔다.
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
    const now = new Date();
    const updated = await this.db
      .update(players)
      .set({
        isGuest: false,
        gender,
        // 새로 발급한 계정만 첫 로그인 비밀번호 변경을 켠다. 게스트 때 받은 계정은 상태를 그대로 둔다
        ...(authUserId ? { authUserId, isFirstLogin: true } : {}),
        promotedAt: now,
        updatedAt: now,
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
      promotedAt: player.promotedAt ?? null,
      lastActiveAt: player.lastActiveAt ?? null,
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

  /**
   * 앱 진입 시각을 기록한다. 마지막 기록이 minIntervalSeconds보다 최근이면 쓰지 않는다.
   * 회원 정보 수정이 아니므로 updated_at은 바꾸지 않는다.
   */
  async recordLastActive(
    id: string,
    now: Date,
    minIntervalSeconds: number,
  ): Promise<void> {
    const threshold = new Date(now.getTime() - minIntervalSeconds * 1000);
    await this.db
      .update(players)
      .set({ lastActiveAt: now })
      .where(
        and(
          eq(players.id, id),
          or(isNull(players.lastActiveAt), lte(players.lastActiveAt, threshold)),
        ),
      );
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

  /**
   * 경기 행(match_participants)이 하나도 없는 회원을 회원별 행·세션 참여 신청과 함께 지운다.
   * 확인과 삭제를 한 트랜잭션에서 하고 match_participants를 SHARE 잠금해, 확인 뒤 커밋 전까지 그 회원의 경기가 새로 들어오지 못한다.
   * Auth 사용자는 지우지 않고 id만 돌려준다.
   */
  async deletePlayerWithoutMatches(
    id: string,
  ): Promise<DeletePlayerWithoutMatchesResult> {
    if (!this.client) {
      throw new Error("회원 삭제에는 DB client가 필요합니다.");
    }
    const transaction = await this.client.transaction("write");
    let committed = false;
    const finish = async <T>(result: T): Promise<T> => {
      await transaction.commit();
      committed = true;
      return result;
    };
    try {
      const player = await transaction.execute({
        sql: "SELECT id, auth_user_id FROM players WHERE id = $1 FOR UPDATE",
        args: [id],
      });
      if (!player.rows.length) {
        return await finish({ status: "not_found" });
      }
      const admin = await transaction.execute({
        sql: "SELECT 1 FROM player_admins WHERE player_id = $1",
        args: [id],
      });
      if (admin.rows.length) {
        return await finish({ status: "admin" });
      }

      await transaction.execute("LOCK TABLE match_participants IN SHARE MODE");
      const match = await transaction.execute({
        sql: "SELECT 1 FROM match_participants WHERE player_id = $1 LIMIT 1",
        args: [id],
      });
      if (match.rows.length) {
        return await finish({ status: "has_matches" });
      }

      const sessions = await transaction.execute({
        sql: `
          DELETE FROM match_session_participants
          WHERE player_id = $1
          RETURNING session_id
        `,
        args: [id],
      });
      const sessionIds = [
        ...new Set(sessions.rows.map((row) => String(row.session_id))),
      ];
      if (sessionIds.length) {
        await transaction.execute({
          sql: `UPDATE match_sessions SET updated_at = $1 WHERE id IN (${placeholders(sessionIds.length, 2)})`,
          args: [Math.floor(Date.now() / 1000), ...sessionIds],
        });
      }
      for (const table of PLAYER_OWNED_TABLES) {
        await transaction.execute({
          sql: `DELETE FROM ${table} WHERE player_id = $1`,
          args: [id],
        });
      }
      await transaction.execute({
        sql: "DELETE FROM players WHERE id = $1",
        args: [id],
      });

      const authUserId = player.rows[0]?.auth_user_id;
      return await finish({
        status: "deleted",
        authUserId: typeof authUserId === "string" ? authUserId : null,
        sessionIds,
      });
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }
}
