import type { Player } from "@pkpkdupr/shared/player";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { inviteCodes, playerCreationLogs, players } from "../db/schema";

export interface CreateInviteCodeInput {
  id: string;
  codeHash: string;
  createdByPlayerId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface StoredInviteCodeSummary {
  id: string;
  createdByUsername: string;
  createdAt: Date;
  expiresAt: Date;
  usedByUsername: string | null;
  usedAt: Date | null;
}

export interface RedeemInviteCodeInput {
  codeHash: string;
  usedAt: Date;
  player: {
    id: string;
    username: string;
    gender: Player["gender"];
    authUserId: string;
  };
  creationLogId: string;
}

export class InviteCodeRepository {
  constructor(private db: any) {}

  async create(data: CreateInviteCodeInput): Promise<void> {
    await this.db.insert(inviteCodes).values({
      ...data,
      usedByPlayerId: null,
      usedAt: null,
    });
  }

  async findAllSummaries(): Promise<StoredInviteCodeSummary[]> {
    const creator = alias(players, "invite_creator");
    const usedBy = alias(players, "invite_used_by");
    return await this.db
      .select({
        id: inviteCodes.id,
        createdByUsername: creator.username,
        createdAt: inviteCodes.createdAt,
        expiresAt: inviteCodes.expiresAt,
        usedByUsername: usedBy.username,
        usedAt: inviteCodes.usedAt,
      })
      .from(inviteCodes)
      .innerJoin(creator, eq(creator.id, inviteCodes.createdByPlayerId))
      .leftJoin(usedBy, eq(usedBy.id, inviteCodes.usedByPlayerId))
      .orderBy(desc(inviteCodes.createdAt));
  }

  /**
   * 미사용·미만료 코드를 사용 처리하고, 같은 트랜잭션에서 Auth 사용자와 연결된 회원과 생성 로그를 만든다.
   * 코드가 없거나 만료·사용됐으면 아무것도 바꾸지 않고 false를 돌려준다.
   * username·auth_user_id unique 위반은 그대로 throw한다(트랜잭션은 롤백된다).
   */
  async redeemForNewPlayer(input: RedeemInviteCodeInput): Promise<boolean> {
    const { codeHash, usedAt, player, creationLogId } = input;
    return await this.db.transaction(async (tx: any) => {
      // 조건부 UPDATE 한 번으로 소비해 같은 코드를 동시에 내도 한 요청만 성공한다.
      const consumed = await tx
        .update(inviteCodes)
        .set({ usedByPlayerId: player.id, usedAt })
        .where(
          and(
            eq(inviteCodes.codeHash, codeHash),
            isNull(inviteCodes.usedAt),
            gt(inviteCodes.expiresAt, usedAt),
          ),
        )
        .returning({ id: inviteCodes.id });
      if (consumed.length === 0) {
        return false;
      }

      await tx.insert(players).values({
        id: player.id,
        username: player.username,
        duprRating: null,
        gender: player.gender,
        status: "active",
        avatarUrl: null,
        affiliationsJson: "[]",
        statusMessage: null,
        statusMessageBackgroundColor: null,
        authUserId: player.authUserId,
        createdAt: usedAt,
        updatedAt: usedAt,
      });
      await tx.insert(playerCreationLogs).values({
        id: creationLogId,
        playerId: player.id,
        createdByPlayerId: player.id,
        createdByUsername: player.username,
        creationSource: "invite",
        createdAt: usedAt,
      });
      return true;
    });
  }
}
