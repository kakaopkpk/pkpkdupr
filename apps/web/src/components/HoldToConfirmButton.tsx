import React, { useCallback, useEffect, useRef, useState } from "react";

/** 길게 눌러 확인하는 기본 시간 */
export const HOLD_TO_CONFIRM_DURATION_MS = 1000;

/** danger 변형의 채움 앞 끝 선 두께 */
const PROGRESS_EDGE_WIDTH_PX = 3;

interface HoldToConfirmButtonProps {
  onComplete: () => void;
  holdDurationMs?: number;
  children: React.ReactNode;
  className?: string;
  progressClassName?: string;
  isDisabled?: boolean;
  ariaLabel?: string;
  /**
   * primary(기본): 블루 채움 버튼 위로 누르는 동안 진행이 찬다.
   * plain: 바탕 없는 행 모양. 색은 className·progressClassName으로 정한다.
   * danger: 빨강 채움 버튼(경기 삭제 전용). 누르는 동안 왼쪽부터 어둡게 차고 채움 앞 끝에 라임 선이 보인다.
   */
  variant?: "primary" | "plain" | "danger";
}

const variantClassName: Record<
  NonNullable<HoldToConfirmButtonProps["variant"]>,
  { button: string; progress: string; edge?: string }
> = {
  primary: {
    button:
      "h-[52px] justify-center rounded-pk-sm bg-pk-primary px-4 text-pk-15 font-extrabold text-white disabled:cursor-not-allowed disabled:bg-pk-neutral disabled:text-pk-muted",
    progress: "bg-white/25",
  },
  plain: {
    button:
      "rounded-xl px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
    progress: "bg-pk-down/14",
  },
  danger: {
    button:
      "h-[52px] justify-center rounded-pk-sm bg-pk-down px-4 text-pk-15 font-extrabold text-white disabled:cursor-not-allowed disabled:bg-pk-neutral disabled:text-pk-muted",
    progress: "bg-pk-ink/40",
    edge: "bg-pk-hl",
  },
};

const HoldToConfirmButton: React.FC<HoldToConfirmButtonProps> = ({
  onComplete,
  holdDurationMs = HOLD_TO_CONFIRM_DURATION_MS,
  children,
  className,
  progressClassName,
  isDisabled = false,
  ariaLabel,
  variant = "primary",
}) => {
  const variantClasses = variantClassName[variant];
  const [progress, setProgress] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const holdStartTimeRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);
  const isCompletedRef = useRef(false);
  const stepRef = useRef<(timestamp: number) => void>(undefined);

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const resetHold = useCallback(() => {
    cancelAnimation();
    holdStartTimeRef.current = null;
    isHoldingRef.current = false;
    isCompletedRef.current = false;
    setProgress(0);
  }, [cancelAnimation]);

  stepRef.current = (timestamp: number) => {
    if (!isHoldingRef.current || holdStartTimeRef.current === null) {
      return;
    }

    const elapsedMs = timestamp - holdStartTimeRef.current;
    const nextProgress = Math.min(elapsedMs / holdDurationMs, 1);
    setProgress(nextProgress);

    if (elapsedMs >= holdDurationMs) {
      cancelAnimation();
      isHoldingRef.current = false;

      if (!isCompletedRef.current) {
        isCompletedRef.current = true;
        onComplete();
      }

      return;
    }

    animationFrameRef.current = window.requestAnimationFrame((nextTimestamp) => {
      stepRef.current?.(nextTimestamp);
    });
  };

  const startHold = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      cancelAnimation();
      holdStartTimeRef.current = performance.now();
      isHoldingRef.current = true;
      isCompletedRef.current = false;
      setProgress(0);
      animationFrameRef.current = window.requestAnimationFrame((timestamp) => {
        stepRef.current?.(timestamp);
      });
    },
    [cancelAnimation, isDisabled],
  );

  const stopHold = useCallback(() => {
    resetHold();
  }, [resetHold]);

  useEffect(() => {
    return () => {
      cancelAnimation();
    };
  }, [cancelAnimation]);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={isDisabled}
      onPointerDown={startHold}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      onContextMenu={(event) => event.preventDefault()}
      className={[
        "relative flex w-full select-none items-center overflow-hidden transition-colors touch-manipulation",
        variantClasses.button,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ WebkitTouchCallout: "none" }}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-y-0 left-0 w-full origin-left",
          progressClassName ?? variantClasses.progress,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ transform: `scaleX(${progress})` }}
      />
      {variantClasses.edge && progress > 0 ? (
        // 채움 앞 끝 선. 채움과 달리 늘어나지 않도록 위치만 옮긴다
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none absolute inset-y-0",
            variantClasses.edge,
          ].join(" ")}
          style={{
            width: PROGRESS_EDGE_WIDTH_PX,
            left: `max(0px, calc(${progress * 100}% - ${PROGRESS_EDGE_WIDTH_PX}px))`,
          }}
        />
      ) : null}
      <span className="relative z-10 flex min-w-0 items-center gap-2">
        {children}
      </span>
    </button>
  );
};

export default HoldToConfirmButton;
