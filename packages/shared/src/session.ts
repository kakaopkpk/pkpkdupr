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

/** KST 요일 한 글자. 0=일요일 */
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 정기 세션 이름. 날짜 키의 KST 요일로 "월요 정기운동" | "목요 정기운동" */
export const getRegularSessionName = (dateKey: string): string =>
  `${WEEKDAY_LABELS[toKstShifted(kstDateKeyToDate(dateKey)).getUTCDay()]}요 정기운동`;

/** 정기 세션을 미리 만드는 기간(일). 오늘(KST)을 포함해 이 일수 안의 정기 회차를 만든다 */
export const REGULAR_SESSION_LOOKAHEAD_DAYS = 28;

/** 정기 회차를 만들지 않는 날짜의 사유. holiday=공휴일, canceled=관리자가 지운 회차 */
export type RegularSessionSkipReason = "holiday" | "canceled";

/**
 * 오늘(KST)부터 days일 안의 정기 회차 날짜 키(오름차순).
 * 오늘은 정기 요일 22:00 KST 전일 때만 넣는다
 */
export const getRegularSessionDateKeys = (now: Date, days: number): string[] => {
  const todayKey = toKstDateKey(now);
  const dateKeys: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = addKstDays(todayKey, offset);
    const weekday = toKstShifted(kstDateKeyToDate(dateKey)).getUTCDay();
    if (!REGULAR_SESSION_WEEKDAYS.includes(weekday)) continue;
    if (offset === 0 && !canOpenRegularSession(now)) continue;
    dateKeys.push(dateKey);
  }
  return dateKeys;
};

/** 다음 정기 회차의 KST 날짜 키. 오늘이 정기 요일이고 22:00 KST 전이면 오늘 */
export const getNextRegularSessionDateKey = (now: Date): string => {
  // 오늘을 빼도 7일 뒤 같은 요일까지 보면 다음 회차가 반드시 들어온다
  const [next] = getRegularSessionDateKeys(now, 8);
  if (!next) {
    throw new Error("정기 세션 요일이 없습니다.");
  }
  return next;
};

/** POST /api/cron/regular-sessions 응답 */
export interface RegularSessionsCronResponse {
  /** 대상 기간의 KST 날짜 키. from 포함, to 미포함 */
  fromDateKey: string;
  toDateKey: string;
  /** 새로 만든 정기 회차 날짜 */
  created: string[];
  /** 공휴일·취소라 만들지 않은 정기 회차 날짜 */
  skipped: Array<{ dateKey: string; reason: RegularSessionSkipReason }>;
  /** 공휴일로 확인돼 지운 빈 정기 세션 날짜 */
  deleted: string[];
}

/** "HH:MM"(00:00~23:59) 형식이면 true. 같은 형식끼리는 문자열 비교가 시각 순서와 같다 */
export const isValidSessionTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** "18:00" → 1080(0시부터 분) */
export const sessionTimeToMinutes = (time: string): number => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/** 1080 → "18:00" */
export const minutesToSessionTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** 정기 세션 시각("HH:MM", KST). 18:00~22:00 */
export const REGULAR_SESSION_START_TIME = minutesToSessionTime(
  REGULAR_SESSION_START_HOUR * 60,
);
export const REGULAR_SESSION_END_TIME = minutesToSessionTime(
  REGULAR_SESSION_END_HOUR * 60,
);

/** 세션 시각 범위. 종료가 시작보다 이르거나 같으면 다음 날 그 시각에 끝난다 */
export interface SessionTimeRange {
  startTime: string | null;
  endTime: string | null;
}

/** 둘 다 "HH:MM"이고 시각이 서로 다르면 true. 종료가 시작보다 이르면 다음 날 종료다 */
export const isValidSessionTimeRange = (
  startTime: unknown,
  endTime: unknown,
): boolean =>
  isValidSessionTime(startTime) &&
  isValidSessionTime(endTime) &&
  endTime !== startTime;

/** 종료 시각이 자정을 넘겨 다음 날이면 true */
export const isOvernightSessionTimeRange = ({
  startTime,
  endTime,
}: SessionTimeRange): boolean =>
  !!startTime && !!endTime && endTime <= startTime;

/** 종료 시각. 자정을 넘기면 "다음 날 01:30" */
export const formatSessionEndTime = (
  range: SessionTimeRange & { endTime: string },
): string =>
  isOvernightSessionTimeRange(range)
    ? `다음 날 ${range.endTime}`
    : range.endTime;

/** "18:00~22:00" | "23:30~다음 날 01:30". 시각 없는 세션이면 null */
export const formatSessionTimeRange = (
  range: SessionTimeRange,
): string | null => {
  const { startTime, endTime } = range;
  if (!startTime || !endTime) return null;
  return `${startTime}~${formatSessionEndTime({ startTime, endTime })}`;
};

/** KST 날짜 키의 "HH:MM"(KST) 시각 */
export const kstDateKeyTimeToDate = (dateKey: string, time: string): Date =>
  new Date(
    kstDateKeyToDate(dateKey).getTime() + sessionTimeToMinutes(time) * 60_000,
  );

/** KST 날짜 키에서 days일 뒤(음수면 앞)의 날짜 키 */
export const addKstDays = (dateKey: string, days: number): string =>
  toKstDateKey(new Date(kstDateKeyToDate(dateKey).getTime() + days * DAY_MS));

/** 오늘(KST) 세션이면 지금보다 이른 시작 시각은 지난 시각이다 */
export const isPastSessionStart = (
  dateKey: string,
  startTime: string,
  now: Date,
): boolean =>
  dateKey === toKstDateKey(now) &&
  kstDateKeyTimeToDate(dateKey, startTime).getTime() < now.getTime();

/** YYYY-MM-DD 형식이고 실제 있는 날짜면 true */
export const isValidKstDateKey = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  toKstDateKey(kstDateKeyToDate(value)) === value;

/**
 * 경기가 하나도 없는 세션이 사라지는 시각. 정기=그날 22:00 KST, 그 외=다음 날 00:00 KST.
 * 회원 세션이 자정을 넘겨 끝나면 다음 날 종료 시각까지 남긴다
 */
export const getEmptySessionExpiresAt = (
  kind: MatchSessionKind,
  sessionDate: Date,
  timeRange?: SessionTimeRange | null,
): Date => {
  const dayStart = kstDateKeyToDate(toKstDateKey(sessionDate));
  if (kind === "regular") {
    return new Date(dayStart.getTime() + REGULAR_SESSION_END_HOUR * HOUR_MS);
  }
  const nextDayStart = dayStart.getTime() + DAY_MS;
  return timeRange?.endTime && isOvernightSessionTimeRange(timeRange)
    ? new Date(nextDayStart + sessionTimeToMinutes(timeRange.endTime) * 60_000)
    : new Date(nextDayStart);
};

/**
 * 지금 그 세션이 '오늘 세션'이면 true. 그날(KST) 세션이거나, 전날 시작해 자정을 넘긴 회원 세션이
 * 아직 끝나지 않았을 때다. 세션 경기 기록·시작·추천과 오늘 세션 목록이 이 기준을 쓴다
 */
export const isSessionOnToday = (
  session: { kind: MatchSessionKind; date: Date } & SessionTimeRange,
  now: Date,
): boolean => {
  const dateKey = toKstDateKey(session.date);
  const todayKey = toKstDateKey(now);
  // 지난 날 세션은 만료 시각이 다음 날로 넘어가는 자정 넘김 회원 세션만 아직 남아 있을 수 있다
  return (
    dateKey === todayKey ||
    (dateKey < todayKey &&
      now.getTime() <
        getEmptySessionExpiresAt(session.kind, session.date, session).getTime())
  );
};

/**
 * 빈 세션 만료 판정을 세션 시각 비교 하나로 바꾼 기준 시각.
 * 세션 시각이 이 값보다 이르면(미만) `getEmptySessionExpiresAt(kind, 세션 시각) <= now`와 같다.
 * 자정을 넘기는 회원 세션은 종료 시각에 따라 만료가 달라 이 기준을 쓰지 않는다(저장소가 따로 판정한다).
 * 만료 시각은 세션 날짜의 KST 0시에 고정 길이를 더한 값이므로, now에서 그 길이를 뺀 날의 다음 날 KST 0시가 경계가 된다.
 */
export const getEmptySessionExpiryCutoff = (
  kind: MatchSessionKind,
  now: Date,
): Date => {
  const lifetimeMs =
    kind === "regular" ? REGULAR_SESSION_END_HOUR * HOUR_MS : DAY_MS;
  const latestExpiredDayStart = kstDateKeyToDate(
    toKstDateKey(new Date(now.getTime() - lifetimeMs)),
  );
  return new Date(latestExpiredDayStart.getTime() + DAY_MS);
};

/** 점수 없는 진행 중 경기가 시작 2시간을 넘겨 무효(삭제 대상)면 true */
export const isInProgressMatchExpired = (
  matchStartsAt: Date,
  now: Date = new Date(),
): boolean =>
  now.getTime() - matchStartsAt.getTime() >= IN_PROGRESS_MATCH_TIMEOUT_MS;

/** 세션 참여자. 추천 화면이 평점·성별을 쓰므로 함께 내려준다 */
export interface MatchSessionMember extends MatchSessionParticipant {
  /** 게스트만 null */
  gender: "M" | "F" | null;
  duprRating: PublicPlayerDupr | null;
  isGuest: boolean;
}

/** 세션 단건 응답(GET /api/match-sessions/:sessionId 등) */
export interface MatchSessionDetail {
  id: string;
  name: string;
  kind: MatchSessionKind;
  /** 세션 시각. 정기 세션은 그날 18:00 KST, 회원 세션은 고른 날 00:00 KST */
  date: Date;
  location: string;
  /** date의 KST 날짜 키 */
  dateKey: string;
  /** 시작·종료 시각("HH:MM", KST). 정기 세션은 18:00~22:00, 시각 없이 만든 회원 세션은 null. 종료 ≤ 시작이면 다음 날 종료 */
  startTime: string | null;
  endTime: string | null;
  /**
   * 오늘(KST) 세션이면 true(`isSessionOnToday`, 전날 시작해 자정을 넘긴 회원 세션은 끝나기 전까지 포함).
   * 세션 경기 기록/시작·추천은 오늘 세션에서만 되고, 참여자 추가·삭제는 오늘·미래 세션에서 된다
   */
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
  /** 오늘 날짜의 생성된 세션과, 전날 시작해 아직 끝나지 않은 자정 넘김 회원 세션. 정기 세션이 있으면 맨 앞 */
  sessions: MatchSessionDetail[];
}

/** POST /api/match-sessions 요청 */
export interface CreateMatchSessionRequest {
  name: string;
  location: string;
  /** 세션 날짜(KST, YYYY-MM-DD). 생략하면 오늘. 오늘보다 이르면 400 */
  dateKey?: string;
  /**
   * 시작·종료 시각("HH:MM", KST). 둘 다 주거나 둘 다 생략한다. 둘이 같으면 400이고,
   * 종료가 시작보다 이르면 다음 날 종료다. 오늘 세션은 시작 시각이 지금보다 이르면 400
   */
  startTime?: string;
  endTime?: string;
}

/** GET /api/match-sessions/upcoming 응답 */
export interface UpcomingMatchSessionsResponse {
  /** 오늘 KST 날짜 키 */
  dateKey: string;
  /** 만료 전인 오늘·미래 세션. 날짜 키 오름차순, 같은 날은 정기 세션 먼저 */
  sessions: MatchSessionDetail[];
}

/** POST /api/match-sessions/:sessionId/participants 요청 */
export interface AddMatchSessionParticipantRequest {
  playerId: string;
}

/** POST /api/match-sessions/:sessionId/guests 요청. 그 아이디로 게스트를 만들고 세션 참여자로 넣는다 */
export interface AddMatchSessionGuestRequest {
  username: string;
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
