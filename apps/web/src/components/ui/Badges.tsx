import React from "react";
import { CrownIcon } from "./Icons";
import { cx } from "./cx";

// 간격(gap)은 칩마다 달라 여기 넣지 않는다
const highlightClassName =
  "inline-flex shrink-0 items-center rounded-full bg-pk-hl px-2.5 py-[5px] text-pk-12 font-extrabold leading-none text-pk-ink inset-ring inset-ring-pk-ink/25";

/** "● LIVE" 하이라이트 알약 */
export const LivePill: React.FC = () => (
  <span className={cx(highlightClassName, "gap-1.5")}>
    <span aria-hidden="true" className="size-[7px] rounded-full bg-pk-ink" />
    LIVE
  </span>
);

/** 채운 왕관 + "세션 지배자" 노랑 칩. 왕관과 글자는 3px 간격 */
export const SessionDominatorBadge: React.FC = () => (
  <span className={cx(highlightClassName, "gap-[3px]")}>
    <CrownIcon />
    세션 지배자
  </span>
);
