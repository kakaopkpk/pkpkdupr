import type {
  MatchSessionParticipant,
  MatchType,
  RecordMatchTeamRequest,
} from "./match.js";
import type { PublicPlayerDupr } from "./player.js";

/** 정기 세션 요일(KST, 0=일요일). 월·목 */
export const REGULAR_SESSION_WEEKDAYS: readonly number[] = [1, 4];
/** 정기 세션에 묶이는 경기 시작 시각 범위(KST 시). 시작 포함, 끝 미포함 */
export const REGULAR_SESSION_START_HOUR = 18;
export const REGULAR_SESSION_END_HOUR = 22;
export const REGULAR_SESSION_NAME = "정기 세션";
export const REGULAR_SESSION_LOCATION = "야탑초등학교";
/** 경기 기록·세션 만들기의 장소 기본값 */
export const DEFAULT_MATCH_LOCATION = REGULAR_SESSION_LOCATION;
/** 회원이 만드는 세션의 이름·장소 최대 글자 수(`Array.from(value).length` 기준) */
export const MATCH_SESSION_NAME_MAX_LENGTH = 30;
export const MATCH_SESSION_LOCATION_MAX_LENGTH = 30;
/** 점수 없는 진행 중 경기가 무효로 삭제되기까지의 시간(시작 시각 기준) */
export const IN_PROGRESS_MATCH_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export type MatchSessionKind = "regular" | "custom";

// KST는 일광절약이 없는 고정 UTC+9다. Intl 시간대 데이터 없이 계산해 런타임마다 같게 동작한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** KST 벽시계 값을 UTC 필드로 읽을 수 있게 옮긴 Date */
const toKstShifted = (date: Date): Date =>
  new Date(date.getTime() + KST_OFFSET_MS);

/** KST 기준 날짜 키 YYYY-MM-DD */
export const toKstDateKey = (date: Date): string =>
  toKstShifted(date).toISOString().slice(0, 10);

/** KST 날짜 키의 hour시(KST) 시각. hour 생략 시 0시 */
export const kstDateKeyToDate = (dateKey: string, hour = 0): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour) - KST_OFFSET_MS);
};

/** 경기 시작 시각이 월·목 18:00 이상 22:00 미만(KST)이면 true */
export const isRegularSessionTime = (date: Date): boolean => {
  const kst = toKstShifted(date);
  const hour = kst.getUTCHours();
  return (
    REGULAR_SESSION_WEEKDAYS.includes(kst.getUTCDay()) &&
    hour >= REGULAR_SESSION_START_HOUR &&
    hour < REGULAR_SESSION_END_HOUR
  );
};

/** 오늘(KST)이 정기 세션 요일이고 22:00 KST 전이면 true. 정기 세션을 새로 만들 수 있는 시간 */
export const canOpenRegularSession = (now: Date): boolean => {
  const kst = toKstShifted(now);
  return (
    REGULAR_SESSION_WEEKDAYS.includes(kst.getUTCDay()) &&
    kst.getUTCHours() < REGULAR_SESSION_END_HOUR
  );
};

/** 경기가 하나도 없는 세션이 사라지는 시각. 정기=그날 22:00 KST, 그 외=다음 날 00:00 KST */
export const getEmptySessionExpiresAt = (
  kind: MatchSessionKind,
  sessionDate: Date,
): Date => {
  const dayStart = kstDateKeyToDate(toKstDateKey(sessionDate));
  return kind === "regular"
    ? new Date(dayStart.getTime() + REGULAR_SESSION_END_HOUR * HOUR_MS)
    : new Date(dayStart.getTime() + DAY_MS);
};

/** 점수 없는 진행 중 경기가 시작 2시간을 넘겨 무효(삭제 대상)면 true */
export const isInProgressMatchExpired = (
  matchStartsAt: Date,
  now: Date = new Date(),
): boolean =>
  now.getTime() - matchStartsAt.getTime() >= IN_PROGRESS_MATCH_TIMEOUT_MS;

/** 세션 참여자. 추천 화면이 평점·성별을 쓰므로 함께 내려준다 */
export interface MatchSessionMember extends MatchSessionParticipant {
  gender: "M" | "F";
  duprRating: PublicPlayerDupr | null;
}

/** 세션 단건 응답(GET /api/match-sessions/:sessionId 등) */
export interface MatchSessionDetail {
  id: string;
  name: string;
  kind: MatchSessionKind;
  /** 세션 시각. 정기 세션은 그날 18:00 KST, 회원 세션은 만든 시각 */
  date: Date;
  location: string;
  /** date의 KST 날짜 키 */
  dateKey: string;
  /** 오늘(KST) 세션이면 true. 체크인·취소·세션 경기 기록/시작·추천은 오늘 세션에서만 된다 */
  isToday: boolean;
  /** active 회원만 */
  participants: MatchSessionMember[];
  matchCount: number;
}

/** GET /api/match-sessions/today 응답 */
export interface TodayMatchSessionsResponse {
  /** 오늘 KST 날짜 키 */
  dateKey: string;
  /** canOpenRegularSession(now). 정기 세션이 아직 생성 전이어도 카드를 보여 줄 수 있다 */
  regularSessionOpen: boolean;
  /** 오늘 날짜의 생성된 세션. 정기 세션이 있으면 맨 앞 */
  sessions: MatchSessionDetail[];
}

/** POST /api/match-sessions 요청. 날짜는 오늘(서버 now)로 정해진다 */
export interface CreateMatchSessionRequest {
  name: string;
  location: string;
}

/** POST /api/match-sessions/:sessionId/participants 요청 */
export interface AddMatchSessionParticipantRequest {
  playerId: string;
}

/** POST /api/match-sessions/:sessionId/matches 요청. 점수 없는 진행 중 경기를 시작한다 */
export interface StartSessionMatchRequest {
  teams: [RecordMatchTeamRequest, RecordMatchTeamRequest];
  /** 생략하면 팀 구성으로 추론 */
  type?: MatchType;
  /** 생략하면 세션 장소 */
  location?: string;
  /** 예: "코트 1" */
  courtName?: string;
}
