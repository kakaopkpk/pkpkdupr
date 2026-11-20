import type { Match as SharedMatch } from "@pkpkdupr/shared/match";
import type {
  PlayerRatingChangeLog,
  PlayerRatingHistory,
} from "@pkpkdupr/shared/player";
import { isSessionOnToday, type MatchSessionKind } from "@pkpkdupr/shared/session";
import type { EarnedAchievementInfo } from "@/lib/achievements";

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
    /** 세션 종류와 시작·종료 시각("HH:MM", KST). 경기 응답에는 항상 있다 */
    kind: MatchSessionKind;
    startTime: string | null;
    endTime: string | null;
  };
  ratingChanges?: PlayerRatingChangeLog[];
  /** 기록·수정 응답에만 있다. 이 저장으로 참가자들이 새로 받은 업적 */
  newAchievements?: EarnedAchievementInfo[];
  /** 기록·수정 응답에만 있다. 새 업적을 받은 참가자별 지금 업적 점수 합 */
  achievementPoints?: Record<string, number>;
  /** 경기 상세 응답에만 있다. 이 경기로 참가자들이 받은 업적(지금 계산 기준) */
  achievements?: EarnedAchievementInfo[];
};

/** 경기에 든 선수 id 전부 */
export const getMatchPlayerIds = (match: Pick<MatchInfo, "teams">): string[] =>
  match.teams.flatMap((team) => team.players.map((player) => player.id));

/**
 * 대진 예정 경기(status "scheduled")이거나 시작 시각 전인 관리자 예정 경기면 예정으로 본다.
 * 회원이 시작한 경기는 시작 시각이 서버의 지금이라, 단말 시계가 느리거나 now가 늦게 갱신돼도 예정으로 보지 않는다.
 */
export const isMatchScheduled = (
  match: Pick<MatchInfo, "matchStartsAt" | "status" | "source">,
  now: Date,
): boolean =>
  match.status === "scheduled" ||
  (match.source === "admin_created" &&
    new Date(match.matchStartsAt).getTime() > now.getTime());

/** 서버 start 검증과 같은 기준(`isSessionOnToday`)으로 오늘 세션의 경기면 true. 전날 시작해 아직 끝나지 않은 자정 넘김 세션도 포함한다 */
export const isMatchSessionToday = (
  match: Pick<MatchInfo, "session">,
  now: Date,
): boolean =>
  !!match.session &&
  isSessionOnToday(
    { ...match.session, date: new Date(match.session.date) },
    now,
  );

/** 완료 경기 상세에서 "같은 멤버로 한 판 더"를 보여 주는 기간(기록 시각 기준) */
export const REMATCH_WINDOW_MS = 60 * 60 * 1000;

/** 기록(completedAt, 없으면 시작 시각)한 지 1시간이 안 된 경기면 true */
export const isWithinRematchWindow = (
  match: Pick<MatchInfo, "completedAt" | "matchStartsAt">,
  now: Date,
): boolean =>
  now.getTime() -
    new Date(match.completedAt ?? match.matchStartsAt).getTime() <
  REMATCH_WINDOW_MS;

/** 게스트가 낀 경기(ratingExcluded)의 평점 변화 자리에 보이는 한 줄 */
export const RATING_EXCLUDED_NOTICE = "평점 미반영 · 게스트 참여 경기";

export interface MatchListResponse {
  matches: MatchInfo[];
  total: number;
  /** 공식 레이팅 반영 감사 이벤트. 프로필 그래프에는 직접 표시하지 않는다. */
  ratingAdjustmentLogs?: PlayerRatingChangeLog[];
  /** API가 공식 DUPR 보정을 분배해 만든 프로필 차트 전용 이력. */
  ratingHistory?: PlayerRatingHistory;
}

/** 카드에 크게 보여 줄 두 팀의 점수. 점수가 없으면 0:0이다. */
export const getTeamResultScores = (
  match: Pick<MatchInfo, "scores">,
): [number, number] => {
  const [score] = match.scores ?? [];
  return [score?.scoreA ?? 0, score?.scoreB ?? 0];
};
