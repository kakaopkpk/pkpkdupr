import { useCallback, useState } from "react";

/**
 * CSS 애니메이션을 처음 한 번만 재생하기 위한 상태.
 * keep-alive 탭 패널은 숨길 때 hidden(display:none)이 되므로, 다시 보이면 CSS 애니메이션이 처음부터 재생된다.
 * isPlaying이 true일 때만 animate-* 클래스를 붙이고, 가장 늦게 끝나는 애니메이션 요소(자식에 다른 애니메이션이 없는 요소)의
 * onAnimationEnd에 finish를 건다. onAnimationEnd는 자식 애니메이션 종료도 버블링으로 받는다.
 * animationend가 생기는 유한 애니메이션에만 쓴다(animate-pk-ping·animate-pk-spin-slow 같은 무한 반복은 끝나지 않는다).
 */
export function usePlayOnce(): { isPlaying: boolean; finish: () => void } {
  const [isPlaying, setIsPlaying] = useState(true);
  const finish = useCallback(() => setIsPlaying(false), []);
  return { isPlaying, finish };
}
