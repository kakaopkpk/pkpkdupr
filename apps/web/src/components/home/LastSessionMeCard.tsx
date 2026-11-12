import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import { Card } from "@/components/ui/Card";
import { RankChange, RatingDelta } from "@/components/ui/Delta";
import { formatRating } from "@/utils/dupr";

const formatRank = (rank: number | null) => (rank === null ? "–" : `${rank}위`);

const Stat: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex min-w-0 flex-col">
    <span className="text-pk-12 text-pk-muted">{label}</span>
    <span className="text-pk-15 font-bold text-pk-ink tabular-nums">
      {children}
    </span>
  </div>
);

/** 지난 세션 피드의 내 변동 카드: 복식 평점과 변화량, 경기 수·승패·랭킹 변화 */
const LastSessionMeCard: React.FC<{ report: SessionPlayerReport }> = ({
  report,
}) => {
  // 순위는 숫자가 작을수록 높으므로 이전 - 이후가 양수면 상승이다
  const rankChange =
    report.rankBefore !== null && report.rankAfter !== null
      ? report.rankBefore - report.rankAfter
      : null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-pk-13 font-bold text-pk-sub">내 복식 평점</span>
        <span className="inline-flex items-baseline gap-2">
          <span className="text-pk-22 font-extrabold text-pk-ink tabular-nums">
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
      <div className="grid grid-cols-3 gap-2 border-t border-pk-divider pt-3">
        <Stat label="경기">{report.matchCount}경기</Stat>
        <Stat label="결과">
          {report.wins}승 {report.losses}패
        </Stat>
        <Stat label="랭킹">
          {formatRank(report.rankBefore)} → {formatRank(report.rankAfter)}{" "}
          <RankChange value={rankChange} />
        </Stat>
      </div>
    </Card>
  );
};

export default LastSessionMeCard;
