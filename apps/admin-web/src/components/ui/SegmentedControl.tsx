import React from "react";
import { cx } from "./cx";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx(
        "inline-flex shrink-0 items-center rounded-pk-sm bg-pk-neutral p-[3px]",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              // 바깥 12px에서 안쪽 여백 3px을 뺀 둥글기
              "inline-flex h-[34px] items-center justify-center whitespace-nowrap rounded-[9px] px-3.5 text-pk-13 font-bold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-pk-primary",
              selected
                ? "bg-white text-pk-ink"
                : "text-pk-sub hover:text-pk-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
