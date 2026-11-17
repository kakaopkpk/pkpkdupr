import {
  formatSessionTimeRange,
  kstDateKeyTimeToDate,
} from "@pkpkdupr/shared/session";
import { formatKstShortDate } from "@/lib/format";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

type SessionTimeSource = Pick<
  MatchSessionDetailInfo,
  "kind" | "date" | "dateKey" | "isToday" | "startTime" | "endTime"
>;


/** "2026-11-17" → UTC 자정 시각(날짜 차 계산용) */
const dateKeyToUtc = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const getDayDiff = (dateKey: string, todayKey: string) =>
  Math.round((dateKeyToUtc(dateKey) - dateKeyToUtc(todayKey)) / DAY_MS);

const formatDaysLater = (days: number) => (days === 1 ? "내일" : `${days}일 뒤`);

/** 시작까지 남은 시간. 1시간 미만은 분, 그 이상은 시간 단위다. 이미 지났으면 null */
const formatTimeUntil = (startsAt: Date, now: Date) => {
  const minutes = Math.ceil((startsAt.getTime() - now.getTime()) / MINUTE_MS);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes}분 뒤`;
  return `${Math.floor(minutes / 60)}시간 뒤`;
};

/** 다음 세션 카드의 칩. 오늘 정기 세션은 "정기", 오늘 회원 세션은 "오늘", 미래는 "다음 세션" */
export const getSessionChipLabel = (session: SessionTimeSource) => {
  if (!session.isToday) return "다음 세션";
  return session.kind === "regular" ? "정기" : "오늘";
};

type SessionMetaSource = SessionTimeSource &
  Pick<MatchSessionDetailInfo, "location">;

/**
 * 시각 → 장소 메타. "18:00~22:00 · 야탑초등학교", 시각 없으면 장소만.
 * 홈 진행 중 세션 머리와 오늘 세션의 다음 세션 카드가 쓴다
 */
export const formatSessionTimePlace = (
  session: Pick<SessionMetaSource, "startTime" | "endTime" | "location">,
) =>
  [formatSessionTimeRange(session), session.location]
    .filter(Boolean)
    .join(" · ");

/**
 * 다음 세션 카드 칩 옆의 남은 시간.
 * - 미래: "내일" | "4일 뒤"
 * - 오늘 시작 전: "40분 뒤" | "2시간 뒤"
 * - 오늘 시작 후·시각 없는 오늘 세션: null(칩만 보인다)
 */
export const getSessionTimeUntilLabel = (
  session: SessionTimeSource,
  todayKey: string,
  now: Date,
) => {
  const days = getDayDiff(session.dateKey, todayKey);
  if (days > 0) return formatDaysLater(days);
  if (!session.startTime) return null;
  const startsAt = kstDateKeyTimeToDate(session.dateKey, session.startTime);
  return formatTimeUntil(startsAt, now);
};

/**
 * 다음 세션 카드 이름 아래 메타 줄. 세션 상세 머리와 같은 "날짜 시각 · 장소" 형식이다.
 * - 미래: "11월 17일 월 18:00~22:00 · 야탑초등학교", 시각 없으면 "11월 17일 월 · 야탑초등학교"
 * - 오늘: 날짜를 빼 "18:00~22:00 · 야탑초등학교", 시각 없으면 장소만
 */
export const getSessionMetaLabel = (
  session: SessionMetaSource,
  todayKey: string,
) => {
  if (getDayDiff(session.dateKey, todayKey) <= 0) {
    return formatSessionTimePlace(session);
  }
  const timeRange = formatSessionTimeRange(session);
  const date = formatKstShortDate(new Date(session.date));
  return [timeRange ? `${date} ${timeRange}` : date, session.location]
    .filter(Boolean)
    .join(" · ");
};
