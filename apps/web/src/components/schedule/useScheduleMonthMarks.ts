import { useEffect, useMemo, useState } from "react";
import { addScheduleMonths } from "@pkpkdupr/shared/schedule";
import {
  buildScheduleDayMarks,
  fetchScheduleMonth,
  type ScheduleDayMark,
  type ScheduleMonthInfo,
} from "@/lib/schedule";

/**
 * 보는 달과 앞뒤 달의 달력 표시. 일정 탭 밖(세션 만들기)에서 쓰며, 한 달은 마운트 동안 한 번만 받는다.
 * 받지 못한 달은 표시 없이 둔다
 */
export const useScheduleMonthMarks = (
  monthKey: string,
  playerId: string | undefined,
): ReadonlyMap<string, ScheduleDayMark> => {
  const [months, setMonths] = useState<Record<string, ScheduleMonthInfo>>({});
  const [requested] = useState(() => new Set<string>());

  useEffect(() => {
    for (const step of [-1, 0, 1]) {
      const month = addScheduleMonths(monthKey, step);
      if (requested.has(month)) continue;
      requested.add(month);
      fetchScheduleMonth(month).then(
        (data) => setMonths((current) => ({ ...current, [month]: data })),
        // 표시는 보조 정보라 실패해도 날짜는 고를 수 있다. 다음 마운트에서 다시 받는다
        () => undefined,
      );
    }
  }, [monthKey, requested]);

  return useMemo(() => {
    const merged = new Map<string, ScheduleDayMark>();
    for (const data of Object.values(months)) {
      for (const [dateKey, mark] of buildScheduleDayMarks(data, playerId)) {
        merged.set(dateKey, mark);
      }
    }
    return merged;
  }, [months, playerId]);
};
