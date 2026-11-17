import React from "react";
import { ACHIEVEMENT_MAX_POINTS } from "@pkpkdupr/shared/achievements";
import { COUNT_UP, CountUpNumber } from "@/components/ui/CountUpNumber";
import { cx } from "@/components/ui/cx";

export const formatAchievementPoints = (value: number) =>
  Math.round(value).toLocaleString("ko-KR");

/** 업적 카드 맨 위 "업적 점수" 줄: 점수(0부터 셈) / 만점점과 만점 대비 막대 */
export const AchievementPointsSummary: React.FC<{
  points: number;
  className?: string;
}> = ({ points, className }) => {
  const ratio =
    ACHIEVEMENT_MAX_POINTS > 0
      ? Math.min(Math.max(points / ACHIEVEMENT_MAX_POINTS, 0), 1)
      : 0;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-pk-13 font-bold text-pk-sub">업적 점수</span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-num text-[34px] leading-none font-bold tabular-nums text-pk-ink">
            <CountUpNumber
              value={points}
              format={formatAchievementPoints}
              {...COUNT_UP}
            />
          </span>
          <span className="text-pk-13 text-pk-muted tabular-nums">
            / {formatAchievementPoints(ACHIEVEMENT_MAX_POINTS)}점
          </span>
        </span>
      </div>
      <span
        aria-hidden="true"
        className="block h-1.5 overflow-hidden rounded-full bg-pk-neutral"
      >
        <span
          className="block h-full rounded-full bg-pk-primary"
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
    </div>
  );
};

export default AchievementPointsSummary;
