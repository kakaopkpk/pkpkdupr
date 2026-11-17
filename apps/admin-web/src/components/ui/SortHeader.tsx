import React from "react";
import { cx } from "./cx";

/** 표 머리 정렬 버튼. th 안에 넣는다. */
export const SortHeader: React.FC<{
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}> = ({ label, active, direction, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      "inline-flex items-center gap-1 text-pk-12 font-semibold hover:text-pk-ink",
      active ? "text-pk-ink" : "text-pk-sub",
    )}
  >
    {label}
    <span aria-hidden="true" className={cx("text-pk-12", !active && "text-pk-quiet")}>
      {active && direction === "asc" ? "▲" : "▼"}
    </span>
  </button>
);
