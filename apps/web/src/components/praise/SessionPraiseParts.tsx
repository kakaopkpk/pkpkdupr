import React from "react";
import {
  SESSION_PRAISE_CATEGORY_LABEL,
  type SessionPraiseCategory,
} from "@pkpkdupr/shared/sessionPraise";
import { BADGE_ICON_PATHS } from "@/components/profile/AchievementBadge";
import {
  CrownIcon,
  FIST_ICON_PATHS,
  SHIELD_CHECK_ICON_PATHS,
  TrophyIcon,
} from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";

/** 선 아이콘(방패·화살표·공) 공통 svg */
const StrokeIcon: React.FC<{
  size: number;
  strokeWidth: number;
  children: React.ReactNode;
}> = ({ size, strokeWidth, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
  >
    {children}
  </svg>
);

/** 칭찬 분류 아이콘: 주먹·개·반창고·방패·오르는 화살표·왕관·트로피·공 */
export const SessionPraiseCategoryIcon: React.FC<{
  category: SessionPraiseCategory;
  size: number;
}> = ({ category, size }) => {
  switch (category) {
    case "dominator":
      return <CrownIcon className="shrink-0" size={size} />;
    case "revenge":
      return (
        <StrokeIcon size={size} strokeWidth={2.4}>
          {FIST_ICON_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </StrokeIcon>
      );
    case "underdog":
      return (
        <StrokeIcon size={size} strokeWidth={2.2}>
          {BADGE_ICON_PATHS.dog}
        </StrokeIcon>
      );
    case "clutch":
      return (
        <StrokeIcon size={size} strokeWidth={2.2}>
          {BADGE_ICON_PATHS.bandage}
        </StrokeIcon>
      );
    case "streakGuard":
      return (
        <StrokeIcon size={size} strokeWidth={2.6}>
          {SHIELD_CHECK_ICON_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </StrokeIcon>
      );
    case "mostWins":
      return <TrophyIcon size={size} strokeWidth={2.4} />;
    case "rankJump":
      return (
        <StrokeIcon size={size} strokeWidth={2.8}>
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M15 7h6v6" />
        </StrokeIcon>
      );
    case "mostPoints":
      // 작은 크기에서도 보이도록 구멍을 셋만 크게 둔 피클볼 공
      return (
        <StrokeIcon size={size} strokeWidth={2.6}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="8.4" cy="13.6" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15.6" cy="13.6" r="1.2" fill="currentColor" stroke="none" />
        </StrokeIcon>
      );
  }
};

const CHIP_SIZE_CLASS_NAME = {
  // 팝업 카드
  md: "px-2.5 py-[5px]",
  // 세션 상세 칭찬 줄
  sm: "px-2 py-[3px]",
} as const;

const CHIP_ICON_SIZE = { md: 12, sm: 11 } as const;

/**
 * 칭찬 분류 칩: 앰버 바탕·잉크 글자 + 분류 아이콘, 한 줄 고정.
 * hideIconWhenNarrow면 375px 미만에서 아이콘을 뺀다(팝업 카드)
 */
export const SessionPraiseCategoryChip: React.FC<{
  category: SessionPraiseCategory;
  size: keyof typeof CHIP_SIZE_CLASS_NAME;
  hideIconWhenNarrow?: boolean;
  className?: string;
}> = ({ category, size, hideIconWhenNarrow = false, className }) => (
  <span
    className={cx(
      "inline-flex shrink-0 items-center gap-[3px] rounded-full bg-pk-hl text-pk-12 leading-none font-extrabold whitespace-nowrap text-pk-ink",
      CHIP_SIZE_CLASS_NAME[size],
      className,
    )}
  >
    <span className={cx("inline-flex", hideIconWhenNarrow && "max-[374px]:hidden")}>
      <SessionPraiseCategoryIcon category={category} size={CHIP_ICON_SIZE[size]} />
    </span>
    {SESSION_PRAISE_CATEGORY_LABEL[category]}
  </span>
);
