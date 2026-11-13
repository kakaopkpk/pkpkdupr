import React from "react";
import { createPortal } from "react-dom";
import { prefersReducedMotion, useSheetDrag } from "@/hooks/useSheetDrag";
import { DIMMED_THEME_COLOR } from "@/lib/themeColor";

const OPEN_DURATION_MS = 240;
const CLOSE_DURATION_MS = 180;

interface BottomSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  ariaLabel: string;
  children: React.ReactElement | React.ReactElement[];
  className?: string;
  isDismissable?: boolean;
  isActive?: boolean;
  layer?: number;
  /**
   * 기본 true: 내용과 상관없이 시트를 고정 높이(화면의 약 3/4, 상한 620px)로 둔다.
   * Header·Footer는 고정이고 Body만 스크롤된다. false면 내용 높이를 따른다.
   */
  isFixedHeight?: boolean;
}

interface BottomSheetBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface BottomSheetHeaderProps {
  children: React.ReactNode;
  className?: string;
}

const BottomSheetHeader: React.FC<BottomSheetHeaderProps> = ({
  children,
  className,
}) => (
  <div
    className={["relative z-10 shrink-0 bg-white pb-4", className]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);

const BottomSheetBody: React.FC<BottomSheetBodyProps> = ({
  children,
  className,
}) => (
  <div
    className={[
      "app-bottom-sheet-body min-h-0 flex-1 flex flex-col gap-4",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);

/**
 * Body 아래에 두면 본문이 스크롤돼도 시트 하단에 고정된다.
 * 키보드가 열려 있는 동안은 숨는다(index.css `html[data-keyboard-open]`).
 */
const BottomSheetFooter: React.FC<BottomSheetBodyProps> = ({
  children,
  className,
}) => (
  <div
    className={["app-bottom-sheet-footer shrink-0 bg-white pt-3", className]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);

type BottomSheetComponent = React.FC<BottomSheetProps> & {
  Header: typeof BottomSheetHeader;
  Body: typeof BottomSheetBody;
  Footer: typeof BottomSheetFooter;
};

const BottomSheet: BottomSheetComponent = ({
  isOpen,
  onOpenChange,
  ariaLabel,
  children,
  className,
  isDismissable = true,
  isActive = true,
  layer = 50,
  isFixedHeight = true,
}) => {
  const [shouldRender, setShouldRender] = React.useState(isOpen);
  const [isVisible, setIsVisible] = React.useState(isOpen);
  const [isSheetTransitionEnabled, setIsSheetTransitionEnabled] =
    React.useState(false);
  const [transitionDurationMs, setTransitionDurationMs] =
    React.useState(OPEN_DURATION_MS);
  const openAnimationFrameRef = React.useRef<number | null>(null);
  const transitionTimeoutRef = React.useRef<number | null>(null);
  const surfaceRef = React.useRef<HTMLElement | null>(null);
  const dimRef = React.useRef<HTMLDivElement | null>(null);
  const transitionStyle = React.useMemo(
    () => ({ transitionDuration: `${transitionDurationMs}ms` }),
    [transitionDurationMs],
  );

  useSheetDrag({
    surfaceRef,
    dimRef,
    enabled: shouldRender && isActive && isDismissable,
    isOpen,
    onDismiss: () => onOpenChange(false),
  });

  React.useLayoutEffect(() => {
    if (!shouldRender || !isActive || typeof document === "undefined") {
      return undefined;
    }

    const themeColorMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );

    if (!themeColorMeta) {
      return undefined;
    }

    const previousThemeColor = themeColorMeta.getAttribute("content");
    themeColorMeta.setAttribute("content", DIMMED_THEME_COLOR);

    return () => {
      if (themeColorMeta.getAttribute("content") === DIMMED_THEME_COLOR) {
        themeColorMeta.setAttribute(
          "content",
          previousThemeColor ?? "",
        );
      }
    };
  }, [isActive, shouldRender]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (openAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(openAnimationFrameRef.current);
      openAnimationFrameRef.current = null;
    }

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    // 움직임 줄이기 설정이면 애니메이션 없이 열고 닫는다
    const durationMs = prefersReducedMotion()
      ? 0
      : isOpen
        ? OPEN_DURATION_MS
        : CLOSE_DURATION_MS;
    setTransitionDurationMs(durationMs);

    if (isOpen) {
      setShouldRender(true);
      setIsSheetTransitionEnabled(true);
      setIsVisible(false);

      openAnimationFrameRef.current = window.requestAnimationFrame(() => {
        setIsVisible(true);
        openAnimationFrameRef.current = null;

        transitionTimeoutRef.current = window.setTimeout(() => {
          setIsSheetTransitionEnabled(false);
          transitionTimeoutRef.current = null;
        }, durationMs);
      });

      return undefined;
    }

    setIsSheetTransitionEnabled(true);
    setIsVisible(true);
    openAnimationFrameRef.current = window.requestAnimationFrame(() => {
      setIsVisible(false);
      openAnimationFrameRef.current = null;

      transitionTimeoutRef.current = window.setTimeout(() => {
        setShouldRender(false);
        setIsSheetTransitionEnabled(false);
        transitionTimeoutRef.current = null;
      }, durationMs);
    });

    return undefined;
  }, [isOpen]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    return () => {
      if (openAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(openAnimationFrameRef.current);
      }

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  if (!shouldRender) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-hidden={!isActive}
      className={`fixed inset-0 flex items-end justify-center ${
        isActive ? "" : "pointer-events-none invisible"
      }`}
      style={{ zIndex: layer }}
      onMouseDown={(event) => {
        if (isDismissable && event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 transition-opacity ease-out",
          isVisible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={transitionStyle}
      >
        {/* 끄는 동안의 옅어짐은 안쪽에 따로 둬서 열림·닫힘 전환과 겹쳐 적용된다 */}
        <div
          ref={dimRef}
          className="absolute inset-0 bg-pk-ink/45"
        />
      </div>
      <div
        className={[
          "app-shell-width relative z-10 mx-auto w-full",
          isSheetTransitionEnabled
            ? [
                "transform-gpu transition-transform will-change-transform",
                isVisible
                  ? "translate-y-0 ease-out"
                  : "translate-y-[calc(100%+2rem)] ease-in",
              ].join(" ")
            : "",
        ].join(" ")}
        style={transitionStyle}
      >
        <section
          ref={surfaceRef}
          role="dialog"
          aria-label={ariaLabel}
          className={[
            "app-bottom-sheet-surface relative flex min-h-0 w-full flex-col overflow-hidden rounded-t-pk-lg bg-white px-4 pt-2.5 pb-[calc(1rem+var(--safe-bottom)+var(--app-keyboard-offset))] text-pk-ink shadow-[0_-10px_40px] shadow-pk-ink/20",
            isFixedHeight ? "app-bottom-sheet-surface--fixed" : null,
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div
            aria-hidden="true"
            className="mb-3 h-[5px] w-10 shrink-0 self-center rounded-full bg-pk-line"
          />
          {children}
        </section>
      </div>
    </div>,
    document.body,
  );
};

BottomSheet.Header = BottomSheetHeader;
BottomSheet.Body = BottomSheetBody;
BottomSheet.Footer = BottomSheetFooter;

export default BottomSheet;
