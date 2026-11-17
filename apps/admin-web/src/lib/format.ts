// 모든 날짜·시각 표시는 KST(UTC+9, 서머타임 없음) 기준이다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const toDate = (date: Date | string) =>
  typeof date === "string" ? new Date(date) : date;

/** KST 벽시계 값을 UTC 필드로 읽을 수 있게 옮긴 Date */
const toKstWallClock = (date: Date | string) =>
  new Date(toDate(date).getTime() + KST_OFFSET_MS);

const pad2 = (value: number) => String(value).padStart(2, "0");

const kstDayKey = (date: Date | string) => {
  const kst = toKstWallClock(date);
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
};

/** 소수 셋째 자리. 평점이 없으면 "–" */
export const formatRating = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "–"
    : value.toFixed(3);

/** "+0.084", "−0.047"(U+2212), 0이면 "0.000", 유한한 수가 아니면 "–" */
export const formatRatingDelta = (value: number): string => {
  if (!Number.isFinite(value)) return "–";
  const rounded = Number(value.toFixed(3));
  if (rounded === 0) return "0.000";
  const magnitude = Math.abs(rounded).toFixed(3);
  return rounded > 0 ? `+${magnitude}` : `−${magnitude}`;
};

/** "11/16" */
export const formatKstMonthDay = (date: Date | string): string => {
  const kst = toKstWallClock(date);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
};

/** "11월 16일 월요일" */
export const formatKstDateWithWeekday = (date: Date | string): string => {
  const kst = toKstWallClock(date);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${WEEKDAY_LABELS[kst.getUTCDay()]}요일`;
};

/** "21:42" */
export const formatKstTime = (date: Date | string): string => {
  const kst = toKstWallClock(date);
  return `${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
};

/** "11/16 21:42" */
export const formatKstDateTime = (date: Date | string): string =>
  `${formatKstMonthDay(date)} ${formatKstTime(date)}`;

/** KST 날짜 기준 "오늘" | "어제" | "11/12" */
export const formatRelativeDay = (
  date: Date | string,
  now: Date = new Date(),
): string => {
  const dayDiff = Math.round((kstDayKey(now) - kstDayKey(date)) / DAY_MS);
  if (dayDiff === 0) return "오늘";
  if (dayDiff === 1) return "어제";
  return formatKstMonthDay(date);
};
