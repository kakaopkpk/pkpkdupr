import { formatSessionTimeRange } from "@pkpkdupr/shared/session";
import { formatKstShortDate } from "@/lib/format";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

const DAY_MS = 24 * 60 * 60_000;

type SessionTimeSource = Pick<
  MatchSessionDetailInfo,
  "date" | "dateKey" | "startTime" | "endTime"
>;

/** "2026-11-17" → UTC 자정 시각(날짜 차 계산용) */
const dateKeyToUtc = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const getDayDiff = (dateKey: string, todayKey: string) =>
  Math.round((dateKeyToUtc(dateKey) - dateKeyToUtc(todayKey)) / DAY_MS);

/**
 * 세션 블루 카드 칩 옆의 남은 날. 미래 세션은 "D-1"·"D-2", 오늘 세션은 시작 전후 모두 "D-Day".
 * 오늘 여부는 서버 isToday가 아니라 클라이언트의 오늘 날짜 키로 판단한다(앱을 켜 둔 채 자정을 넘겨도 갱신).
 * 다가오는 세션은 만료 전 세션뿐이라 날짜가 오늘 이전이면 자정을 넘겨 진행 중인 오늘 세션이다.
 */
export const getSessionDDayLabel = (
  session: Pick<MatchSessionDetailInfo, "dateKey">,
  todayKey: string,
) => {
  const days = getDayDiff(session.dateKey, todayKey);
  return days > 0 ? `D-${days}` : "D-Day";
};

/** 비어 있지 않은 메타 조각을 " · "로 잇는다 */
const joinMetaParts = (parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");

type SessionMetaSource = SessionTimeSource &
  Pick<MatchSessionDetailInfo, "location">;

/**
 * 시각 → 장소 메타. "18:00~22:00 · 야탑초등학교", 시각 없으면 장소만.
 * 홈 진행 중 세션 머리와 오늘 세션의 다음 세션 카드가 쓴다
 */
export const formatSessionTimePlace = (
  session: Pick<SessionMetaSource, "startTime" | "endTime" | "location">,
) => joinMetaParts([formatSessionTimeRange(session), session.location]);

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
  return joinMetaParts([
    timeRange ? `${date} ${timeRange}` : date,
    session.location,
  ]);
};
