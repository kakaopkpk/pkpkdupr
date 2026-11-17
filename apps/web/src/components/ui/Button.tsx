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

/**
 * 버튼 누름 피드백: 120ms 이동 곡선으로 살짝 줄어든다. 비활성은 줄지 않고,
 * 움직임 줄이기면 축소 대신 투명도로 누름을 알린다.
 */
export const buttonPressClassName =
  "transition-[scale,opacity] duration-[120ms] ease-pk-move motion-safe:enabled:active:scale-[0.97] motion-reduce:enabled:active:opacity-80";

/**
 * 목록 줄 누름 피드백: 기존 누름 바탕색·투명도에 더해 scale 0.985로 줄어든다.
 * 움직임 줄이기면 축소 없이 바탕색·투명도만 바뀐다.
 */
export const rowPressClassName =
  "transition-[background-color,opacity,scale] duration-[120ms] ease-pk-move motion-safe:active:scale-[0.985]";

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
      "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap touch-manipulation",
      buttonPressClassName,
      "disabled:cursor-not-allowed",
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
