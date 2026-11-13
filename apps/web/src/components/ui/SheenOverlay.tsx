import React from "react";

/**
 * 왼쪽에서 오른쪽으로 한 번 지나가는 흰 빛(animate-pk-sheen).
 * 부모가 relative·overflow-hidden이어야 빛이 부모 모양 밖으로 넘치지 않는다. 움직임 줄이기면 보이지 않는다
 */
export const SheenOverlay: React.FC<{ delayMs?: number; durationMs?: number }> = ({
  delayMs,
  durationMs,
}) => (
  <span
    aria-hidden="true"
    style={{
      animationDelay: delayMs === undefined ? undefined : `${delayMs}ms`,
      animationDuration: durationMs === undefined ? undefined : `${durationMs}ms`,
    }}
    className="pointer-events-none absolute inset-0 animate-pk-sheen bg-linear-to-r from-transparent via-white/70 to-transparent motion-reduce:hidden"
  />
);
