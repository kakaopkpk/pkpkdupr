import type { EarnedAchievement } from "./achievements.js";
import type { MatchTopLevelType } from "./match.js";
import type { Player } from "./player.js";
import type { MatchSessionKind } from "./session.js";

export type RankingPlayer = Pick<Player, "id" | "username" | "avatarUrl">;

/** 랭킹 줄 회원. 상태메시지가 없으면 필드를 생략한다(Player와 같은 규칙) */
export type RankingEntryPlayer = Pick<
  Player,
  | "id"
  | "username"
  | "avatarUrl"
  | "statusMessage"
  | "statusMessageBackgroundColor"
>;

export interface RankingEntry {
  /** 1부터 연속 */
  rank: number;
  player: RankingEntryPlayer;
  rating: number;
  /** 이 분류의 완료 경기 수 */
  matchCount: number;
  /** 기준 순위 - 현재 순위. 양수=상승, 0=보합, null=기준 시점에 순위 없음 */
  rankChange: number | null;
}

export interface UnratedRankingEntry {
  player: RankingEntryPlayer;
  matchCount: number;
}

/** GET /api/rankings?category= 응답 */
export interface RankingResponse {
  category: MatchTopLevelType;
  /** 순위 변동 기준 세션. 없으면 null */
  baselineSessionId: string | null;
  entries: RankingEntry[];
  unrated: UnratedRankingEntry[];
}

export interface MatchSessionHistoryItem {
  id: string;
  name: string;
  kind: MatchSessionKind;
  date: Date;
  dateKey: string;
  location: string;
  participantCount: number;
  /** 완료 경기 수 */
  matchCount: number;
}

/** GET /api/session-reports 응답 */
export interface MatchSessionHistoryResponse {
  sessions: MatchSessionHistoryItem[];
}

export interface SessionPlayerReport {
  player: RankingPlayer;
  matchCount: number;
  wins: number;
  losses: number;
  /**
   * 복식 평점: 세션 시작 직전 / 세션 마지막 완료 경기 반영 직후.
   * 세션 전에 NR이던 회원은 첫 경기 완료 평점 로그의 시작값(기본 3.0)이 ratingBefore다.
   * 세션 후에도 복식 NR이면 둘 다 null이다.
   */
  ratingBefore: number | null;
  ratingAfter: number | null;
  /** ratingAfter - ratingBefore. 세션 후에도 복식 NR이라 둘 중 하나가 null이면 0이다 */
  ratingDelta: number;
  /** 복식 순위: 같은 두 시점. 세션 전 NR이던 회원의 rankBefore는 순위표에 없었으므로 null이다 */
  rankBefore: number | null;
  rankAfter: number | null;
}

/** GET /api/session-reports/:sessionId 응답 */
export interface MatchSessionReport {
  session: MatchSessionHistoryItem;
  players: SessionPlayerReport[];
  topRiser: SessionPlayerReport | null;
  /** 이 세션 경기로 받은 업적(참가자 전원). 받은 시각 오름차순 */
  achievements: EarnedAchievement[];
}
