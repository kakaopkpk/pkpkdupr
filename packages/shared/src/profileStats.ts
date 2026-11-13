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

/** 요청자(보는 사람) 기준 한 분류의 맞대결 승패 */
export interface HeadToHeadStat {
  matchCount: number;
  wins: number;
  losses: number;
  /** 그 맞대결들에서 요청자 평점이 바뀐 양의 합(이 분류 평점) */
  ratingDelta: number;
}

/** 상성에 넣는 최소 맞대결 완료 경기 수 */
export const RIVAL_MIN_MATCHES = 3;
/** 상성에 보이는 최대 회원 수 */
export const RIVAL_MAX_COUNT = 3;

/** 상대 팀으로 만난 회원별 승패(대상 선수 기준) */
export interface OpponentStat {
  opponent: StatPlayer;
  matchCount: number;
  wins: number;
  losses: number;
}
