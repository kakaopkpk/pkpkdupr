import React from "react";
import SkeletonBlock from "@/components/SkeletonBlock";

/** 홈 첫 로드 자리: 230px 카드, 짧은 알약, 줄 3개 카드 */
const HomeSkeleton: React.FC = () => (
  <div
    aria-busy="true"
    aria-label="불러오는 중"
    className="flex flex-col gap-2.5"
  >
    <SkeletonBlock className="h-[230px] w-full rounded-pk-lg" />
    <div className="h-1.5" />
    <SkeletonBlock className="h-3.5 w-2/5 rounded-full" />
    <div className="flex flex-col gap-3 rounded-pk-lg bg-white p-4">
      <SkeletonBlock className="h-4 w-3/5 rounded-pk-sm" />
      <SkeletonBlock className="h-4 w-[90%] rounded-pk-sm" />
      <SkeletonBlock className="h-4 w-3/4 rounded-pk-sm" />
    </div>
  </div>
);

export default HomeSkeleton;
