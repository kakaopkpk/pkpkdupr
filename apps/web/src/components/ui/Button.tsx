import React from "react";
import { cx } from "./cx";

export type PkButtonVariant = "primary" | "soft" | "outline" | "ghost";

export interface PkButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 기본 "primary" */
  variant?: PkButtonVariant;
  /** sm 36px 알약, md 44px, lg 52px */
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

const variantClassName: Record<PkButtonVariant, string> = {
  primary: "bg-pk-primary text-white",
  soft: "bg-pk-primary-soft text-pk-primary",
  outline: "border-[1.5px] border-pk-primary-line bg-transparent text-pk-primary",
  ghost: "bg-transparent text-pk-sub",
};

const sizeClassName: Record<NonNullable<PkButtonProps["size"]>, string> = {
  sm: "h-9 rounded-full px-[18px] text-pk-13 font-bold",
  md: "h-11 rounded-pk-sm px-4 text-pk-15 font-extrabold",
  lg: "h-[52px] rounded-pk-sm px-5 text-pk-15 font-extrabold",
};

export const PkButton: React.FC<PkButtonProps> = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  type = "button",
  className,
  ...rest
}) => (
  <button
    type={type}
    className={cx(
      "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap transition-opacity active:opacity-80 touch-manipulation",
      "disabled:cursor-not-allowed disabled:active:opacity-100",
      variantClassName[variant],
      // 비활성은 변형과 상관없이 회색 바탕
      variant !== "ghost" &&
        "disabled:border-transparent disabled:bg-pk-neutral disabled:text-pk-muted",
      variant === "ghost" && "disabled:text-pk-quiet",
      sizeClassName[size],
      fullWidth && "w-full",
      className,
    )}
    {...rest}
  />
);
