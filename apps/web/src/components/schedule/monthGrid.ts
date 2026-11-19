import {
  addScheduleMonths,
  getScheduleMonthDateKeyRange,
  parseScheduleMonth,
} from "@pkpkdupr/shared/schedule";
import { addKstDays, getKstWeekday } from "@pkpkdupr/shared/session";

const DAYS_PER_WEEK = 7;
/** 달마다 높이가 같도록 달력은 항상 6주를 그린다 */
const MONTH_GRID_WEEKS = 6;

/** "2026년 11월" */
export const formatMonthTitle = (monthKey: string) => {
  const parsed = parseScheduleMonth(monthKey);
  return parsed ? `${parsed.year}년 ${parsed.month}월` : monthKey;
};

/** "2026-11-17" → "2026-11" */
export const toMonthKey = (dateKey: string) => dateKey.slice(0, 7);

/** 달력이 그리는 날짜의 달. 앞뒤 달 판의 6주가 ±2달 날짜까지 걸친다 */
export const getCalendarMonthKeys = (monthKey: string): string[] =>
  [-2, -1, 0, 1, 2].map((offset) => addScheduleMonths(monthKey, offset));

/** 그 달 1일이 든 주 일요일부터 6주(42칸)의 날짜 키 */
export const getMonthGridDateKeys = (monthKey: string): string[] => {
  const firstKey = getScheduleMonthDateKeyRange(monthKey).fromDateKey;
  const startKey = addKstDays(firstKey, -getKstWeekday(firstKey));
  return Array.from({ length: MONTH_GRID_WEEKS * DAYS_PER_WEEK }, (_, index) =>
    addKstDays(startKey, index),
  );
};
