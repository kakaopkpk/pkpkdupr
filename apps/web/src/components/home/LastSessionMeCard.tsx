import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import { getSessionRankChange } from "@/components/records/SessionReportParts";
import { Card } from "@/components/ui/Card";
import { RankChange, RatingDelta } from "@/components/ui/Delta";
import { cx } from "@/components/ui/cx";
import { formatRating } from "@/utils/dupr";

const Stat: React.FC<{
  label: string;
  value: string;
  withDivider?: boolean;
}> = ({ label, value, withDivider = false }) => (
  <div
    className={cx(
      "flex min-w-0 flex-col items-center gap-0.5",
      withDivider && "border-l border-pk-divider",
    )}
  >
    <span className="text-pk-12 text-pk-muted">{label}</span>
    <span className="text-pk-17 font-extrabold text-pk-ink tabular-nums">
      {value}
    </span>
  </div>
);

/** 지난 세션 피드의 내 변동 카드: 복식 평점·세션 후 순위와 변화, 경기 수·승패·승률 */
const LastSessionMeCard: React.FC<{ report: SessionPlayerReport }> = ({
  report,
}) => {
  const rankChange = getSessionRankChange(report);
  const winRate =
    report.matchCount > 0
      ? Math.round((report.wins / report.matchCount) * 100)
      : 0;

  return (
    <Card className="flex flex-col gap-3.5 px-5 pt-[18px] pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-pk-13 font-bold text-pk-sub">내 복식 평점</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-pk-26 font-extrabold text-pk-ink tabular-nums">
              {formatRating(report.ratingAfter)}
            </span>
            <RatingDelta
              value={
                report.ratingBefore !== null && report.ratingAfter !== null
                  ? report.ratingDelta
                  : null
              }
            />
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-end text-right">
          <span className="text-pk-13 text-pk-sub">랭킹</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-pk-26 font-extrabold text-pk-ink tabular-nums">
              {report.rankAfter === null ? "–" : `${report.rankAfter}위`}
            </span>
            {rankChange !== null && rankChange !== 0 && (
              <RankChange
                value={rankChange}
                className="text-pk-15 font-extrabold"
              />
            )}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-pk-divider pt-3.5">
        <Stat label="경기" value={`${report.matchCount}`} />
        <Stat
          label="결과"
          value={`${report.wins}승 ${report.losses}패`}
          withDivider
        />
        <Stat label="승률" value={`${winRate}%`} withDivider />
      </div>
    </Card>
  );
};

export default LastSessionMeCard;
