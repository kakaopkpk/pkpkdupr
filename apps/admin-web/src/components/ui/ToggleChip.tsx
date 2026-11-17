import React from "react";
import { cx } from "./cx";

/** 켜고 끄는 알약 필터. 꺼지면 흰 바탕, 켜지면 블루 계열이다. */
export const ToggleChip: React.FC<{
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: React.ReactNode;
  className?: string;
}> = ({ pressed, onChange, children, className }) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={() => onChange(!pressed)}
    className={cx(
      "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-pk-13 font-bold transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pk-primary",
      pressed
        ? "border-pk-primary-line bg-pk-primary-soft text-pk-primary"
        : "border-pk-divider bg-white text-pk-sub hover:text-pk-ink",
      className,
    )}
  >
    {children}
  </button>
);
