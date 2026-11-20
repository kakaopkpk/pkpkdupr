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
  ref?: React.Ref<HTMLButtonElement>;
}

/*
 * 누름 피드백은 축소 + 투명도 0.8 하나다(바탕색은 누름 영역 모양이 드러나서 쓰지 않는다).
 * 120ms 이동 곡선, 비활성은 반응하지 않고, 움직임 줄이기면 축소 없이 투명도만 바뀐다.
 * 안의 버튼을 누르는 동안은 바깥(누를 수 있는 카드)이 함께 반응하지 않는다.
 */

/** 버튼·아이콘 버튼·글자 버튼 누름 피드백: scale 0.97 */
export const buttonPressClassName =
  "transition-[scale,opacity] duration-[120ms] ease-pk-move not-disabled:active:not-has-[button:active]:opacity-80 motion-safe:not-disabled:active:not-has-[button:active]:scale-[0.97]";

/** 목록 줄·카드 누름 피드백: 큰 요소라 scale 0.985로 덜 줄어든다 */
export const rowPressClassName =
  "transition-[scale,opacity] duration-[120ms] ease-pk-move not-disabled:active:not-has-[button:active]:opacity-80 motion-safe:not-disabled:active:not-has-[button:active]:scale-[0.985]";

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
