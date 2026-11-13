import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** 퇴장 애니메이션 시간(ms). PRESENCE_EXIT_CLASS의 animate-pk-sink-out 길이와 같아야 한다 */
export const PRESENCE_EXIT_MS = 260;

/**
 * 아래에서 올라오며 나타나는 등장(320ms 튀는 곡선). animate-pk-rise-in은 transform만 바꾸므로 pk-fade-in으로 투명도를 함께 올린다.
 * 유리(backdrop-filter) 요소 자신에 건다. 조상에 opacity를 주면 흐림이 애니메이션 동안 깨진다.
 */
export const PRESENCE_ENTER_CLASS =
  "animate-[pk-rise-in_320ms_var(--ease-pk-pop)_both,pk-fade-in_200ms_var(--ease-pk-move)_both] motion-reduce:animate-none";

/** 아래로 가라앉으며 사라지는 퇴장(260ms) */
export const PRESENCE_EXIT_CLASS = "animate-pk-sink-out motion-reduce:animate-none";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface PresenceEntry<T> {
  item: T;
  key: string;
  /** 퇴장 애니메이션 중. 마지막 값을 그대로 보이되 누를 수 없게 한다 */
  isExiting: boolean;
}

/**
 * 조건부로 보이는 요소의 퇴장 애니메이션이 끝날 때까지 마지막 값을 남긴다.
 * - value가 null이 되면 마지막 값을 isExiting=true로 PRESENCE_EXIT_MS 동안 돌려준 뒤 null을 돌려준다.
 * - 퇴장 중 값이 다시 생기면 같은 key의 요소가 그대로 다시 등장한다(isExiting=false).
 * - key가 바뀌면 이전 요소는 퇴장 없이 바로 바뀐다. 결과의 key를 React key로 쓴다.
 * - skipExit이거나 움직임 줄이기면 퇴장 없이 바로 사라진다.
 * 퇴장 판단은 커밋 직후 레이아웃 이펙트에서 하므로, 값이 사라진 커밋에서 잠깐 null이 되어도 화면에 그려지기 전에 다시 렌더된다.
 */
export function usePresence<T>(
  value: T | null,
  options: { key?: string; skipExit?: boolean } = {},
): PresenceEntry<T> | null {
  const { key = "", skipExit = false } = options;
  const latestRef = useRef<{ item: T; key: string } | null>(null);
  const [exiting, setExiting] = useState<{ item: T; key: string } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (value !== null) {
      latestRef.current = { item: value, key };
      setExiting(null);
      return;
    }

    const latest = latestRef.current;
    latestRef.current = null;
    if (skipExit || prefersReducedMotion()) {
      setExiting(null);
      return;
    }
    if (latest) setExiting(latest);
  }, [key, skipExit, value]);

  useEffect(() => {
    if (!exiting) return;
    const timeoutId = window.setTimeout(
      () => setExiting(null),
      PRESENCE_EXIT_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [exiting]);

  if (value !== null) return { item: value, key, isExiting: false };
  return exiting ? { ...exiting, isExiting: true } : null;
}
