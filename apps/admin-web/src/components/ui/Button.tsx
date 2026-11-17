import React from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "soft" | "outline" | "ghost";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 기본 "primary" */
  variant?: ButtonVariant;
  /** sm 32px, md 40px(기본) */
  size?: "sm" | "md";
  ref?: React.Ref<HTMLButtonElement>;
}

// 버튼은 블루 계열만 쓴다. 위험 작업은 outline이고, 실행은 확인 대화상자의 primary로 한다.
const variantClassName: Record<ButtonVariant, string> = {
  primary: "bg-pk-primary text-white enabled:hover:bg-pk-deep",
  soft: "bg-pk-primary-soft text-pk-primary enabled:hover:bg-pk-primary-line/50",
  outline:
    "border border-pk-primary-line bg-white text-pk-primary enabled:hover:bg-pk-primary-soft",
  ghost: "bg-transparent text-pk-sub enabled:hover:bg-pk-bg",
};

const sizeClassName: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...rest
}) => (
  <button
    type={type}
    className={cx(
      "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-pk-sm text-pk-13 font-bold transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pk-primary",
      "disabled:cursor-not-allowed",
      variantClassName[variant],
      variant === "ghost"
        ? "disabled:text-pk-quiet"
        : "disabled:border-transparent disabled:bg-pk-neutral disabled:text-pk-muted",
      sizeClassName[size],
      className,
    )}
    {...rest}
  />
);
