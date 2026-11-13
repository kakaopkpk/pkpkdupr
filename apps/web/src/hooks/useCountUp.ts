import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./useSheetDrag";
import { useShowPlayKey } from "./usePlayOnShow";

export interface CountUpOptions {
  /** 시작 값. 기본 0 */
  from?: number;
  /** 세는 시간(ms) */
  durationMs: number;
  /** 세기 시작 기준(화면이 보이고 준비된 시점) 뒤 기다리는 시간(ms). 기본 0 */
  delayMs?: number;
  /** false인 동안은 세지 않고 from을 보인다. 기본 true */
  isReady?: boolean;
}

export interface CountUpState {
  /** 지금 보일 값. 반올림·포맷은 호출부가 한다 */
  value: number;
  /** 다 세었으면 true. 움직임 줄이기면 처음부터 true */
  isDone: boolean;
}

/** 경과 시간에 따른 값(감속 곡선). 0 이하면 from, durationMs 이상이면 to */
export function getCountUpValue(from: number, to: number, elapsedMs: number, durationMs: number): number {
  if (elapsedMs <= 0) {
    return from;
  }
  if (elapsedMs >= durationMs) {
    return to;
  }
  // ease-out cubic 감속 곡선
  const progress = 1 - (1 - elapsedMs / durationMs) ** 3;
  return from + (to - from) * progress;
}

/**
 * 화면이 보이게 될 때마다(처음 마운트 포함) from → to로 한 번 센다. 움직임 줄이기면 언제나 to.
 * 숨김 중이나 isReady가 false인 동안은 세지 않는다. 같은 보임 안에서 다 센 뒤 to가 바뀌면 애니메이션 없이 따라간다
 */
export function useCountUp(to: number, options: CountUpOptions): CountUpState {
  const { from = 0, isReady = true } = options;
  const [skipAnimation] = useState(prefersReducedMotion);
  const playKey = useShowPlayKey(isReady);
  const [progress, setProgress] = useState<{ key: number; value: number } | null>(null);
  const [doneKey, setDoneKey] = useState<number | null>(null);

  // 세는 도중 바뀐 to·from·durationMs도 따라가도록 최신 값을 ref로 읽는다.
  // delayMs는 회차를 시작할 때 값만 쓴다
  const latestRef = useRef({ to, from, options });
  latestRef.current = { to, from, options };

  useEffect(() => {
    if (skipAnimation || playKey === null) {
      return;
    }

    // 시작 값과 최종 값이 같으면 셀 것이 없으니 프레임을 돌리지 않고 바로 끝낸다
    if (latestRef.current.from === latestRef.current.to) {
      setDoneKey(playKey);
      return;
    }

    let frameId = 0;
    const { delayMs = 0 } = latestRef.current.options;
    const timerId = window.setTimeout(() => {
      let startedAt: number | null = null;
      const tick = (timestamp: number) => {
        startedAt ??= timestamp;
        const { to: target, from: start, options: latestOptions } = latestRef.current;
        const elapsedMs = timestamp - startedAt;
        if (elapsedMs >= latestOptions.durationMs) {
          setDoneKey(playKey);
          return;
        }
        setProgress({
          key: playKey,
          value: getCountUpValue(start, target, elapsedMs, latestOptions.durationMs),
        });
        frameId = window.requestAnimationFrame(tick);
      };
      frameId = window.requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
      window.cancelAnimationFrame(frameId);
    };
  }, [skipAnimation, playKey]);

  if (skipAnimation) {
    return { value: to, isDone: true };
  }
  if (playKey === null) {
    // 준비 전에는 시작 값, 숨김 중에는 최종 값을 유지한다(가려지는 동안 처음 상태로 돌아가지 않는다)
    return isReady ? { value: to, isDone: true } : { value: from, isDone: false };
  }
  if (doneKey === playKey) {
    return { value: to, isDone: true };
  }
  // 이번 회차의 첫 프레임 전에는 시작 값이다
  return { value: progress?.key === playKey ? progress.value : from, isDone: false };
}
