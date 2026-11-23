import React from "react";
import {
  isLowRatingAchievement,
  type AchievementDefinition,
} from "@pkpkdupr/shared/achievements";
import {
  CROSSED_SWORDS_ICON_PATHS,
  FIST_ICON_PATHS,
  FLAME_ICON_PATH,
  SHIELD_CHECK_ICON_PATHS,
  STOP_HAND_ICON_PATHS,
  THUMB_UP_ICON_PATHS,
} from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";

const EARNED_COLOR = "var(--color-pk-primary)";
// 낮은 평점 업적(심해 탐사·마리아나 해구)은 받은 배지를 짙은 남색으로 구분한다
const EARNED_DEEP_COLOR = "var(--color-pk-deep)";
const EARNED_ICON = "var(--color-white)";
const UNEARNED_FILL = "var(--color-pk-neutral)";
const UNEARNED_ICON = "var(--color-pk-quiet)";
// 못 받은 배지 숫자 꼬리표 테두리
const UNEARNED_TAG_BORDER = "var(--color-pk-line)";
// 이 크기 이상(업적 축하 연출)이면 숫자 꼬리표도 키운다
const LARGE_BADGE_MIN_SIZE = 96;

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
  | "crown"
  | "sunrise"
  | "cloud"
  | "balloon"
  | "rocket"
  | "submarine"
  | "trench"
  | "dog"
  | "stopHand"
  | "handshake"
  | "rosette"
  | "shark"
  | "thumbUp";

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
    <path d={FLAME_ICON_PATH} />
  ),
  shield: (
    <>
      {SHIELD_CHECK_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
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
    <>
      {CROSSED_SWORDS_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </>
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
      {FIST_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
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
  // 수평선 위 해돋이(물결 위 반쪽 해와 햇살)
  sunrise: (
    <>
      <path d="M3 18.5c1.5 0 1.5-1.2 3-1.2s1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2" />
      <path d="M7 14a5 5 0 0 1 10 0" />
      <path d="M12 4.5v2M5.6 7.6L7 9M18.4 7.6L17 9M3.5 14H5M19 14h1.5" />
    </>
  ),
  cloud: (
    <path d="M7.5 18.5h9a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 10.6 4 4 0 0 0 7.5 18.5z" />
  ),
  // 열기구
  balloon: (
    <>
      <path d="M12 3a6.5 6.5 0 0 0-6.5 6.5c0 3.4 3.3 5.6 4.5 7.5h4c1.2-1.9 4.5-4.1 4.5-7.5A6.5 6.5 0 0 0 12 3z" />
      <path d="M12 3c-1.8 1.6-2.6 4-2.6 6.5S10.4 15 10 17M12 3c1.8 1.6 2.6 4 2.6 6.5S13.6 15 14 17" />
      <path d="M10 17v2M14 17v2M9.8 19h4.4v2.2H9.8z" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.5c2.8 1.8 4.3 5 4.3 8.8L14.2 15H9.8l-2.1-3.7C7.7 7.5 9.2 4.3 12 2.5z" />
      <circle cx="12" cy="9" r="1.6" />
      <path d="M9.8 13.5l-3 3 .2 2.5 3-1.5M14.2 13.5l3 3-.2 2.5-3-1.5" />
      <path d="M10.8 17.5L12 21l1.2-3.5" />
    </>
  ),
  submarine: (
    <>
      <path d="M3.5 14a5 3.5 0 0 0 5 3.5h7a3.5 3.5 0 0 0 0-7h-7a5 3.5 0 0 0-5 3.5z" />
      <path d="M9 10.5V8h4v2.5M11 8V5.5h2M20.5 12v4" />
      <circle cx="9.5" cy="14" r="1" />
      <circle cx="13.5" cy="14" r="1" />
    </>
  ),
  // 해구 단면: 평평한 해저 가운데가 좁고 깊게 꺼진 선
  trench: <path d="M2.5 6.5h3.5l1.5 2.5 3 11.5h3l3-11.5 1.5-2.5h3.5" />,
  // 오른쪽을 보는 처진 귀 개 얼굴 옆모습
  dog: (
    <>
      <path d="M7 20c-1.8-3.3-2.7-7.6-1.5-11.5C6.5 5 9 3.5 12 3.5c2 0 3.5 1 4 3l3.5 1.5c1 .4 1.4 1.4 1.2 2.4l-.2 1.1c-.2.9-1 1.3-2 1.3H16c-.8 1.7-2 2.7-3.5 3.2L13 20" />
      <path d="M10 4.5c-1.8 1.5-2.5 4.5-1.8 8.5.8-.2 1.7-.8 2.3-1.8" />
      <path d="M16 12.8c.8-.2 1.6-.6 2-1.2" />
      <circle cx="13.5" cy="7.5" r=".7" />
      <circle cx="20.1" cy="9.3" r=".8" />
    </>
  ),
  // 멈춤 손바닥
  stopHand: (
    <>
      {STOP_HAND_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </>
  ),
  handshake: (
    <>
      <path d="M11 17l2 2a1 1 0 1 0 3-3" />
      <path d="M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
      <path d="M21 3l1 11h-2" />
      <path d="M3 3L2 14l6.5 6.5a1 1 0 1 0 3-3" />
      <path d="M3 4h8" />
    </>
  ),
  // 리본 꼬리가 달린 상장 로제트
  rosette: (
    <>
      <path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5" />
      <circle cx="12" cy="9" r="5.5" />
      <circle cx="12" cy="9" r="2" />
    </>
  ),
  // 물결 위 상어 지느러미
  shark: (
    <>
      <path d="M2.5 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5" />
      <path d="M7 15.5C9 10 12 6 17 4.5c-1 4-1 8 .5 11" />
    </>
  ),
  // 엄지 척(칭찬)
  thumbUp: (
    <>
      {THUMB_UP_ICON_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </>
  ),
};

/** 특별·세션·평점 분류와 연승 저지는 업적마다 아이콘이 다르다 */
const BADGE_ICON_BY_ID: Partial<Record<string, BadgeIconKind>> = {
  "perfect-win": "shield",
  "hard-won": "bandage",
  "deuce-master": "stamp",
  "partner-20": "partners",
  "partner-50": "partners",
  "combo-5": "heart",
  "social-10": "group",
  "rival-20": "versus",
  "nemesis-10": "shark",
  "dojo-15": "target",
  underdog: "dog",
  welcome: "handshake",
  "streak-breaker": "stopHand",
  "regular-streak-8": "rosette",
  revenge: "fist",
  "revenge-5": "fist",
  "iron-8": "dumbbell",
  "unbeaten-session": "star",
  "dominator-1": "crown",
  "dominator-10": "crown",
  "praised-1": "thumbUp",
  "praised-10": "thumbUp",
  "rating-3.0": "sunrise",
  "rating-3.5": "cloud",
  "rating-4.0": "balloon",
  "rating-4.5": "rocket",
  "rating-low-2.5": "submarine",
  "rating-low-2.0": "trench",
};

const BADGE_ICON_BY_CATEGORY: Record<
  AchievementDefinition["category"],
  BadgeIconKind
> = {
  matches: "ball",
  wins: "trophy",
  streak: "flame",
  rating: "sunrise",
  special: "shield",
  session: "calendar",
};

const getBadgeIconKind = (achievement: AchievementDefinition): BadgeIconKind =>
  BADGE_ICON_BY_ID[achievement.id] ?? BADGE_ICON_BY_CATEGORY[achievement.category];

/** 48 viewBox 육각형 꼭짓점. 업적 공유 이미지도 같은 모양을 그린다 */
export const BADGE_HEX_POINTS = "24,4 41.5,14 41.5,34 24,44 6.5,34 6.5,14";
/** 배지 크기 대비 아이콘 크기 */
export const BADGE_ICON_RATIO = 0.46;

/** 업적 아이콘의 24 viewBox 선 모양(바깥 svg의 stroke·color를 따른다) */
export const AchievementBadgeIconPaths: React.FC<{
  achievement: AchievementDefinition;
}> = ({ achievement }) => <>{BADGE_ICON_PATHS[getBadgeIconKind(achievement)]}</>;

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
  const isDeep = isLowRatingAchievement(achievement.id);
  const earnedColor = isDeep ? EARNED_DEEP_COLOR : EARNED_COLOR;
  const earnedTextClass = isDeep ? "text-pk-deep" : "text-pk-primary";
  const hexColor = earned ? earnedColor : UNEARNED_FILL;
  const iconSize = Math.round(size * BADGE_ICON_RATIO);
  const isLarge = size >= LARGE_BADGE_MIN_SIZE;
  const tagBorder = earned ? earnedColor : UNEARNED_TAG_BORDER;

  return (
    <span
      aria-hidden="true"
      className={cx("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" className="block">
        <polygon
          points={BADGE_HEX_POINTS}
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
        <AchievementBadgeIconPaths achievement={achievement} />
      </svg>
      {achievement.badgeNumber != null ? (
        <span
          className={cx(
            "absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-white leading-none font-extrabold tabular-nums",
            isLarge
              ? "-bottom-[9px] h-7 min-w-9 px-[9px] text-pk-17"
              : "-bottom-[5px] h-[17px] min-w-5 px-[5px] text-pk-12",
            earned ? earnedTextClass : "text-pk-muted",
          )}
          style={{
            boxShadow: `inset 0 0 0 ${isLarge ? 2.5 : 1.5}px ${tagBorder}`,
          }}
        >
          {achievement.badgeNumber}
        </span>
      ) : null}
    </span>
  );
};

export default AchievementBadge;
