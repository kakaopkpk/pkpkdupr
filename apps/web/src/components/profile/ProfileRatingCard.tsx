import React from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import { Card } from "@/components/ui/Card";
import {
  COUNT_UP,
  CountUpNumber,
  CountUpRatingDelta,
} from "@/components/ui/CountUpNumber";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { MATCH_CATEGORY_LABELS } from "@/lib/format";
import { formatRating } from "@/utils/dupr";
import RatingTrendChart, {
  type RatingTrendPoint,
} from "@/components/profile/RatingTrendChart";

export const PROFILE_CATEGORY_OPTIONS = [
  { value: "doubles", label: MATCH_CATEGORY_LABELS.doubles },
  { value: "singles", label: MATCH_CATEGORY_LABELS.singles },
] as const satisfies readonly { value: MatchTopLevelType; label: string }[];

/**
 * 랭킹·평점·시즌 최고·30일 변화·30일 추이 차트와 복식/단식 전환.
 * 평점과 30일 변화는 차트 선 그리기와 함께 0부터 센다. 분류를 바꾸면 key로 다시 마운트해 처음부터 재생한다
 */
const ProfileRatingCard: React.FC<{
  category: MatchTopLevelType;
  onCategoryChange: (category: MatchTopLevelType) => void;
  /** 랭킹 순위. null이면 "평점 없음" */
  rank: number | null;
  rating: number | null;
  last30Days: number;
  /** 시즌 최고 평점. 평점이 없으면 줄을 숨긴다 */
  peakRating: number | null;
  history: readonly RatingTrendPoint[];
}> = ({
  category,
  onCategoryChange,
  rank,
  rating,
  last30Days,
  peakRating,
  history,
}) => {
  // 랭킹 평점이 최고 기록보다 높게 보이지 않도록 지금 평점도 함께 본다
  const seasonPeak =
    rating !== null && peakRating !== null
      ? Math.max(rating, peakRating)
      : null;
  return (
    <Card className="flex flex-col gap-2.5 p-4">
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
      <React.Fragment key={category}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-num text-[56px] font-bold leading-[0.95] tabular-nums text-pk-ink">
            {rating !== null ? (
              <CountUpNumber
                value={rating}
                format={formatRating}
                {...COUNT_UP}
              />
            ) : (
              "–"
            )}
          </span>
          <span className="flex flex-col items-end gap-0.5 self-end whitespace-nowrap">
            {seasonPeak !== null && (
              <span>
                <span className="text-pk-13 font-medium text-pk-sub">
                  시즌 최고
                </span>{" "}
                <span className="text-pk-15 font-extrabold tabular-nums text-pk-ink">
                  {formatRating(seasonPeak)}
                </span>
              </span>
            )}
            <span>
              <span className="text-pk-13 font-medium text-pk-sub">30일</span>{" "}
              <CountUpRatingDelta value={last30Days} {...COUNT_UP} />
            </span>
          </span>
        </div>
        <RatingTrendChart
          points={history}
          ariaLabel={`최근 30일 ${MATCH_CATEGORY_LABELS[category]} 평점 추세`}
        />
      </React.Fragment>
    </Card>
  );
};

export default ProfileRatingCard;
