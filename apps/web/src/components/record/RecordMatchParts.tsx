import React from "react";
import { cx } from "@/components/ui/cx";

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

/** 하단 버튼 위 빨간 13px 문구. 서버 오류·같은 점수 안내에 쓴다 */
export const FooterError: React.FC<{ message: string | null }> = ({
  message,
}) =>
  message ? (
    <p role="alert" className="mx-1 mb-2 text-pk-13 font-bold text-pk-down">
      {message}
    </p>
  ) : null;
