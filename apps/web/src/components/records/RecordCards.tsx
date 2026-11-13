import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import { Spinner } from "@heroui/react";
import SkeletonBlock from "@/components/SkeletonBlock";
import {
  getSessionRankChange,
  SessionRankChangePop,
  SessionRankCount,
  SessionRatingDeltaCount,
} from "@/components/records/SessionReportParts";
import { WinLossCount } from "@/components/profile/ProfileStatTile";
import { rowPressClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { MatchRow } from "@/components/ui/MatchRow";
import { TextLink } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import type { MatchSessionHistoryInfo } from "@/lib/rankings";
import type { MatchInfo } from "@/types/match";

const MineStat: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className="text-pk-12 text-pk-muted">{label}</span>
    <span className="flex items-baseline gap-1 truncate text-pk-15 font-extrabold text-pk-ink tabular-nums">
      {children}
    </span>
  </div>
);

/** 세션 카드 아래 내 기록 띠: 결과 / 평점 변화 / 세션 후 순위·변동. 승패·변화는 0부터, 순위는 세션 전 값부터 센다 */
const SessionMineStrip: React.FC<{ mine: SessionPlayerReport }> = ({ mine }) => {
  const rankChange = getSessionRankChange(mine);
  return (
    <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-pk-sm bg-pk-bg px-3 py-2.5">
      <MineStat label="결과">
        <WinLossCount wins={mine.wins} losses={mine.losses} />
      </MineStat>
      <MineStat label="평점">
        <SessionRatingDeltaCount report={mine} />
      </MineStat>
      <MineStat label="랭킹">
        {mine.rankAfter === null ? (
          "–"
        ) : (
          <>
            <span>
              <SessionRankCount report={{ ...mine, rankAfter: mine.rankAfter }} />
              위
            </span>
            <SessionRankChangePop value={rankChange} className="text-pk-13" />
          </>
        )}
      </MineStat>
    </div>
  );
};

/** 기록 탭 세션 카드. 날짜는 바깥 날짜 제목이 보이므로 넣지 않는다 */
export const RecordSessionCard: React.FC<{
  session: MatchSessionHistoryInfo;
  mine: SessionPlayerReport | null;
  onPress: () => void;
}> = ({ session, mine, onPress }) => (
  <button
    type="button"
    onClick={onPress}
    className={cx(
      "flex w-full flex-col rounded-pk-lg bg-white px-4 py-3.5 text-left active:bg-pk-primary-soft/60",
      rowPressClassName,
    )}
  >
    <span className="flex w-full items-center justify-between gap-2">
      <span className="text-pk-12 font-bold text-pk-sub">
        {session.kind === "regular" ? "정기" : "회원 세션"}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-pk-quiet" />
    </span>
    <span className="mt-0.5 truncate text-pk-17 font-extrabold text-pk-ink">
      {session.name}
    </span>
    <span className="truncate text-pk-13 text-pk-sub tabular-nums">
      {[
        session.location,
        `${session.participantCount}명`,
        `${session.matchCount}경기`,
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
    {mine ? <SessionMineStrip mine={mine} /> : null}
  </button>
);

/** 세션 없는 경기 카드: 카드 하나에 경기 줄 하나 */
export const RecordMatchCard: React.FC<{
  match: MatchInfo;
  currentPlayerId?: string;
  onPress: () => void;
}> = ({ match, currentPlayerId, onPress }) => (
  <Card className="py-0.5">
    <MatchRow match={match} currentPlayerId={currentPlayerId} onPress={onPress} />
  </Card>
);

export const RecordCardSkeleton: React.FC = () => (
  <div
    aria-hidden="true"
    className="flex flex-col gap-1.5 rounded-pk-lg bg-white px-4 py-3.5"
  >
    <SkeletonBlock className="h-3 w-16" />
    <SkeletonBlock className="h-[18px] w-[150px]" />
    <SkeletonBlock className="h-[13px] w-[210px]" />
    <SkeletonBlock className="mt-1 h-[52px] w-full rounded-pk-sm" />
  </div>
);

export const RecordListSkeleton: React.FC = () => (
  <div aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-2.5">
    <SkeletonBlock className="mt-2 h-4 w-28" />
    <RecordCardSkeleton />
    <RecordCardSkeleton />
    <RecordCardSkeleton />
  </div>
);

/** 목록 끝 다음 묶음 상태. 받는 중이면 스켈레톤과 문구, 실패면 다시 시도 */
export const RecordListFooter: React.FC<{
  status: "loading" | "error";
  onRetry: () => void;
}> = ({ status, onRetry }) =>
  status === "loading" ? (
    <div className="flex flex-col gap-2.5">
      <RecordCardSkeleton />
      <div className="flex items-center justify-center gap-1.5 py-2 text-pk-12 text-pk-muted">
        <Spinner aria-hidden="true" className="size-3" color="current" size="sm" />
        이전 기록 불러오는 중
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center py-2">
      <p className="text-pk-13 text-pk-muted">기록을 불러오지 못했어요.</p>
      <TextLink onPress={onRetry}>다시 시도</TextLink>
    </div>
  );
