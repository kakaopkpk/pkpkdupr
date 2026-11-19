import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import {
  getKstWeekday,
  REGULAR_SESSION_WEEKDAYS,
  type RegularSessionSkipReason,
} from "@pkpkdupr/shared/session";

/** 달력 칸에 보이는 쉬는 날 이름 */
export const SKIP_LABELS: Record<RegularSessionSkipReason, string> = {
  canceled: "정기 쉬는 날",
  holiday: "공휴일",
};

/**
 * 오늘·미래 날짜의 정기 쉬는 날 동작(우클릭 메뉴의 두 번째 항목).
 * - skipAutoRegular: 자동 정기 세션을 지우고 정기 쉬는 날로 지정(확인 대화상자를 거친다)
 * - revert: 정기 쉬는 날 해제(그 자리에서 자동 정기 세션을 다시 만든다)
 * - skipEmpty: 세션 없는 월·목을 정기 쉬는 날로 지정
 * 공휴일이나 직접 만든 정기 세션만 있는 날 등 그 밖의 날은 null이다.
 */
export type RegularSkipDayAction =
  | { kind: "skipAutoRegular"; session: ManagedMatchSession }
  | { kind: "revert" }
  | { kind: "skipEmpty" };

export const getRegularSkipDayAction = ({
  dateKey,
  todayKey,
  daySessions,
  skipReason,
}: {
  dateKey: string;
  todayKey: string;
  daySessions: ManagedMatchSession[];
  skipReason: RegularSessionSkipReason | undefined;
}): RegularSkipDayAction | null => {
  if (dateKey < todayKey) return null;
  const autoRegular = daySessions.find(
    (session) => session.kind === "regular" && session.autoCreated,
  );
  if (autoRegular) return { kind: "skipAutoRegular", session: autoRegular };
  if (skipReason === "canceled") return { kind: "revert" };
  if (
    !skipReason &&
    daySessions.length === 0 &&
    REGULAR_SESSION_WEEKDAYS.includes(getKstWeekday(dateKey))
  ) {
    return { kind: "skipEmpty" };
  }
  return null;
};
