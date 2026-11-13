import React, { useLayoutEffect, useRef } from "react";
import { cx } from "@/components/ui/cx";
import {
  PRESENCE_ENTER_CLASS,
  PRESENCE_EXIT_CLASS,
} from "@/hooks/usePresence";

/** 토스트와 하단 바 사이 간격(px) */
const TOAST_DOCK_GAP_PX = 12;

/** 미니바·알림 바가 없을 때의 하단 바 윗변 높이. index.css의 --app-bottom-dock-height 기본값과 같아야 한다 */
const BASE_DOCK_HEIGHT = "66px + 8px + var(--safe-bottom)";

/**
 * 위치(bottom)는 기본 하단 바 윗변에 고정하고, 바 높이 변화만큼 transform으로 올린다.
 * 바가 나타나거나 사라지면 이 transform이 transition으로 새 자리까지 움직인다.
 */
const TOAST_POSITION_STYLE: React.CSSProperties = {
  bottom: `calc(${BASE_DOCK_HEIGHT} + ${TOAST_DOCK_GAP_PX}px + var(--app-keyboard-offset))`,
  transform: `translateY(calc(${BASE_DOCK_HEIGHT} - var(--app-bottom-dock-height)))`,
};

/**
 * 하단 바 위에 뜨는 흰 토스트. 화면당 한 번에 하나만 보인다.
 * card(기본): 흰 카드. pill: 높이 56px 반투명 흰 유리 알약(일반 알림 토스트)
 * 마운트되면 아래에서 올라오며 나타나고, isExiting이면 가라앉으며 사라진다(언마운트는 호출부가 usePresence로 늦춘다).
 */
const SystemToast: React.FC<{
  children: React.ReactNode;
  /** 토스트 문구 옆 버튼들 */
  actions?: React.ReactNode;
  variant?: "card" | "pill";
  /** 퇴장 애니메이션 중. 누를 수 없고 --app-bottom-toast-height를 알리지 않는다 */
  isExiting?: boolean;
  className?: string;
}> = ({ children, actions, variant = "card", isExiting = false, className }) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 탭 패널이 토스트에 가린 마지막 콘텐츠까지 스크롤되도록 떠 있는 동안 높이를 알린다
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || isExiting) return;

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
  }, [isExiting]);

  return (
    <div
      style={TOAST_POSITION_STYLE}
      className={cx(
        "pointer-events-none fixed left-1/2 app-shell-width -translate-x-1/2 px-4 transition-transform duration-[320ms] ease-pk-move motion-reduce:transition-none",
        className,
      )}
    >
      {/* 등장·퇴장은 유리(backdrop-blur) 카드 자신에 건다 */}
      <div
        ref={cardRef}
        role="status"
        inert={isExiting}
        className={cx(
          "flex min-h-14 items-center gap-2 py-1.5 pl-4 shadow-[0_8px_24px] shadow-pk-ink/14",
          isExiting
            ? cx("pointer-events-none", PRESENCE_EXIT_CLASS)
            : cx("pointer-events-auto", PRESENCE_ENTER_CLASS),
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
