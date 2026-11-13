import React from "react";
import { CountUpText } from "@/components/ui/CountUpText";
import { RatingDelta } from "@/components/ui/Delta";
import { useCountUp } from "@/hooks/useCountUp";
import { formatRating } from "@/utils/dupr";

/**
 * 경기 평점 변화 줄의 평점·변화 두 칸(기록 완료·경기 상세 공통).
 * 평점은 숫자 하나로 이전 평점에서 새 평점으로, 변화는 0부터 센다. 변화의 부호·색은 처음부터 최종값을 따른다.
 * 이전 평점이 NR이면 세지 않고 최종값을 보인다
 */
export const MatchRatingChangeCount: React.FC<{
  previousRating: number | null;
  nextRating: number | null;
  delta: number | null;
  timing: { delayMs: number; durationMs: number };
}> = ({ previousRating, nextRating, delta, timing }) => {
  const nextCount = useCountUp(nextRating ?? 0, {
    from: previousRating ?? 0,
    ...timing,
  });
  const deltaCount = useCountUp(delta ?? 0, timing);
  const isCounting =
    previousRating !== null && nextRating !== null && delta !== null;

  return (
    <>
      <span className="text-pk-13 tabular-nums text-pk-sub">
        <CountUpText finalContent={formatRating(nextRating)}>
          {formatRating(isCounting ? nextCount.value : nextRating)}
        </CountUpText>
      </span>
      {isCounting ? (
        <RatingDelta
          value={deltaCount.value}
          signValue={delta}
          className="text-right"
        />
      ) : (
        <RatingDelta value={delta} className="text-right" />
      )}
    </>
  );
};
