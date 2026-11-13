import React from "react";
import { resolveStatusMessageColor } from "@/lib/statusMessagePalette";
import { cx } from "./cx";

/** md: 프로필·나 탭 머리, sm: 랭킹 줄처럼 좁은 칸 */
const SIZE_CLASS_NAMES = {
  md: "px-2.5 py-[3px] text-pk-13",
  sm: "px-2 py-px text-pk-12",
} as const;

export const StatusMessageChip: React.FC<{
  message: string;
  color?: string | null;
  size?: keyof typeof SIZE_CLASS_NAMES;
}> = ({ message, color, size = "md" }) => {
  const { bg, fg } = resolveStatusMessageColor(color);
  return (
    <span
      className={cx(
        "inline-block max-w-full truncate rounded-full font-medium",
        SIZE_CLASS_NAMES[size],
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      {message}
    </span>
  );
};
