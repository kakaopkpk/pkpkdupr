import React from "react";
import { formatRatingDelta } from "@/lib/format";
import { cx } from "./cx";

const getDeltaColorClassName = (value: number | null) => {
  if (value === null || value === 0) return "text-pk-muted";
  return value > 0 ? "text-pk-up" : "text-pk-down";
};

/** 평점 변화량. 상승 초록, 하락 빨강, 0·null 회색 */
export const RatingDelta: React.FC<{
  value: number | null;
  className?: string;
}> = ({ value, className }) => {
  // 소수 셋째 자리에서 0이 되는 값은 보합으로 본다
  const rounded = value === null ? null : Math.round(value * 1000) / 1000;
  return (
    <span
      className={cx(
        "text-pk-15 font-extrabold tabular-nums",
        getDeltaColorClassName(rounded),
        className,
      )}
    >
      {rounded === null ? "–" : formatRatingDelta(rounded)}
    </span>
  );
};

/** 순위 변화. 양수 ▲n 초록, 음수 ▼n 빨강, 0·null "–" 회색 */
export const RankChange: React.FC<{ value: number | null }> = ({ value }) => {
  const label =
    value === null || value === 0
      ? "–"
      : value > 0
        ? `▲${value}`
        : `▼${Math.abs(value)}`;

  return (
    <span
      className={cx(
        "text-pk-12 font-bold tabular-nums",
        getDeltaColorClassName(value),
      )}
    >
      {label}
    </span>
  );
};
