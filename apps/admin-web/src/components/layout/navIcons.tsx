import React from "react";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const HomeIcon = () => (
  <svg {...iconProps}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9v11h5v-6h4v6h5V9" />
  </svg>
);

export const MembersIcon = () => (
  <svg {...iconProps}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14c2.7 0 4.5 1.9 4.5 5" />
  </svg>
);

export const MatchesIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16M3 12h18" />
  </svg>
);

export const SessionsIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const RatingsIcon = () => (
  <svg {...iconProps}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);
