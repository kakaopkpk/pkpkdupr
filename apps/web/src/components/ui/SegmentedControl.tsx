import React from "react";
import { cx } from "./cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** #e3e7f0 알약 바탕, 선택 항목 흰 알약 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "md" | "sm";
}): React.ReactElement {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex shrink-0 rounded-full bg-pk-neutral p-[3px]"
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => {
              if (!isSelected) onChange(option.value);
            }}
            className={cx(
              "whitespace-nowrap rounded-full text-pk-13 transition-colors",
              size === "sm" ? "h-[30px] px-3" : "h-[34px] px-3.5",
              isSelected
                ? "bg-white font-extrabold text-pk-ink shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                : "bg-transparent font-bold text-pk-sub",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
