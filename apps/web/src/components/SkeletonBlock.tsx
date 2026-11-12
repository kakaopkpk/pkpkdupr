import React from "react";

interface SkeletonBlockProps {
  className?: string;
}

const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = "" }) => (
  <div
    aria-hidden="true"
    className={`animate-pulse rounded bg-pk-neutral ${className}`}
  />
);

export default SkeletonBlock;
