import { playerAuthLinkLogs } from "../db/schema";

/** 회원과 Auth 사용자를 연결한 방식. 현재는 이메일 앞부분 자동 연결뿐이다. */
export type PlayerAuthLinkMethod = "email_local_part";

export interface PlayerAuthLinkLog {
  id: string;
  playerId: string;
  authUserId: string;
  linkMethod: PlayerAuthLinkMethod;
  createdAt: Date;
}

export type CreatePlayerAuthLinkLogInput = PlayerAuthLinkLog;

export class PlayerAuthLinkLogRepository {
  constructor(private db: any) {}

  async create(data: CreatePlayerAuthLinkLogInput): Promise<void> {
    await this.db.insert(playerAuthLinkLogs).values({
      ...data,
      createdAt: new Date(data.createdAt),
    });
  }
}
