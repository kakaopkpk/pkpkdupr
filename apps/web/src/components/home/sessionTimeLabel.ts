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

/**
 * 다음 세션 카드의 시각 줄.
 * - 오늘: "18:00~22:00 · 40분 뒤"(시작 전) | "18:00~22:00"
 * - 미래: "11월 17일 월 18:00~22:00 · 3일 뒤"
 * - 시각 없는 회원 세션: "11월 17일 월 · 내일", 오늘이면 "· 오늘"
 */
export const getSessionTimeLabel = (
  session: SessionTimeSource,
  todayKey: string,
  now: Date,
) => {
  const days = getDayDiff(session.dateKey, todayKey);
  const date = formatKstShortDate(new Date(session.date));
  const timeRange = formatSessionTimeRange(session);

  if (timeRange && session.startTime) {
    // timeRange가 있으면 시작 시각도 있다(TS 좁히기용 조건)
    if (days <= 0) {
      const startsAt = kstDateKeyTimeToDate(session.dateKey, session.startTime);
      const until = formatTimeUntil(startsAt, now);
      return until ? `${timeRange} · ${until}` : timeRange;
    }
    return `${date} ${timeRange} · ${formatDaysLater(days)}`;
  }

  return days <= 0 ? `${date} · 오늘` : `${date} · ${formatDaysLater(days)}`;
};
