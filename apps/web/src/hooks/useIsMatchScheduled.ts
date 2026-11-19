import { useEffect, useState } from "react";
import { isMatchScheduled, type MatchInfo } from "@/types/match";

/** setTimeout이 받는 가장 긴 지연(ms). 넘기면 바로 실행되므로 그보다 먼 시작에는 타이머를 걸지 않는다 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * isMatchScheduled를 시작 시각이 되는 순간에도 다시 판정한다.
 * now(분 단위 시계)만 따르면 시작 시각이 지난 관리자 예정 경기가 최대 1분 동안 예정으로 남는다.
 */
export const useIsMatchScheduled = (
  match: Pick<MatchInfo, "matchStartsAt" | "status" | "source">,
  now: Date,
): boolean => {
  // 타이머가 닿았다고 알린 시작 시각. 시작 시각이 바뀌면 다시 기다린다
  const [reachedStartsAt, setReachedStartsAt] = useState<string | null>(null);
  const isScheduledByNow = isMatchScheduled(match, now);
  // 대진 예정 경기는 시각과 상관없이 예정이라 기다리지 않는다
  const isWaitingForStart = isScheduledByNow && match.status !== "scheduled";
  const hasReachedStart = reachedStartsAt === match.matchStartsAt;

  useEffect(() => {
    if (!isWaitingForStart || hasReachedStart) return undefined;
    const delay = new Date(match.matchStartsAt).getTime() - Date.now();
    if (delay > MAX_TIMEOUT_MS) return undefined;
    const timeoutId = window.setTimeout(
      () => setReachedStartsAt(match.matchStartsAt),
      Math.max(0, delay),
    );
    return () => window.clearTimeout(timeoutId);
  }, [isWaitingForStart, hasReachedStart, match.matchStartsAt]);

  return isScheduledByNow && !(isWaitingForStart && hasReachedStart);
};
