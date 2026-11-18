import type { RecordItem } from "./ranking.js";
import type { MatchSessionDetail } from "./session.js";

/** "YYYY-MM" 월 키(KST) */
export const SCHEDULE_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** 일정 탭 세션: 세션 단건 응답 + 끝났는지 */
export interface ScheduleSession extends MatchSessionDetail {
  /** 세션 만료 시각(getEmptySessionExpiresAt)이 지났으면 true. 끝난 세션은 참여자를 바꿀 수 없다 */
  isEnded: boolean;
}

/** GET /api/schedule?month=YYYY-MM 응답 */
export interface ScheduleMonthResponse {
  /** 요청한 월 키 */
  month: string;
  /** 오늘 KST 날짜 키 */
  dateKey: string;
  /**
   * 세션 날짜 키가 그 달인 세션. 끝났는데 경기가 없는 세션(정리 대기)은 뺀다.
   * 날짜 키 오름차순, 같은 날은 정기 세션 먼저
   */
  sessions: ScheduleSession[];
  /**
   * 그 달의 기록 줄(GET /api/records 항목과 같은 형태, 요청자 기준 mine).
   * 세션 date·경기 matchStartsAt 내림차순, 같으면 id 내림차순
   */
  records: RecordItem[];
}

/** "2026-11" → { year: 2026, month: 11 }. 형식이 틀리면 null */
export const parseScheduleMonth = (
  value: string,
): { year: number; month: number } | null => {
  const matched = SCHEDULE_MONTH_PATTERN.exec(value);
  return matched ? { year: Number(matched[1]), month: Number(matched[2]) } : null;
};

/** 연·월 → "YYYY-MM" */
export const formatScheduleMonth = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, "0")}`;

/** 월 키를 months만큼 옮긴다. "2026-12" + 1 → "2027-01" */
export const addScheduleMonths = (monthKey: string, months: number): string => {
  const parsed = parseScheduleMonth(monthKey);
  if (!parsed) throw new Error(`올바르지 않은 월 키: ${monthKey}`);
  const index = parsed.year * 12 + (parsed.month - 1) + months;
  return formatScheduleMonth(Math.floor(index / 12), (index % 12) + 1);
};

/** 그 달 첫날과 다음 달 첫날의 날짜 키. 기간은 [from, to)다 */
export const getScheduleMonthDateKeyRange = (
  monthKey: string,
): { fromDateKey: string; toDateKey: string } => ({
  fromDateKey: `${monthKey}-01`,
  toDateKey: `${addScheduleMonths(monthKey, 1)}-01`,
});
