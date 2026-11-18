import React from "react";
import { resolveStatusMessageColor } from "@/lib/statusMessagePalette";

/** 회원이 고른 배경색의 한 줄 상태메시지 칩. 프로필 머리·랭킹 줄·상태메시지 미리보기가 같은 크기를 쓴다 */
export const StatusMessageChip: React.FC<{
  message: string;
  color?: string | null;
}> = ({ message, color }) => {
  const { bg, fg } = resolveStatusMessageColor(color);
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-2 py-px text-pk-12 font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      {message}
    </span>
  );
};
