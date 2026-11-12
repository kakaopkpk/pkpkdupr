import React from "react";
import { resolveStatusMessageColor } from "@/lib/statusMessagePalette";

export const StatusMessageChip: React.FC<{
  message: string;
  color?: string | null;
}> = ({ message, color }) => {
  const { bg, fg } = resolveStatusMessageColor(color);
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-2.5 py-[3px] text-pk-13 font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      {message}
    </span>
  );
};
