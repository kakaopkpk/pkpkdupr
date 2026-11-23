import React from "react";
import { cx } from "./cx";

export const ChevronRightIcon: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ?? "shrink-0 text-pk-quiet"}
  >
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const BackIcon: React.FC = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

/** 채운 왕관(밑줄 포함) */
export const CrownIcon: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 14,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className ?? "shrink-0"}
  >
    <path d="M3 7l4.5 4.5L12 4l4.5 7.5L21 7l-1.6 9H4.6z" fill="currentColor" />
    <path
      d="M5 19.5h14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/** 트로피(대회 세션 칩) 선 아이콘. 몸통 → 손잡이·기둥·받침 */
const TROPHY_ICON_PATHS = [
  "M8 4h8v5a4 4 0 0 1-8 0z",
  "M8 6H5.5a2.5 2.5 0 0 0 2.5 4M16 6h2.5a2.5 2.5 0 0 1-2.5 4M12 13v4M9 20h6",
] as const;

export const TrophyIcon: React.FC<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}> = ({ size = 12, strokeWidth = 2.4, className }) => (
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
    className={className ?? "shrink-0"}
  >
    {TROPHY_ICON_PATHS.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

/** 불꽃(업적 연승 배지·연승 태그) 모양 */
export const FLAME_ICON_PATH =
  "M12 3c1 3 4.5 4.5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2.2 1-3.5 2.2-4.5 0 2 .8 3 1.8 3 0-3-1-5.2.5-8z";

/** 채운 불꽃 아이콘 */
export const FlameIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className="shrink-0"
  >
    <path d={FLAME_ICON_PATH} />
  </svg>
);

/** 검색 돋보기 */
export const SearchIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    className="shrink-0"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);

/** 회색 원 안의 흰 X (검색어 지우기) */
export const ClearIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path
      d="M8.5 8.5l7 7M15.5 8.5l-7 7"
      fill="none"
      stroke="white"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

/** 원 안의 i (안내) */
export const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className={className ?? "shrink-0"}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

/** 초승달 (비활성 회원) */
export const MoonIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ?? "shrink-0"}
  >
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);

/** 사람 + 더하기 (게스트 추가) */
export const PersonAddIcon: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ?? "shrink-0"}
  >
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 19.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5M19 8v6M16 11h6" />
  </svg>
);

export const CheckIcon: React.FC<{
  size?: number;
  className?: string;
  /** true면 마운트 때 선을 그리듯 나타난다(움직임 줄이기면 정적) */
  draw?: boolean;
}> = ({ size = 16, className, draw = false }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cx("shrink-0", className)}
  >
    <path
      d="M5 12.5l4.5 4.5L19 7.5"
      pathLength={draw ? 1 : undefined}
      className={draw ? "animate-pk-draw motion-reduce:animate-none" : undefined}
    />
  </svg>
);

/** + 아이콘. 크기·굵기는 쓰는 곳마다 다르다 */
export const PlusIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({
  size = 18,
  strokeWidth = 2.6,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** 상자에서 위로 나가는 화살표(공유) */
export const ShareIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 18,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cx("shrink-0", className)}
  >
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H16" />
  </svg>
);

/** 자물쇠. 못 받은 업적 배지에 겹쳐 쓴다 */
export const LockIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 14,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cx("shrink-0", className)}
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/** 엄지 척(칭찬) 선 모양. 칭찬 버튼·알약·배지와 칭찬 업적 배지가 같이 쓴다 */
export const THUMB_UP_ICON_PATHS = [
  "M7 10v12",
  "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
] as const;

/** 엄지 척(칭찬) 선 아이콘 */
export const ThumbUpIcon: React.FC<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}> = ({ size = 16, strokeWidth = 2.4, className }) => (
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
    className={cx("shrink-0", className)}
  >
    {THUMB_UP_ICON_PATHS.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

/** 방패 선 모양(특수 매치 결과 이름의 방어 쪽) */
export const SHIELD_ICON_PATH = "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z";

/** 체크가 든 방패(연승 문지기 칩·완벽한 승리 업적 배지) 선 모양 */
export const SHIELD_CHECK_ICON_PATHS = [SHIELD_ICON_PATH, "M9 12l2 2 4-4"] as const;

/** 교차한 칼(라이벌전·라이벌 업적 배지) 선 모양 */
export const CROSSED_SWORDS_ICON_PATHS = [
  "M5 4l9.5 9.5M19 4L9.5 13.5M4 15.5l4.5 4.5M20 15.5L15.5 20M6.5 18L11 13.5M17.5 18L13 13.5",
] as const;

/** 멈춤 손바닥(연승 저지 특수 매치·업적 배지·특수 매치 공유 이미지 도장) 선 모양, 24 viewBox */
export const STOP_HAND_ICON_PATHS = [
  "M18 11V6a2 2 0 0 0-4 0",
  "M14 10V4a2 2 0 0 0-4 0v2",
  "M10 10.5V6a2 2 0 0 0-4 0v8",
  "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
] as const;

/** 주먹(리벤지 특수 매치·업적 배지) 선 모양 */
export const FIST_ICON_PATHS = [
  "M6 10.5V8.2a1.7 1.7 0 0 1 3.4 0v1.8M9.4 9.6V7.2a1.7 1.7 0 0 1 3.4 0v2.4M12.8 9.6V7.6a1.7 1.7 0 0 1 3.4 0V10M16.2 10.2V9a1.7 1.7 0 0 1 3.4 0v4.3a6.6 6.6 0 0 1-6.6 6.6h-.4A6.6 6.6 0 0 1 6 13.3v-2.8",
  "M6 12.4h5.6a2 2 0 0 1 0 4H9.4",
] as const;
