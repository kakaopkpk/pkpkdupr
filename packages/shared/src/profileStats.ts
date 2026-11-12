import type { Player } from "./player.js";

/** 파트너 궁합에 넣는 최소 같은 팀 복식 완료 경기 수 */
export const PARTNER_STAT_MIN_MATCHES = 3;

export type StatPlayer = Pick<Player, "id" | "username" | "avatarUrl">;

export interface PartnerStat {
  partner: StatPlayer;
  matchCount: number;
  wins: number;
  losses: number;
}

/** 요청자(보는 사람) 기준 맞대결 승패 */
export interface HeadToHeadStat {
  matchCount: number;
  wins: number;
  losses: number;
}
