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
