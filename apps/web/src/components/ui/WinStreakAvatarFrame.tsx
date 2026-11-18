import React from "react";
import { WIN_STREAK_DISPLAY_MIN } from "@pkpkdupr/shared/streak";
import { cx } from "./cx";

/** 업적 배지 연승 아이콘과 같은 불꽃 모양 */
const FlameIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className="shrink-0"
  >
    <path d="M12 3c1 3 4.5 4.5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2.2 1-3.5 2.2-4.5 0 2 .8 3 1.8 3 0-3-1-5.2.5-8z" />
  </svg>
);

const TAG_CLASS_NAME = {
  // 랭킹 줄 아바타 32: 숫자만
  sm: "-bottom-[7px] h-[15px] pr-1 pl-[3px]",
  // 프로필 머리 아바타 56: "N연승"
  lg: "-bottom-[9px] h-5 pr-[7px] pl-[5px]",
} as const;

export const isWinStreakShown = (winStreak: number | null | undefined) =>
  !!winStreak && winStreak >= WIN_STREAK_DISPLAY_MIN;

/** 연승 단계: 5~9 → 1, 10~19 → 2, 20 이상 → 3. 단계가 오를수록 링이 굵어지고 3단계는 앰버 빛이 붙는다 */
const getStreakTier = (winStreak: number): 1 | 2 | 3 =>
  winStreak >= 20 ? 3 : winStreak >= 10 ? 2 : 1;

/** 크기별 흰 틈과 단계별 링 굵기(px) */
const RING_SIZE = {
  sm: { gap: 1.5, ring: [2, 3, 4] },
  lg: { gap: 2, ring: [2.5, 3.5, 4.5] },
} as const;

/**
 * 연승 중(WIN_STREAK_DISPLAY_MIN 이상)인 회원 아바타를 단계별 굵기의 하이라이트(앰버) 링(움직임 없음)으로 감싸고,
 * 아바타 아래 가운데에 앰버 바탕·잉크 글자의 불꽃 + 연승 태그를 붙인다. 연승이 모자라면 아바타만 그린다.
 */
export const WinStreakAvatarFrame: React.FC<{
  winStreak: number | null | undefined;
  size: "sm" | "lg";
  children: React.ReactNode;
}> = ({ winStreak, size, children }) => {
  if (!winStreak || !isWinStreakShown(winStreak)) return <>{children}</>;
  const tier = getStreakTier(winStreak);
  const { gap, ring } = RING_SIZE[size];
  return (
    <span
      className="pk-streak-ring shrink-0"
      data-glow={tier === 3 ? "" : undefined}
      style={
        {
          "--pk-streak-gap": `${gap}px`,
          "--pk-streak-ring": `${ring[tier - 1]}px`,
        } as React.CSSProperties
      }
    >
      {children}
      <span
        aria-label={`${winStreak}연승 중`}
        className={cx(
          "absolute left-1/2 inline-flex -translate-x-1/2 items-center gap-px rounded-full bg-pk-hl text-pk-12 leading-none font-extrabold whitespace-nowrap text-pk-ink tabular-nums shadow-[0_0_0_2px_var(--color-white)]",
          TAG_CLASS_NAME[size],
        )}
      >
        <FlameIcon size={size === "sm" ? 10 : 12} />
        {size === "sm" ? winStreak : `${winStreak}연승`}
      </span>
    </span>
  );
};
