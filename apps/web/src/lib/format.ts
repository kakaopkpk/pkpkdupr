const KST_TIME_ZONE = "Asia/Seoul";

const toDate = (date: Date | string) =>
  typeof date === "string" ? new Date(date) : date;

const kstPartsFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST_TIME_ZONE,
  month: "numeric",
  day: "numeric",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const getKstParts = (date: Date | string) => {
  const parts = kstPartsFormatter.formatToParts(toDate(date));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
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

/** "11월 13일 목요일" */
export const formatKstLongDate = (date: Date | string) => {
  const { month, day, weekday } = getKstParts(date);
  return `${month}월 ${day}일 ${weekday}`;
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
    (now.getTime() - toDate(startsAt).getTime()) / 60_000,
  );
  return elapsedMinutes <= 0 ? "방금 시작" : `${elapsedMinutes}분째`;
};
