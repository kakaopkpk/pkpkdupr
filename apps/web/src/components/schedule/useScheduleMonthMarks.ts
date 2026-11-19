import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchScheduleMonth,
  mergeScheduleDayMarks,
  type ScheduleDayMark,
  type ScheduleMonthInfo,
} from "@/lib/schedule";
import { getCalendarMonthKeys } from "./monthGrid";

/**
 * 달력에 그리는 달들의 표시. 일정 탭 밖(세션 만들기)에서 쓰며, 한 달은 마운트 동안 한 번만 받는다.
 * 받지 못한 달은 표시 없이 둔다
 */
export const useScheduleMonthMarks = (
  monthKey: string,
  playerId: string | undefined,
): ReadonlyMap<string, ScheduleDayMark> => {
  const [months, setMonths] = useState<Record<string, ScheduleMonthInfo>>({});
  const requestedRef = useRef(new Set<string>());

  useEffect(() => {
    for (const month of getCalendarMonthKeys(monthKey)) {
      if (requestedRef.current.has(month)) continue;
      requestedRef.current.add(month);
      fetchScheduleMonth(month).then(
        (data) => setMonths((current) => ({ ...current, [month]: data })),
        // 표시는 보조 정보라 실패해도 날짜는 고를 수 있다. 다음 마운트에서 다시 받는다
        () => undefined,
      );
    }
  }, [monthKey]);

  return useMemo(
    () => mergeScheduleDayMarks(Object.values(months), playerId),
    [months, playerId],
  );
};
