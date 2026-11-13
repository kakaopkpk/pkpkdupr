import React from "react";
import {
  COUNT_UP_SECOND,
  CountUpNumber,
  CountUpRatingDelta,
} from "@/components/ui/CountUpNumber";
import { RatingDelta } from "@/components/ui/Delta";
import { formatRating } from "@/utils/dupr";

/**
 * 경기 평점 변화 줄의 평점·변화 두 칸(기록 완료·경기 상세 공통).
 * 점수 다음 박자(COUNT_UP_SECOND)에 평점은 숫자 하나로 이전 평점에서 새 평점으로, 변화는 0부터 센다. 변화의 부호·색은 처음부터 최종값을 따른다.
 * 이전 평점이 NR이면 세지 않고 최종값을 보인다
 */
export const MatchRatingChangeCount: React.FC<{
  previousRating: number | null;
  nextRating: number | null;
  delta: number | null;
}> = ({ previousRating, nextRating, delta }) => {
  const isCounting =
    previousRating !== null && nextRating !== null && delta !== null;

  return (
    <>
      <span className="text-pk-13 tabular-nums text-pk-sub">
        {isCounting ? (
          <CountUpNumber
            value={nextRating}
            from={previousRating}
            format={formatRating}
            {...COUNT_UP_SECOND}
          />
        ) : (
          formatRating(nextRating)
        )}
      </span>
      <span className="text-right">
        {isCounting ? (
          <CountUpRatingDelta value={delta} {...COUNT_UP_SECOND} />
        ) : (
          <RatingDelta value={delta} />
        )}
      </span>
    </>
  );
};
