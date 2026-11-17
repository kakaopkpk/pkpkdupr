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
  "kind" | "date" | "dateKey" | "startTime" | "endTime"
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

/**
 * 다음 세션 카드의 칩. 오늘 정기 세션은 "정기", 오늘 회원 세션은 "오늘", 미래는 "다음 세션".
 * 오늘 여부는 서버 isToday가 아니라 클라이언트의 오늘 날짜 키로 판단한다(앱을 켜 둔 채 자정을 넘겨도 갱신).
 * 다가오는 세션은 만료 전 세션뿐이라 날짜가 오늘 이전이면 자정을 넘겨 진행 중인 오늘 세션이다.
 */
export const getSessionChipLabel = (
  session: SessionTimeSource,
  todayKey: string,
) => {
  if (getDayDiff(session.dateKey, todayKey) > 0) return "다음 세션";
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
