import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import {
  PULL_TO_REFRESH_THRESHOLD,
  usePullToRefresh,
} from "@/hooks/usePullToRefresh";

const TRANSITION_DURATION_MS = 84;

const RightDrawerScrollContext = createContext<HTMLDivElement | null>(null);
const RightDrawerPullToRefreshContext = createContext<
  ((handler: (() => Promise<void>) | null) => void) | null
>(null);

export const useRightDrawerScrollContainer = () =>
  useContext(RightDrawerScrollContext);

export const useRegisterRightDrawerPullToRefresh = (
  handler: (() => Promise<void>) | null,
) => {
  const register = useContext(RightDrawerPullToRefreshContext);

  useEffect(() => {
    if (!register) return undefined;
    register(handler);
    return () => register(null);
  }, [handler, register]);
};

interface RightDrawerProps {
  isOpen: boolean;
  isActive?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  onExited?: () => void;
  onScrollContainerChange?: (element: HTMLDivElement | null) => void;
  onPullToRefresh?: () => Promise<void>;
  layer?: number;
  className?: string;
}

const RightDrawer: React.FC<RightDrawerProps> = ({
  isOpen,
  isActive = true,
  ariaLabel,
  children,
  onExited,
  onScrollContainerChange,
  onPullToRefresh,
  layer = 50,
  className,
}) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(false);
  const [scrollContainer, setScrollContainer] =
    useState<HTMLDivElement | null>(null);
  const [registeredPullToRefresh, setRegisteredPullToRefresh] = useState<
    (() => Promise<void>) | null
  >(null);
  const animationFrameRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const onExitedRef = useRef(onExited);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (isOpen) {
      setShouldRender(true);
      setIsTransitionEnabled(true);
      setIsVisible(false);
      animationFrameRef.current = window.requestAnimationFrame(() => {
        setIsVisible(true);
        animationFrameRef.current = null;

        transitionTimeoutRef.current = window.setTimeout(() => {
          setIsTransitionEnabled(false);
          transitionTimeoutRef.current = null;
        }, TRANSITION_DURATION_MS);
      });
      return undefined;
    }

    if (!shouldRender) return undefined;

    setIsTransitionEnabled(true);
    setIsVisible(true);
    animationFrameRef.current = window.requestAnimationFrame(() => {
      setIsVisible(false);
      animationFrameRef.current = null;

      transitionTimeoutRef.current = window.setTimeout(() => {
        setShouldRender(false);
        setIsTransitionEnabled(false);
        transitionTimeoutRef.current = null;
        onExitedRef.current?.();
      }, TRANSITION_DURATION_MS);
    });

    return undefined;
  }, [isOpen, shouldRender]);

  useEffect(
    () => () => {
      if (typeof window === "undefined") return;

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    },
    [],
  );

  const handleScrollContainerChange = useCallback(
    (element: HTMLDivElement | null) => {
      setScrollContainer(element);
      onScrollContainerChange?.(element);
    },
    [onScrollContainerChange],
  );
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
    isEnabled: isOpen && isActive,
  });

  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  const transformClassName = isTransitionEnabled
    ? [
        "transform-gpu transition-transform will-change-transform duration-[84ms]",
        isVisible ? "translate-x-0 ease-out" : "translate-x-full ease-in",
      ].join(" ")
    : isVisible
      ? "translate-x-0"
      : "translate-x-full";

  return createPortal(
    <div
      aria-hidden={!isActive || !isOpen}
      className={`fixed inset-0 ${
        isActive ? "pointer-events-auto" : "pointer-events-none invisible"
      }`}
      style={{ zIndex: layer }}
    >
      <div className="app-shell-width absolute inset-y-0 left-1/2 w-full -translate-x-1/2">
        <section
          ref={handleScrollContainerChange}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className={`app-right-drawer-scroll-area relative ${
            isOpen && isActive ? "pointer-events-auto" : "pointer-events-none"
          } h-[calc(var(--app-shell-height)-var(--app-keyboard-offset))] w-full bg-pk-bg pb-[calc(1rem+var(--safe-bottom)+var(--app-keyboard-offset))] shadow-2xl ${transformClassName} ${className ?? ""}`}
        >
          {refreshHandler ? (
            <PullToRefreshIndicator
              distance={distance}
              status={status}
              threshold={PULL_TO_REFRESH_THRESHOLD}
            />
          ) : null}
          <RightDrawerPullToRefreshContext.Provider
            value={registerPullToRefreshHandler}
          >
            <RightDrawerScrollContext.Provider value={scrollContainer}>
              {children}
            </RightDrawerScrollContext.Provider>
          </RightDrawerPullToRefreshContext.Provider>
        </section>
      </div>
    </div>,
    document.body,
  );
};

export default RightDrawer;
