import type {
  MatchSessionHistoryItem,
  RankingPlayer,
  SessionPlayerReport,
} from "./ranking.js";
import type { SessionPraiseCandidate } from "./sessionPraise.js";

/** 세션 카드 소식 줄 */
export type NewsFeedLine =
  /** 그 세션 경기로 받은 업적 하나(세션 리포트 achievements와 같은 규칙) */
  | {
      kind: "achievement";
      player: RankingPlayer;
      achievementId: string;
      earnedMatchId: string;
      earnedAt: Date;
    }
  /**
   * 마감 뒤 칭찬을 SESSION_PRAISE_HIGHLIGHT_MIN개 이상 받은 후보(세션 지배자 줄 다음, 후보 순서).
   * 이 세션으로 칭찬 업적을 받은 회원은 이 줄 대신 업적 줄만 나온다
   */
  | ({ kind: "praise" } & SessionPraiseCandidate)
  /** 세션 마지막 완료 경기 직후 연승 수(WIN_STREAK_DISPLAY_MIN 이상) */
  | { kind: "winStreak"; player: RankingPlayer; winStreak: number }
  /**
   * 그 세션으로 복식 TOP3에 새로 들었거나 TOP3 안에서 오른 회원.
   * rank는 세션 후 순위, rankChange는 rankBefore - rankAfter(양수). 세션 전 순위가 없었으면 null
   */
  | {
      kind: "rank";
      player: RankingPlayer;
      rank: number;
      rankChange: number | null;
    };

/** 완료 경기가 있는 세션 하나 */
export interface NewsFeedSessionItem {
  kind: "session";
  session: MatchSessionHistoryItem;
  /** 요청자 줄(세션 리포트 players의 요청자 줄). 그 세션 경기를 안 뛰었으면 null */
  mine: SessionPlayerReport | null;
  /** 세션 지배자(세션 리포트 topRiser) */
  topRiser: SessionPlayerReport | null;
  lines: NewsFeedLine[];
}

/** 새로 정회원이 된 회원 */
export interface NewsFeedNewMemberItem {
  kind: "newMember";
  player: RankingPlayer;
  /** 정회원이 된 시각(getPlayerJoinedAt) */
  joinedAt: Date;
}

export type NewsFeedItem = NewsFeedSessionItem | NewsFeedNewMemberItem;

/** GET /api/news-feed 응답 */
export interface NewsFeedResponse {
  /** 시각 내림차순. 같은 시각이면 세션 먼저 */
  items: NewsFeedItem[];
  /** 다음 페이지 cursor 쿼리 값. 더 없으면 null */
  nextCursor: string | null;
}
