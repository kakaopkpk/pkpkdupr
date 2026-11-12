import type { MatchTopLevelType } from "./match.js";
import type { Player } from "./player.js";
import type { MatchSessionKind } from "./session.js";

export type RankingPlayer = Pick<Player, "id" | "username" | "avatarUrl">;

export interface RankingEntry {
  /** 1부터 연속 */
  rank: number;
  player: RankingPlayer;
  rating: number;
  /** 이 분류의 완료 경기 수 */
  matchCount: number;
  /** 기준 순위 - 현재 순위. 양수=상승, 0=보합, null=기준 시점에 순위 없음 */
  rankChange: number | null;
  /** 최근 90일 평점 추이(오래된 순) */
  trend: number[];
}

export interface UnratedRankingEntry {
  player: RankingPlayer;
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
  /** 복식 평점: 세션 시작 직전 / 세션 마지막 완료 경기 반영 직후 */
  ratingBefore: number | null;
  ratingAfter: number | null;
  /** ratingAfter - ratingBefore. 둘 중 하나라도 NR(null)이면 0이라 세션 중 처음 평점을 얻은 선수는 topRiser 후보가 아니다 */
  ratingDelta: number;
  /** 복식 순위: 같은 두 시점 */
  rankBefore: number | null;
  rankAfter: number | null;
}

/** GET /api/session-reports/:sessionId 응답 */
export interface MatchSessionReport {
  session: MatchSessionHistoryItem;
  players: SessionPlayerReport[];
  topRiser: SessionPlayerReport | null;
}
