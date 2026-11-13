import { useCallback, useRef, useState } from "react";
import { useIsScreenVisible } from "@/context/ScreenVisibilityContext";

interface ShowCycle {
  isVisible: boolean;
  /** 이번 보임의 재생 회차. 숨김 중이거나 아직 준비 전이면 null */
  playKey: number | null;
  lastKey: number;
}

/** 이전 회차와 지금 보임·준비 상태로 다음 회차를 정한다. 바뀔 것이 없으면 cycle을 그대로 돌려준다 */
export function getNextShowCycle(
  cycle: ShowCycle,
  isVisible: boolean,
  isReady: boolean,
): ShowCycle {
  if (!isVisible) {
    return cycle.isVisible || cycle.playKey !== null
      ? { isVisible: false, playKey: null, lastKey: cycle.lastKey }
      : cycle;
  }
  // 보이게 된 첫 렌더, 또는 같은 보임 안에서 처음 준비된 렌더에 새 회차를 연다.
  // 한 번 연 회차는 같은 보임 동안 isReady가 다시 false가 되어도 유지해 재조회로 다시 재생하지 않는다
  if (!cycle.isVisible || cycle.playKey === null) {
    if (!isReady) {
      return cycle.isVisible ? cycle : { ...cycle, isVisible: true };
    }
    const playKey = cycle.lastKey + 1;
    return { isVisible: true, playKey, lastKey: playKey };
  }
  return cycle;
}

/**
 * 화면이 보이고 준비될 때마다 새 재생 회차 번호를 돌려준다. 숨김 중이거나 준비 전이면 null.
 * 회차는 렌더 중에 정해지므로 보이게 되는 첫 렌더부터 새 회차다(최종 상태가 한 프레임 보이지 않는다)
 */
export function useShowPlayKey(isReady = true): number | null {
  const isVisible = useIsScreenVisible();
  const [cycle, setCycle] = useState<ShowCycle>(() =>
    getNextShowCycle({ isVisible: false, playKey: null, lastKey: 0 }, isVisible, isReady),
  );
  const nextCycle = getNextShowCycle(cycle, isVisible, isReady);
  if (nextCycle !== cycle) {
    setCycle(nextCycle);
  }
  return nextCycle.playKey;
}

export interface PlayOnShowState {
  /** true인 동안만 animate-pk-* 클래스(와 지연·길이 style)를 붙인다 */
  isPlaying: boolean;
  /** 가장 늦게 끝나는 애니메이션의 onAnimationEnd(자식 버블링 포함)에 건다. 이번 보임의 재생을 끝낸다 */
  finish: () => void;
}

/**
 * 화면이 보이게 될 때마다(처음 마운트 포함) CSS 애니메이션을 한 번 재생하기 위한 상태.
 * isReady(기본 true)가 false인 동안은 재생을 미룬다. 같은 보임 안의 리렌더·재조회로는 다시 재생하지 않는다.
 * 숨김 중에는 isPlaying이 false라 클래스가 떨어진 최종 상태로 남고, 다시 보이면 클래스가 새로 붙어 처음부터 재생된다.
 * 무한 반복 애니메이션(animate-pk-ping·animate-pk-spin-slow)에는 쓰지 않는다.
 */
export function usePlayOnShow(isReady = true): PlayOnShowState {
  const playKey = useShowPlayKey(isReady);
  const [finishedKey, setFinishedKey] = useState<number | null>(null);
  const playKeyRef = useRef(playKey);
  playKeyRef.current = playKey;

  const finish = useCallback(() => setFinishedKey(playKeyRef.current), []);

  return { isPlaying: playKey !== null && playKey !== finishedKey, finish };
}
