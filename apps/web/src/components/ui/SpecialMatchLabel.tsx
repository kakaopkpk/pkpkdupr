import React from "react";
import {
  specialMatchKindLabels,
  type SpecialMatchKind,
} from "@pkpkdupr/shared/specialMatch";
import type { SpecialMatchResultIcon } from "@/lib/specialMatchResult";
import {
  CROSSED_SWORDS_ICON_PATHS,
  FIST_ICON_PATHS,
  FLAME_ICON_PATH,
  SHIELD_ICON_PATH,
  STOP_HAND_ICON_PATHS,
} from "./Icons";
import { cx } from "./cx";

/** 유형별 24 viewBox 선 모양. 손바닥·주먹·칼은 업적 배지와 같은 그림이다 */
const SPECIAL_MATCH_ICON_PATHS: Record<SpecialMatchResultIcon, readonly string[]> = {
  rival: CROSSED_SWORDS_ICON_PATHS,
  streak_stopper: STOP_HAND_ICON_PATHS,
  champions: [FLAME_ICON_PATH],
  revenge: FIST_ICON_PATHS,
  shield: [SHIELD_ICON_PATH],
};

/** 유형 아이콘 기본 크기·선 굵기. 라벨은 이름 글자(12~13)에 맞춰 LABEL_ICON_SIZE로 한 단계 작게 쓴다 */
const ICON_SIZE = 14;
const LABEL_ICON_SIZE = 13;
const ICON_STROKE_WIDTH = 2.4;

/** 특수 매치 유형 아이콘(선)과 결과 이름의 방패. 색은 currentColor */
export const SpecialMatchIcon: React.FC<{
  kind: SpecialMatchResultIcon;
  size?: number;
  className?: string;
}> = ({ kind, size = ICON_SIZE, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={ICON_STROKE_WIDTH}
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
    <SpecialMatchIcon kind={kind} size={LABEL_ICON_SIZE} />
    {specialMatchKindLabels[kind]}
  </span>
);
