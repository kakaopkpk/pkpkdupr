import React from "react";

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
export const CrownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="14"
    height="14"
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
