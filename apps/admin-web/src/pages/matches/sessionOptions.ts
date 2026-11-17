import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import {
  getKstWeekday,
  toKstDateKey,
  WEEKDAY_LABELS,
} from "@pkpkdupr/shared/session";
import { formatKstMonthDay } from "../../lib/format";
import { toDate } from "./matchView";

export interface SessionOption {
  id: string;
  name: string;
  /** KST 날짜 키 "YYYY-MM-DD" */
  dateKey: string;
  location: string;
  startTime: string | null;
  /** "11/12 목 · 목요 정기운동" */
  label: string;
}

/** 세션 고르기 목록. 날짜 내림차순, 같은 날은 이름순 */
export const buildSessionOptions = (
  sessions: readonly ManagedMatchSession[],
): SessionOption[] =>
  sessions
    .map((session) => {
      const date = toDate(session.date);
      const dateKey = toKstDateKey(date);
      return {
        id: session.id,
        name: session.name,
        dateKey,
        location: session.location,
        startTime: session.startTime,
        label: `${formatKstMonthDay(date)} ${WEEKDAY_LABELS[getKstWeekday(dateKey)]} · ${session.name}`,
      };
    })
    .sort(
      (a, b) => b.dateKey.localeCompare(a.dateKey) || a.name.localeCompare(b.name),
    );
