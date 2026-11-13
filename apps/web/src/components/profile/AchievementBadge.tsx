import React from "react";
import type { AchievementDefinition } from "@pkpkdupr/shared/achievements";
import { cx } from "@/components/ui/cx";

const EARNED_COLOR = "var(--color-pk-primary)";
const EARNED_ICON = "var(--color-white)";
const UNEARNED_FILL = "var(--color-pk-neutral)";
const UNEARNED_ICON = "var(--color-pk-quiet)";
// 못 받은 배지 숫자 꼬리표 테두리
const UNEARNED_TAG_BORDER = "var(--color-pk-line)";

type BadgeIconKind =
  | "ball"
  | "trophy"
  | "flame"
  | "shield"
  | "bandage"
  | "stamp"
  | "partners"
  | "calendar"
  | "dumbbell"
  | "heart"
  | "group"
  | "versus"
  | "target"
  | "fist"
  | "star"
  | "crown";

/** 24 viewBox 선 아이콘. 글자는 아이콘 색(currentColor)으로 채운다 */
const BADGE_ICON_PATHS: Record<BadgeIconKind, React.ReactNode> = {
  // 피클볼 공(구멍 뚫린 공)
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="7.6" r=".5" />
      <circle cx="8" cy="10.4" r=".5" />
      <circle cx="16" cy="10.4" r=".5" />
      <circle cx="12" cy="12.3" r=".5" />
      <circle cx="9.4" cy="15.6" r=".5" />
      <circle cx="14.6" cy="15.6" r=".5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5.5a2.5 2.5 0 0 0 2.5 4M16 6h2.5a2.5 2.5 0 0 1-2.5 4M12 13v4M9 20h6" />
    </>
  ),
  flame: (
    <path d="M12 3c1 3 4.5 4.5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2.2 1-3.5 2.2-4.5 0 2 .8 3 1.8 3 0-3-1-5.2.5-8z" />
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  bandage: (
    <>
      <path d="M7.98 20.98L20.98 7.98A3.5 3.5 0 0 0 16.03 3.03L3.03 16.03A3.5 3.5 0 0 0 7.98 20.98Z" />
      <path d="M11.65 7.41L16.6 12.35M7.41 11.65L12.35 16.6" />
      <circle cx="13.7" cy="12" r=".5" />
      <circle cx="10.3" cy="12" r=".5" />
      <circle cx="12" cy="10.3" r=".5" />
      <circle cx="12" cy="13.7" r=".5" />
    </>
  ),
  stamp: (
    <>
      <circle cx="12" cy="12" r="9" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="11"
        fontWeight="900"
        fontFamily="serif"
        stroke="none"
        fill="currentColor"
      >
        勝
      </text>
    </>
  ),
  partners: (
    <>
      <circle cx="8.5" cy="9" r="3" />
      <circle cx="15.5" cy="9" r="3" />
      <path d="M3.5 19c.8-2.8 2.7-4.3 5-4.3s4.2 1.5 5 4.3M10.5 19c.8-2.8 2.7-4.3 5-4.3s4.2 1.5 5 4.3" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4M9 15l2 2 4-4" />
    </>
  ),
  dumbbell: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  heart: (
    <path d="M12 19.5s-7-4.3-7-9.7A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7 2.2c0 5.4-7 9.7-7 9.7z" />
  ),
  group: (
    <>
      <circle cx="12" cy="8" r="2.8" />
      <circle cx="5.5" cy="10" r="2.2" />
      <circle cx="18.5" cy="10" r="2.2" />
      <path d="M7.5 19c.6-2.9 2.3-4.5 4.5-4.5s3.9 1.6 4.5 4.5M2.5 18c.4-1.9 1.5-3 3-3.2M21.5 18c-.4-1.9-1.5-3-3-3.2" />
    </>
  ),
  versus: (
    <path d="M5 4l9.5 9.5M19 4L9.5 13.5M4 15.5l4.5 4.5M20 15.5L15.5 20M6.5 18L11 13.5M17.5 18L13 13.5" />
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  fist: (
    <>
      <path d="M6 10.5V8.2a1.7 1.7 0 0 1 3.4 0v1.8M9.4 9.6V7.2a1.7 1.7 0 0 1 3.4 0v2.4M12.8 9.6V7.6a1.7 1.7 0 0 1 3.4 0V10M16.2 10.2V9a1.7 1.7 0 0 1 3.4 0v4.3a6.6 6.6 0 0 1-6.6 6.6h-.4A6.6 6.6 0 0 1 6 13.3v-2.8" />
      <path d="M6 12.4h5.6a2 2 0 0 1 0 4H9.4" />
    </>
  ),
  star: (
    <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
  ),
  crown: (
    <>
      <path d="M4 8l4 3.5L12 5l4 6.5L20 8l-1.5 8.5h-13z" />
      <path d="M5.5 20h13" />
    </>
  ),
};

/** 특별·세션 분류는 업적마다 아이콘이 다르다 */
const BADGE_ICON_BY_ID: Partial<Record<string, BadgeIconKind>> = {
  "perfect-win": "shield",
  "hard-won": "bandage",
  "deuce-master": "stamp",
  "partner-20": "partners",
  "partner-50": "partners",
  "combo-5": "heart",
  "social-10": "group",
  "rival-20": "versus",
  "dojo-15": "target",
  revenge: "fist",
  "iron-8": "dumbbell",
  "unbeaten-session": "star",
  "dominator-1": "crown",
  "dominator-10": "crown",
};

const BADGE_ICON_BY_CATEGORY: Record<
  AchievementDefinition["category"],
  BadgeIconKind
> = {
  matches: "ball",
  wins: "trophy",
  streak: "flame",
  special: "shield",
  session: "calendar",
};

export interface AchievementBadgeProps {
  achievement: AchievementDefinition;
  earned: boolean;
  /** 기본 48 */
  size?: number;
  className?: string;
}

/** 육각 업적 배지. 받으면 파랑, 못 받으면 회색이고 badgeNumber가 있으면 아래에 숫자 꼬리표를 단다 */
export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  achievement,
  earned,
  size = 48,
  className,
}) => {
  const hexColor = earned ? EARNED_COLOR : UNEARNED_FILL;
  const iconSize = Math.round(size * 0.46);
  const iconKind =
    BADGE_ICON_BY_ID[achievement.id] ??
    BADGE_ICON_BY_CATEGORY[achievement.category];

  return (
    <span
      aria-hidden="true"
      className={cx("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" className="block">
        <polygon
          points="24,4 41.5,14 41.5,34 24,44 6.5,34 6.5,14"
          fill={hexColor}
          stroke={hexColor}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </svg>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke={earned ? EARNED_ICON : UNEARNED_ICON}
        color={earned ? EARNED_ICON : UNEARNED_ICON}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        {BADGE_ICON_PATHS[iconKind]}
      </svg>
      {achievement.badgeNumber != null ? (
        <span
          className={cx(
            "absolute -bottom-[5px] left-1/2 flex h-[17px] min-w-5 -translate-x-1/2 items-center justify-center rounded-full bg-white px-[5px] text-pk-12 leading-none font-extrabold tabular-nums",
            earned ? "text-pk-primary" : "text-pk-muted",
          )}
          style={{
            boxShadow: `inset 0 0 0 1.5px ${earned ? EARNED_COLOR : UNEARNED_TAG_BORDER}`,
          }}
        >
          {achievement.badgeNumber}
        </span>
      ) : null}
    </span>
  );
};

export default AchievementBadge;
