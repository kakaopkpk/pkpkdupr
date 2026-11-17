import React from "react";
import { CrownIcon } from "./Icons";
import { SheenOverlay } from "./SheenOverlay";
import { cx } from "./cx";

// 간격(gap)은 칩마다 달라 여기 넣지 않는다
const highlightClassName =
  "inline-flex shrink-0 items-center rounded-full bg-pk-hl px-2.5 py-[5px] text-pk-12 font-extrabold leading-none text-pk-ink inset-ring inset-ring-pk-ink/25";

/** "● LIVE" 하이라이트 알약 */
export const LivePill: React.FC = () => (
  <span className={cx(highlightClassName, "gap-1.5")}>
    {/* 점과 같은 색 고리가 퍼지며 사라지기를 반복한다. 고리는 장식이라 움직임 줄이기면 숨긴다 */}
    <span aria-hidden="true" className="relative size-[7px]">
      <span className="absolute inset-0 animate-pk-ping rounded-full bg-pk-ink motion-reduce:hidden" />
      <span className="absolute inset-0 rounded-full bg-pk-ink" />
    </span>
    LIVE
  </span>
);

/** 왕관 까딱임 시작(ms). 지배자 카드가 보이는 순간부터 잰다 */
const CROWN_WOBBLE_DELAY_MS = 200;
/** 칩 흰 빛 시작·길이(ms). 칩 연출 중 가장 늦게 끝난다 */
const BADGE_SHEEN_DELAY_MS = 300;
const BADGE_SHEEN_DURATION_MS = 800;

/**
 * 채운 왕관 + "세션 지배자" 노랑 칩. 왕관과 글자는 3px 간격.
 * isPlaying이면 왕관이 아래 가운데를 기준으로 한 번 까딱이고 칩 위로 흰 빛이 한 번 지나간다(끝은 pk-sheen의 animationend)
 */
export const SessionDominatorBadge: React.FC<{ isPlaying?: boolean }> = ({
  isPlaying = false,
}) => (
  <span className={cx(highlightClassName, "relative gap-[3px] overflow-hidden")}>
    <span
      style={isPlaying ? { animationDelay: `${CROWN_WOBBLE_DELAY_MS}ms` } : undefined}
      className={cx(
        "flex shrink-0 origin-bottom",
        isPlaying && "animate-pk-wobble motion-reduce:animate-none",
      )}
    >
      <CrownIcon />
    </span>
    세션 지배자
    {isPlaying ? (
      <SheenOverlay delayMs={BADGE_SHEEN_DELAY_MS} durationMs={BADGE_SHEEN_DURATION_MS} />
    ) : null}
  </span>
);
