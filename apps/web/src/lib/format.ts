import type { MatchTopLevelType } from "@pkpkdupr/shared/match";

const KST_TIME_ZONE = "Asia/Seoul";

export const MINUTE_MS = 60_000;

const toDate = (date: Date | string) =>
  typeof date === "string" ? new Date(date) : date;

const kstPartsFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const kstNumericDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** "2026. 11. 17." 항상 연도까지 쓰는 숫자 날짜(ko-KR 숫자 날짜 형식 그대로) */
export const formatKstNumericDate = (date: Date | string) =>
  kstNumericDateFormatter.format(toDate(date));

const getKstParts = (date: Date | string) => {
  const parts = kstPartsFormatter.formatToParts(toDate(date));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
    hour: get("hour").padStart(2, "0"),
    minute: get("minute").padStart(2, "0"),
  };
};

/** 평점 변화량: "+0.019" | "−0.013"(U+2212) | "0.000" */
export const formatRatingDelta = (delta: number) => {
  const rounded = Math.round(delta * 1000) / 1000;
  const absolute = Math.abs(rounded).toFixed(3);
  if (rounded > 0) return `+${absolute}`;
  if (rounded < 0) return `−${absolute}`;
  return "0.000";
};

/** "2026년 11월 13일" 연도까지 쓰고 요일은 없는 날짜 */
export const formatKstFullDate = (date: Date | string) => {
  const { year, month, day } = getKstParts(date);
  return `${year}년 ${month}월 ${day}일`;
};

/** "2026년 11월 13일 목" 연도와 요일 한 글자까지 쓰는 날짜 */
export const formatKstFullDateWithWeekday = (date: Date | string) => {
  const { weekday } = getKstParts(date);
  return `${formatKstFullDate(date)} ${weekday.charAt(0)}`;
};

/** "11월 13일 목요일" */
export const formatKstLongDate = (date: Date | string) => {
  const { month, day, weekday } = getKstParts(date);
  return `${month}월 ${day}일 ${weekday}`;
};

/** "11월 17일" 연도·요일 없는 날짜 */
export const formatKstMonthDay = (date: Date | string) => {
  const { month, day } = getKstParts(date);
  return `${month}월 ${day}일`;
};

/** "11월 13일 목" */
export const formatKstShortDate = (date: Date | string) => {
  const { month, day, weekday } = getKstParts(date);
  return `${month}월 ${day}일 ${weekday.charAt(0)}`;
};

/** "20:01" */
export const formatKstTime = (date: Date | string) => {
  const { hour, minute } = getKstParts(date);
  return `${hour}:${minute}`;
};

/** "목 20:01" */
export const formatKstWeekdayTime = (date: Date | string) => {
  const { weekday } = getKstParts(date);
  return `${weekday.charAt(0)} ${formatKstTime(date)}`;
};

/** "11월 13일 목 20:01" */
export const formatKstDateTime = (date: Date | string) =>
  `${formatKstShortDate(date)} ${formatKstTime(date)}`;

/** 진행 중 경기 경과 시간. 0분(시작 전 포함)이면 "방금 시작", 그 뒤로 "N분째" */
export const formatElapsed = (startsAt: Date | string, now: Date) => {
  const elapsedMinutes = Math.floor(
    (now.getTime() - toDate(startsAt).getTime()) / MINUTE_MS,
  );
  return elapsedMinutes <= 0 ? "방금 시작" : `${elapsedMinutes}분째`;
};

/** 업적 점수(천 단위 쉼표) */
export const formatAchievementPoints = (value: number) =>
  Math.round(value).toLocaleString("ko-KR");

/** 업적 하나의 점수 문구. 0점이면 "점수 없음" */
export const formatAchievementPointsLabel = (points: number) =>
  points > 0 ? `${points}점` : "점수 없음";

/** 종목 이름("복식"/"단식") */
export const MATCH_CATEGORY_LABELS = {
  doubles: "복식",
  singles: "단식",
} as const satisfies Record<MatchTopLevelType, string>;
