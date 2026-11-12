import React from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import { Card } from "@/components/ui/Card";
import { RatingDelta } from "@/components/ui/Delta";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import RatingTrendChart, {
  type RatingTrendPoint,
} from "@/components/profile/RatingTrendChart";

export const PROFILE_CATEGORY_OPTIONS = [
  { value: "doubles", label: "복식" },
  { value: "singles", label: "단식" },
] as const satisfies readonly { value: MatchTopLevelType; label: string }[];

const CATEGORY_LABELS: Record<MatchTopLevelType, string> = {
  doubles: "복식",
  singles: "단식",
};

/** 랭킹·평점·90일 변화·90일 추이 차트와 복식/단식 전환 */
const ProfileRatingCard: React.FC<{
  category: MatchTopLevelType;
  onCategoryChange: (category: MatchTopLevelType) => void;
  /** 랭킹 순위. null이면 "평점 없음" */
  rank: number | null;
  rating: number | null;
  last90Days: number;
  history: readonly RatingTrendPoint[];
}> = ({ category, onCategoryChange, rank, rating, last90Days, history }) => (
  <Card className="flex flex-col gap-2.5 !p-4">
    <div className="flex items-center justify-between gap-2">
      <span className="text-pk-13 font-bold text-pk-sub">
        {rank !== null ? `랭킹 ${rank}위` : "평점 없음"}
      </span>
      <SegmentedControl
        options={PROFILE_CATEGORY_OPTIONS}
        value={category}
        onChange={onCategoryChange}
        ariaLabel="종목"
        size="sm"
      />
    </div>
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-num text-[56px] font-bold leading-[0.95] tabular-nums text-pk-ink">
        {rating !== null ? rating.toFixed(3) : "–"}
      </span>
      <span className="whitespace-nowrap">
        <span className="text-pk-13 font-medium text-pk-sub">90일</span>{" "}
        <RatingDelta value={last90Days} />
      </span>
    </div>
    <RatingTrendChart
      points={history}
      ariaLabel={`최근 90일 ${CATEGORY_LABELS[category]} 평점 추세`}
    />
  </Card>
);

export default ProfileRatingCard;
