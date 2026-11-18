import {
  addKstDays,
  getKstWeekday,
  toKstDateKey,
  WEEKDAY_LABELS,
} from "@pkpkdupr/shared/session";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";

// 날짜 키(YYYY-MM-DD)는 이미 KST 날짜라 문자열 비교가 날짜 순서와 같다.

/** "YYYY-MM" */
export const toMonthKey = (dateKey: string): string => dateKey.slice(0, 7);

export const getTodayKey = (): string => toKstDateKey(new Date());

/** "2026-11" → "2026년 11월" */
export const formatMonthTitle = (monthKey: string): string => {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
};

/** 달을 delta만큼 옮긴다 */
export const shiftMonth = (monthKey: string, delta: number): string => {
  const [year, month] = monthKey.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

/**
 * 달력 칸. 1일이 든 주 일요일부터 말일이 든 주 토요일까지 7의 배수 칸이고,
 * 다른 달 날은 null이다.
 */
export const getMonthGrid = (monthKey: string): Array<string | null> => {
  const firstDateKey = `${monthKey}-01`;
  const leading = getKstWeekday(firstDateKey);
  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  for (
    let dateKey = firstDateKey;
    toMonthKey(dateKey) === monthKey;
    dateKey = addKstDays(dateKey, 1)
  ) {
    cells.push(dateKey);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export const getWeekdayLabel = (dateKey: string): string =>
  WEEKDAY_LABELS[getKstWeekday(dateKey)];

/** "12/3 목" */
export const formatShortDateWithWeekday = (dateKey: string): string => {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}/${day} ${getWeekdayLabel(dateKey)}`;
};

/** "2026-11-21 (토)" 의 요일 부분 "(토)" */
export const formatWeekdaySuffix = (dateKey: string): string =>
  `(${getWeekdayLabel(dateKey)})`;

export const getSessionDateKey = (session: Pick<ManagedMatchSession, "date">) =>
  toKstDateKey(new Date(session.date));

/** 세션 날짜가 오늘(KST)보다 이전이면 지난 세션 */
export const isPastSession = (
  session: Pick<ManagedMatchSession, "date">,
  todayKey: string,
): boolean => getSessionDateKey(session) < todayKey;

/** 시각 없는 세션을 같은 날 맨 뒤로 보내는 정렬 키. "HH:MM"보다 항상 크다 */
const NO_START_TIME_SORT_KEY = "99:99";

/** 같은 날 안에서는 정기 세션 먼저, 그다음 시작 시각(시각 없으면 뒤) → 이름 순 */
export const compareSessionsInDay = (
  a: ManagedMatchSession,
  b: ManagedMatchSession,
): number => {
  const regularOrder = Number(b.kind === "regular") - Number(a.kind === "regular");
  if (regularOrder !== 0) return regularOrder;
  const aTime = a.startTime ?? NO_START_TIME_SORT_KEY;
  const bTime = b.startTime ?? NO_START_TIME_SORT_KEY;
  if (aTime !== bTime) return aTime < bTime ? -1 : 1;
  return a.name.localeCompare(b.name);
};
