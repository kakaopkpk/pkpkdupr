import React from "react";
import { cx } from "./cx";

const MEDAL_CLASS_NAMES = ["bg-pk-gold", "bg-pk-silver", "bg-pk-bronze"];

/** 1·2·3위는 금·은·동 원 안 잉크색 숫자, 4위 이하는 회색 숫자 */
export const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  const medalClassName = MEDAL_CLASS_NAMES[rank - 1];
  return (
    <span
      className={cx(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-pk-13 font-extrabold tabular-nums",
        medalClassName ? cx(medalClassName, "text-pk-ink") : "text-pk-muted",
      )}
    >
      {rank}
    </span>
  );
};
