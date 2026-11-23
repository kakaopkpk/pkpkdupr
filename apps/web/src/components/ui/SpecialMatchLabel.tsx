import React from "react";
import {
  specialMatchKindLabels,
  type SpecialMatchKind,
} from "@pkpkdupr/shared/specialMatch";
import {
  CROSSED_SWORDS_ICON_PATHS,
  FIST_ICON_PATHS,
  FLAME_ICON_PATH,
  STOP_HAND_ICON_PATHS,
} from "./Icons";
import { cx } from "./cx";

/** 유형별 24 viewBox 선 모양. 손바닥·주먹·칼은 업적 배지와 같은 그림이다 */
const SPECIAL_MATCH_ICON_PATHS: Record<SpecialMatchKind, readonly string[]> = {
  challenge: CROSSED_SWORDS_ICON_PATHS,
  streak_stopper: STOP_HAND_ICON_PATHS,
  champions: [FLAME_ICON_PATH],
  revenge: FIST_ICON_PATHS,
};

/** 특수 매치 유형 아이콘(선). 색은 currentColor */
export const SpecialMatchIcon: React.FC<{
  kind: SpecialMatchKind;
  size?: number;
  className?: string;
}> = ({ kind, size = 14, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cx("shrink-0", className)}
  >
    {SPECIAL_MATCH_ICON_PATHS[kind].map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

/** 아이콘 + 굵은 블루 유형 이름. 진행 중 경기 카드 머리 줄·끝난 경기 줄 메타 줄에 쓴다 */
export const SpecialMatchLabel: React.FC<{
  kind: SpecialMatchKind;
  className?: string;
}> = ({ kind, className }) => (
  <span
    className={cx(
      "inline-flex shrink-0 items-center gap-0.5 text-pk-12 font-bold whitespace-nowrap text-pk-primary",
      className,
    )}
  >
    <SpecialMatchIcon kind={kind} size={13} />
    {specialMatchKindLabels[kind]}
  </span>
);
