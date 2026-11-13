import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { DetailHeader } from "@/components/ui/Headers";
import { cx } from "@/components/ui/cx";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import {
  PULL_TO_REFRESH_THRESHOLD,
  usePullToRefresh,
} from "@/hooks/usePullToRefresh";

// JS 타이머(닫힘 후 언마운트·transform 해제)용 시간. PUSH_SCREEN_MOTION_CLASS의 duration과 같아야 한다
const TRANSITION_MS = 320;
// 쌓인 순서만큼 레이어를 올리되, 화면 위 바텀시트(GLOBAL_LAYER.sheet)보다는 아래에 머문다
const MAX_STACK_OFFSET = 20;
const COVERED_TRANSFORM = "translateX(-30%)";

/** 화면 이동·뒤 화면 밀림·어두워짐이 함께 쓰는 시간과 곡선. 끝으로 갈수록 부드럽게 멈춘다 */
const PUSH_SCREEN_MOTION_CLASS =
  "duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

export const PUSH_SCREEN_TRANSITION_CLASS = `transition-transform ${PUSH_SCREEN_MOTION_CLASS}`;

const getTransitionMs = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? 0
    : TRANSITION_MS;

interface PushScreenStackEntry {
  id: string;
  isOpen: boolean;
  isActive: boolean;
}

export interface PushScreenStackValue {
  /** 연 순서. 닫히는 애니메이션이 끝날 때까지 남는다 */
  entries: PushScreenStackEntry[];
  setEntry: (entry: PushScreenStackEntry) => void;
  removeEntry: (id: string) => void;
}

const PushScreenStackContext = createContext<PushScreenStackValue | null>(null);

/** 셸(BottomNav)이 들고 있는 화면 스택. PushScreen은 열릴 때 여기에 자기를 올린다 */
export const usePushScreenStackState = (): PushScreenStackValue => {
  const [entries, setEntries] = useState<PushScreenStackEntry[]>([]);

  const setEntry = useCallback((entry: PushScreenStackEntry) => {
    setEntries((current) => {
      const index = current.findIndex((candidate) => candidate.id === entry.id);
      if (index === -1) return [...current, entry];

      const previous = current[index];
      if (
        previous.isOpen === entry.isOpen &&
        previous.isActive === entry.isActive
      ) {
        return current;
      }
      const next = [...current];
      next[index] = entry;
      return next;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((current) =>
      current.some((entry) => entry.id === id)
        ? current.filter((entry) => entry.id !== id)
        : current,
    );
  }, []);

  return useMemo(
    () => ({ entries, setEntry, removeEntry }),
    [entries, removeEntry, setEntry],
  );
};

export const PushScreenStackProvider: React.FC<{
  value: PushScreenStackValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <PushScreenStackContext.Provider value={value}>
    {children}
  </PushScreenStackContext.Provider>
);

const isShown = (entry: PushScreenStackEntry) => entry.isOpen && entry.isActive;

/** 지금 보이는 탭 위에 열린 화면이 있는지. 있으면 탭 셸(하단 바 포함)이 그 아래로 가려진다 */
export const isPushScreenShown = (entries: readonly PushScreenStackEntry[]) =>
  entries.some(isShown);

/**
 * 위에 화면이 덮이면 왼쪽으로 30% 밀린다. 돌아온 뒤에는 transform을 지워
 * 안쪽 fixed 요소(하단 바)의 기준이 다시 화면이 되게 한다.
 */
export const usePushScreenCoverStyle = (
  isCovered: boolean,
): React.CSSProperties | undefined => {
  const [hasTransform, setHasTransform] = useState(isCovered);

  useEffect(() => {
    if (isCovered) {
      setHasTransform(true);
      return undefined;
    }

    const timeoutId = window.setTimeout(
      () => setHasTransform(false),
      getTransitionMs(),
    );
    return () => window.clearTimeout(timeoutId);
  }, [isCovered]);

  if (!isCovered && !hasTransform) return undefined;
  return { transform: isCovered ? COVERED_TRANSFORM : "translateX(0)" };
};

/** 덮인 화면을 살짝 어둡게 하는 막. 부모가 relative여야 한다 */
export const PushScreenCoverDim: React.FC<{
  isCovered: boolean;
  className?: string;
}> = ({ isCovered, className }) => (
  <div
    aria-hidden="true"
    className={cx(
      "pointer-events-none absolute inset-0 bg-pk-ink/15 transition-opacity",
      PUSH_SCREEN_MOTION_CLASS,
      isCovered ? "opacity-100" : "opacity-0",
      className,
    )}
  />
);

const PushScreenScrollContext = createContext<HTMLElement | null>(null);
const PushScreenPullToRefreshContext = createContext<
  ((handler: (() => Promise<void>) | null) => void) | null
>(null);

/** 화면 본문의 스크롤 영역(무한 스크롤 IntersectionObserver root 등) */
export const usePushScreenScrollContainer = (): HTMLElement | null =>
  useContext(PushScreenScrollContext);

/** 화면 안쪽 컴포넌트가 당겨서 새로고침 동작을 정한다. onPullToRefresh보다 우선한다 */
export const useRegisterPushScreenPullToRefresh = (
  handler: (() => Promise<void>) | null,
): void => {
  const register = useContext(PushScreenPullToRefreshContext);

  useEffect(() => {
    if (!register) return undefined;
    register(handler);
    return () => register(null);
  }, [handler, register]);
};

export interface PushScreenProps {
  isOpen: boolean;
  /** false면 다른 탭에 연 화면이라 숨긴다(상태는 유지) */
  isActive?: boolean;
  ariaLabel: string;
  title: React.ReactNode;
  onBack: () => void;
  /** 헤더 오른쪽 슬롯(텍스트 버튼 등) */
  headerRight?: React.ReactNode;
  /** 탭바 자리의 하단 고정 바 내용. 없으면 바를 그리지 않는다 */
  actions?: React.ReactNode;
  /** 스택 바닥 레이어. 실제 z-index는 쌓인 순서만큼 더한다 */
  layer?: number;
  onExited?: () => void;
  onPullToRefresh?: () => Promise<void>;
  children: React.ReactNode;
}

/**
 * 하단 바까지 덮는 전체 화면 이동. 오른쪽에서 들어오고, 그 아래 화면(탭 셸 또는 아래 화면)은
 * 왼쪽으로 30% 밀리며 어두워진다. 돌아가기는 헤더 ‹ 버튼과 기기 뒤로가기(호출부의 깊이)로 한다.
 */
export const PushScreen: React.FC<PushScreenProps> = ({
  isOpen,
  isActive = true,
  ariaLabel,
  title,
  onBack,
  headerRight,
  actions,
  layer = GLOBAL_LAYER.pushScreen,
  onExited,
  onPullToRefresh,
  children,
}) => {
  const id = useId();
  const stack = useContext(PushScreenStackContext);
  const setStackEntry = stack?.setEntry;
  const removeStackEntry = stack?.removeEntry;
  const [shouldRender, setShouldRender] = useState(false);
  const [isInPlace, setIsInPlace] = useState(false);
  const [scrollContainer, setScrollContainer] =
    useState<HTMLDivElement | null>(null);
  const [registeredPullToRefresh, setRegisteredPullToRefresh] = useState<
    (() => Promise<void>) | null
  >(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const onExitedRef = useRef(onExited);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  const cancelPending = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    cancelPending();

    if (isOpen) {
      setShouldRender(true);
      // 화면 밖 시작 위치가 한 번 칠해진 뒤에 옮겨야 들어오는 움직임이 보인다
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null;
          setIsInPlace(true);
        });
      });
      return undefined;
    }

    if (!shouldRender) return undefined;

    setIsInPlace(false);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setShouldRender(false);
      onExitedRef.current?.();
    }, getTransitionMs());
    return undefined;
  }, [cancelPending, isOpen, shouldRender]);

  useEffect(() => cancelPending, [cancelPending]);

  // 닫기 시작하면 바로 isOpen=false를 알려 아래 화면이 같이 돌아오게 하고,
  // 닫히는 움직임이 끝나면 스택에서 뺀다
  useEffect(() => {
    if (!setStackEntry || !removeStackEntry) return;
    if (shouldRender) {
      setStackEntry({ id, isOpen, isActive });
    } else {
      removeStackEntry(id);
    }
  }, [id, isActive, isOpen, removeStackEntry, setStackEntry, shouldRender]);

  useEffect(
    () => () => removeStackEntry?.(id),
    [id, removeStackEntry],
  );

  // 뒤 화면이 inert가 되며 잃는 포커스를 새 화면으로 옮긴다
  useEffect(() => {
    if (isInPlace && isOpen) sectionRef.current?.focus({ preventScroll: true });
  }, [isInPlace, isOpen]);

  const entries = stack?.entries ?? [];
  const stackIndex = entries.findIndex((entry) => entry.id === id);
  const isCovered =
    stackIndex !== -1 && entries.slice(stackIndex + 1).some(isShown);
  const zIndex = layer + Math.min(Math.max(stackIndex, 0), MAX_STACK_OFFSET);
  const isInteractive = isOpen && isActive && !isCovered;

  const registerPullToRefreshHandler = useCallback(
    (handler: (() => Promise<void>) | null) => {
      setRegisteredPullToRefresh(() => handler);
    },
    [],
  );
  const refreshHandler = registeredPullToRefresh ?? onPullToRefresh;
  const { distance, status } = usePullToRefresh({
    container: scrollContainer,
    onRefresh: refreshHandler ?? undefined,
    isEnabled: isInteractive,
  });

  if (!shouldRender || typeof document === "undefined") return null;

  const transform = !isInPlace
    ? "translateX(100%)"
    : isCovered
      ? COVERED_TRANSFORM
      : "translateX(0)";

  return createPortal(
    <div
      inert={!isInteractive}
      className={cx(
        "pointer-events-none fixed inset-0",
        !isActive && "invisible",
      )}
      style={{ zIndex }}
    >
      <div className="app-shell-width absolute inset-y-0 left-1/2 w-full -translate-x-1/2 overflow-hidden">
        <section
          ref={sectionRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          style={{ transform }}
          className={cx(
            "relative flex h-[calc(var(--app-shell-height)-var(--app-keyboard-offset))] w-full flex-col bg-pk-bg outline-none shadow-[-8px_0_24px] shadow-pk-ink/8 will-change-transform",
            PUSH_SCREEN_TRANSITION_CLASS,
            isOpen && isActive && "pointer-events-auto",
          )}
        >
          <DetailHeader title={title} onBack={onBack} right={headerRight} />
          <div
            ref={setScrollContainer}
            className={cx(
              "app-push-screen-scroll-area relative min-h-0 flex-1",
              actions ? "pb-4" : "pb-[calc(1rem+var(--safe-bottom))]",
            )}
          >
            {refreshHandler ? (
              <PullToRefreshIndicator
                distance={distance}
                status={status}
                threshold={PULL_TO_REFRESH_THRESHOLD}
              />
            ) : null}
            <PushScreenPullToRefreshContext.Provider
              value={registerPullToRefreshHandler}
            >
              <PushScreenScrollContext.Provider value={scrollContainer}>
                {children}
              </PushScreenScrollContext.Provider>
            </PushScreenPullToRefreshContext.Provider>
          </div>
          {actions ? (
            <div className="shrink-0 border-t border-pk-divider bg-pk-bg px-4 pt-3 pb-[var(--safe-bottom)]">
              {actions}
            </div>
          ) : null}
          <PushScreenCoverDim isCovered={isCovered} className="z-40" />
        </section>
      </div>
    </div>,
    document.body,
  );
};

export default PushScreen;
