import React from "react";

export const CheckIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 16,
  className,
}) => (
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
    className={["shrink-0", className].filter(Boolean).join(" ")}
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
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
