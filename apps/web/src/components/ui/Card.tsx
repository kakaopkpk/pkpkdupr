import React from "react";
import { cx } from "./cx";

/** 흰 카드, 테두리 없음, 둥글기 20 */
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <article className={cx("rounded-pk-lg bg-white px-4 py-1", className)}>
    {children}
  </article>
);
