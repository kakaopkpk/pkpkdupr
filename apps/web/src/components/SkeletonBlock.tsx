import React from "react";
import { cx } from "@/components/ui/cx";

interface SkeletonBlockProps {
  className?: string;
}

const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className }) => (
  <div
    aria-hidden="true"
    className={cx("animate-pulse rounded bg-pk-neutral", className)}
  />
);

export default SkeletonBlock;
