import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import {
  SessionRankChangePop,
  SessionRankCount,
  SessionRatingCount,
  SessionRatingDeltaCount,
} from "@/components/records/SessionReportParts";
import { WinLossCount } from "@/components/profile/ProfileStatTile";
import { Card } from "@/components/ui/Card";
import { COUNT_UP, CountUpNumber } from "@/components/ui/CountUpNumber";
import { cx } from "@/components/ui/cx";

const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
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

/**
 * 지난 세션 피드·세션 상세의 내 변동 카드: 복식 평점·세션 후 순위와 변화, 경기 수·승패·승률.
 * 순위는 세션 전 값에서, 평점과 나머지 숫자는 0부터 세션 지배자 카드와 함께 센다. 순위 변동은 다 센 뒤 튀어나온다
 */
const LastSessionMeCard: React.FC<{ report: SessionPlayerReport }> = ({
  report,
}) => {
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
              <SessionRatingCount report={report} />
            </span>
            <SessionRatingDeltaCount report={report} />
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-end text-right">
          <span className="text-pk-13 text-pk-sub">랭킹</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-pk-26 font-extrabold text-pk-ink tabular-nums">
              <SessionRankCount report={report} />
            </span>
            <SessionRankChangePop
              report={report}
              className="text-pk-15 font-extrabold"
            />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-pk-divider pt-3.5">
        <Stat
          label="경기"
          value={<CountUpNumber value={report.matchCount} {...COUNT_UP} />}
        />
        <Stat
          label="결과"
          value={<WinLossCount wins={report.wins} losses={report.losses} />}
          withDivider
        />
        <Stat
          label="승률"
          value={
            <>
              <CountUpNumber value={winRate} {...COUNT_UP} />%
            </>
          }
          withDivider
        />
      </div>
    </Card>
  );
};

export default LastSessionMeCard;
