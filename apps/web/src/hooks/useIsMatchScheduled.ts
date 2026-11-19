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
  // 시작 시각 타이머가 울린 시각. now보다 늦으면 이 시각으로 판정한다
  const [timerNow, setTimerNow] = useState<Date | null>(null);
  const effectiveNow = timerNow && timerNow > now ? timerNow : now;
  const isScheduled = isMatchScheduled(match, effectiveNow);
  // 대진 예정 경기는 시각과 상관없이 예정이라 기다리지 않는다
  const isWaitingForStart = isScheduled && match.status !== "scheduled";

  useEffect(() => {
    if (!isWaitingForStart) return undefined;
    const startsAtMs = new Date(match.matchStartsAt).getTime();
    const delay = startsAtMs - Date.now();
    if (delay > MAX_TIMEOUT_MS) return undefined;
    const timeoutId = window.setTimeout(
      // 타이머가 조금 일찍 울려도 시작 시각 이후로 판정되게 한다
      () => setTimerNow(new Date(Math.max(Date.now(), startsAtMs))),
      Math.max(0, delay),
    );
    return () => window.clearTimeout(timeoutId);
  }, [isWaitingForStart, match.matchStartsAt]);

  return isScheduled;
};
