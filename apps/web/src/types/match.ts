import type { Match as SharedMatch } from "@pkpkdupr/shared/match";
import { isMultiGameMatchRecord } from "@pkpkdupr/shared/match";
import type {
  PlayerRatingChangeLog,
  PlayerRatingHistory,
} from "@pkpkdupr/shared/player";

/** API JSON 응답 기준 경기. 날짜 필드는 ISO 문자열이다. */
export type MatchInfo = Omit<
  SharedMatch,
  | "matchStartsAt"
  | "createdAt"
  | "updatedAt"
  | "completedAt"
  | "resultSubmittedAt"
  | "session"
> & {
  matchStartsAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  resultSubmittedAt: string | null;
  session?: {
    id: string;
    name?: string;
    date: string;
  };
  ratingChanges?: PlayerRatingChangeLog[];
};


export interface MatchListResponse {
  matches: MatchInfo[];
  total: number;
  /** 공식 레이팅 반영 감사 이벤트. 프로필 그래프에는 직접 표시하지 않는다. */
  ratingAdjustmentLogs?: PlayerRatingChangeLog[];
  /** API가 공식 DUPR 보정을 분배해 만든 프로필 차트 전용 이력. */
  ratingHistory?: PlayerRatingHistory;
}

/**
 * 카드에 크게 보여 줄 두 팀의 결과. 단판은 점수, 점수가 여러 개인 과거 2선승 기록은 이긴 게임 수다.
 */
export const getTeamResultScores = (
  match: Pick<MatchInfo, "scores">,
): [number, number] => {
  const scores = match.scores ?? [];
  if (!isMultiGameMatchRecord(match)) {
    return [scores[0]?.scoreA ?? 0, scores[0]?.scoreB ?? 0];
  }

  return [
    scores.filter((score) => score.scoreA > score.scoreB).length,
    scores.filter((score) => score.scoreB > score.scoreA).length,
  ];
};

