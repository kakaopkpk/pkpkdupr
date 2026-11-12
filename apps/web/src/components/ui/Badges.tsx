import React from "react";

const highlightClassName =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-pk-hl px-2.5 py-[5px] text-pk-12 font-extrabold leading-none text-pk-ink";

/** "● LIVE" 하이라이트 알약 */
export const LivePill: React.FC = () => (
  <span className={highlightClassName}>
    <span aria-hidden="true" className="size-[7px] rounded-full bg-pk-ink" />
    LIVE
  </span>
);

/** 하이라이트 배지(오늘의 급상승 등) */
export const HighlightBadge: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <span className={highlightClassName}>{children}</span>;
