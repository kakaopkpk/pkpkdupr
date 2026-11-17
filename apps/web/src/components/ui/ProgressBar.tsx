import React from "react";
import { cx } from "./cx";

/** 회색 바탕에 파랑으로 차는 진행 막대. ratio는 0~1, 높이·폭은 className으로 정한다 */
export const ProgressBar: React.FC<{ ratio: number; className?: string }> = ({
  ratio,
  className,
}) => (
  <span
    aria-hidden="true"
    className={cx("block overflow-hidden rounded-full bg-pk-neutral", className)}
  >
    <span
      className="block h-full rounded-full bg-pk-primary"
      style={{ width: `${ratio * 100}%` }}
    />
  </span>
);

export default ProgressBar;
