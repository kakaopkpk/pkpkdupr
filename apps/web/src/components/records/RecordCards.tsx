import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import SkeletonBlock from "@/components/SkeletonBlock";
import {
  SessionRankChangeCount,
  SessionRankCount,
  SessionRatingDeltaCount,
} from "@/components/records/SessionReportParts";
import { WinLossCount } from "@/components/profile/ProfileStatTile";
import { rowPressClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { MatchRow } from "@/components/ui/MatchRow";
import { cx } from "@/components/ui/cx";
import { formatKstShortDate } from "@/lib/format";
import { getSessionKindLabel } from "@/lib/matchSessions";
import type { MatchSessionHistoryInfo } from "@/lib/rankings";
import type { MatchInfo } from "@/types/match";

/** 내 기록 띠의 회색 작은 타일: 라벨 위·값 아래 */
const MineStat: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex min-w-0 flex-col gap-1 rounded-pk-sm bg-pk-bg p-2.5">
    <span className="text-pk-12 font-semibold text-pk-muted">{label}</span>
    <span className="flex items-baseline gap-1 truncate text-pk-17 leading-[1.1] font-extrabold text-pk-ink tabular-nums">
      {children}
    </span>
  </div>
);

/** 세션 카드 아래 내 기록 띠: 결과 / 평점 변화 / 세션 후 순위·변동. 승패·변화는 0부터, 순위는 세션 전 값부터 센다 */
const SessionMineStrip: React.FC<{ mine: SessionPlayerReport }> = ({ mine }) => {
  return (
    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
      <MineStat label="결과">
        <WinLossCount wins={mine.wins} losses={mine.losses} />
      </MineStat>
      <MineStat label="평점">
        <SessionRatingDeltaCount report={mine} className="text-pk-17" />
      </MineStat>
      <MineStat label="랭킹">
        <SessionRankCount report={mine} />
        <SessionRankChangeCount report={mine} className="text-pk-13" />
      </MineStat>
    </div>
  );
};

/**
 * 끝난 세션 카드(일정 탭·세션 상세 머리). 맨 위 이름표는 세션 종류, 메타 줄은 장소·인원·경기 수다.
 * 일정 탭은 바깥 날짜 제목이 보이므로 날짜를 넣지 않고, 바깥 날짜 제목이 없는 곳(세션 상세 머리)은 showDate로 메타 줄 앞에 날짜를 붙인다.
 * onPress를 생략하면(세션 상세 머리) 누를 수 없고 화살표가 없다
 */
export const RecordSessionCard: React.FC<{
  session: MatchSessionHistoryInfo;
  mine: SessionPlayerReport | null;
  onPress?: () => void;
  showDate?: boolean;
}> = ({ session, mine, onPress, showDate = false }) => {
  const content = (
    <>
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-pk-12 font-bold text-pk-sub">
          {getSessionKindLabel(session.kind)}
        </span>
        {onPress ? (
          <ChevronRightIcon className="size-4 shrink-0 text-pk-quiet" />
        ) : null}
      </span>
      <span className="mt-0.5 truncate text-pk-17 font-extrabold text-pk-ink">
        {session.name}
      </span>
      <span className="truncate text-pk-13 text-pk-sub tabular-nums">
        {[
          showDate ? formatKstShortDate(session.date) : null,
          session.location,
          `${session.participantCount}명`,
          `${session.matchCount}경기`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {mine ? <SessionMineStrip mine={mine} /> : null}
    </>
  );
  const className = "flex w-full flex-col rounded-pk-lg bg-white px-4 py-3.5 text-left";

  return onPress ? (
    <button
      type="button"
      onClick={onPress}
      className={cx(className, "active:bg-pk-primary-soft/60", rowPressClassName)}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
};

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
