import React from "react";
import { cx } from "@/components/ui/cx";

/** 하단 바 위에 뜨는 흰 토스트 카드. 화면당 한 번에 하나만 보인다 */
const SystemToast: React.FC<{
  children: React.ReactNode;
  /** 토스트 문구 옆 버튼들 */
  actions: React.ReactNode;
  className?: string;
}> = ({ children, actions, className }) => (
  <div
    className={cx(
      "pointer-events-none fixed bottom-[calc(var(--app-bottom-dock-height)+12px+var(--app-keyboard-offset))] left-1/2 app-shell-width -translate-x-1/2 px-4",
      className,
    )}
  >
    <div
      role="status"
      className="pointer-events-auto flex min-h-14 items-center gap-2 rounded-pk-lg bg-white py-1.5 pl-4 pr-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.14)]"
    >
      <span className="min-w-0 flex-1 text-pk-15 font-bold text-pk-ink">
        {children}
      </span>
      {actions}
    </div>
  </div>
);

export default SystemToast;
