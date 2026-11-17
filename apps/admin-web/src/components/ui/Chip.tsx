import React from "react";
import { cx } from "./cx";

/** 상태 표시용 회색 칩. 누를 수 있는 것에는 쓰지 않는다. */
export const Chip: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <span
    className={cx(
      "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-pk-divider px-2.5 text-pk-12 font-semibold text-pk-sub",
      className,
    )}
  >
    {children}
  </span>
);
