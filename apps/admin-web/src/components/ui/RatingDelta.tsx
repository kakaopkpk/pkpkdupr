import React from "react";
import { formatRatingDelta } from "../../lib/format";
import { cx } from "./cx";

/** 평점 변화. 양수 초록, 음수 빨강, 0 회색 */
export const RatingDelta: React.FC<{ value: number; className?: string }> = ({
  value,
  className,
}) => {
  const text = formatRatingDelta(value);
  const tone = text === "0.000" ? "text-pk-muted" : value > 0 ? "text-pk-up" : "text-pk-down";
  return <span className={cx("font-semibold tabular-nums", tone, className)}>{text}</span>;
};
