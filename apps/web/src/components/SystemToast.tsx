import React, { useLayoutEffect, useRef } from "react";
import { cx } from "@/components/ui/cx";

/** 토스트와 하단 바 사이 간격(px). 위치 클래스의 12px과 같아야 한다 */
const TOAST_DOCK_GAP_PX = 12;

/**
 * 하단 바 위에 뜨는 흰 토스트. 화면당 한 번에 하나만 보인다.
 * card(기본): 흰 카드. pill: 높이 56px 반투명 흰 유리 알약(일반 알림 토스트)
 */
const SystemToast: React.FC<{
  children: React.ReactNode;
  /** 토스트 문구 옆 버튼들 */
  actions?: React.ReactNode;
  variant?: "card" | "pill";
  className?: string;
}> = ({ children, actions, variant = "card", className }) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 탭 패널이 토스트에 가린 마지막 콘텐츠까지 스크롤되도록 떠 있는 동안 높이를 알린다
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const rootStyle = document.documentElement.style;
    const updateHeight = () => {
      rootStyle.setProperty(
        "--app-bottom-toast-height",
        `${card.offsetHeight + TOAST_DOCK_GAP_PX}px`,
      );
    };

    updateHeight();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateHeight);
    observer?.observe(card);

    return () => {
      observer?.disconnect();
      rootStyle.removeProperty("--app-bottom-toast-height");
    };
  }, []);

  return (
    <div
      className={cx(
        "pointer-events-none fixed bottom-[calc(var(--app-bottom-dock-height)+12px+var(--app-keyboard-offset))] left-1/2 app-shell-width -translate-x-1/2 px-4",
        className,
      )}
    >
      <div
        ref={cardRef}
        role="status"
        className={cx(
          "pointer-events-auto flex min-h-14 items-center gap-2 py-1.5 pl-4 shadow-[0_8px_24px] shadow-pk-ink/14",
          variant === "pill"
            ? "rounded-full bg-white/92 backdrop-blur-[20px] backdrop-saturate-[180%]"
            : "rounded-pk-lg bg-white",
          actions ? "pr-1.5" : "pr-4",
        )}
      >
        <span className="min-w-0 flex-1 text-pk-15 font-bold text-pk-ink">
          {children}
        </span>
        {actions}
      </div>
    </div>
  );
};

export default SystemToast;
