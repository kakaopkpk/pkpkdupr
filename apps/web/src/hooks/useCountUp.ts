import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./useSheetDrag";

export interface CountUpOptions {
  /** 시작 값. 기본 0 */
  from?: number;
  /** 세는 시간(ms) */
  durationMs: number;
  /** 마운트 뒤 세기 시작까지 기다리는 시간(ms). 기본 0 */
  delayMs?: number;
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
  // ease-out cubic: ease-pk-move 이동 곡선과 비슷한 감속
  const progress = 1 - (1 - elapsedMs / durationMs) ** 3;
  return from + (to - from) * progress;
}

/** 마운트 때 한 번 from → to로 센다. 움직임 줄이기면 처음부터 to. 다 센 뒤 to가 바뀌면 애니메이션 없이 따라간다 */
export function useCountUp(to: number, options: CountUpOptions): CountUpState {
  const [skipAnimation] = useState(prefersReducedMotion);
  const [isDone, setIsDone] = useState(skipAnimation);
  const [value, setValue] = useState(() => (skipAnimation ? to : (options.from ?? 0)));

  // 세는 도중 바뀐 to·옵션도 따라가도록 최신 값을 ref로 읽는다. 세기는 마운트 때 한 번만 시작한다
  const latestRef = useRef({ to, options });
  latestRef.current = { to, options };

  useEffect(() => {
    if (skipAnimation) {
      return;
    }

    let frameId = 0;
    const { delayMs = 0 } = latestRef.current.options;
    const timerId = window.setTimeout(() => {
      let startedAt: number | null = null;
      const tick = (timestamp: number) => {
        startedAt ??= timestamp;
        const { to: target, options: latestOptions } = latestRef.current;
        const elapsedMs = timestamp - startedAt;
        if (elapsedMs >= latestOptions.durationMs) {
          setValue(target);
          setIsDone(true);
          return;
        }
        setValue(getCountUpValue(latestOptions.from ?? 0, target, elapsedMs, latestOptions.durationMs));
        frameId = window.requestAnimationFrame(tick);
      };
      frameId = window.requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
      window.cancelAnimationFrame(frameId);
    };
  }, [skipAnimation]);

  return { value: isDone ? to : value, isDone };
}
