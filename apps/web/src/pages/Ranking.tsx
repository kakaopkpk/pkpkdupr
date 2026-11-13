import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type {
  RankingEntry,
  RankingResponse,
  UnratedRankingEntry,
} from "@pkpkdupr/shared/ranking";
import SkeletonBlock from "@/components/SkeletonBlock";
import {
  SPARKLINE_TREND_LABELS,
  Sparkline,
  getSparklineTrend,
} from "@/components/ranking/Sparkline";
import { Card } from "@/components/ui/Card";
import { RankChange } from "@/components/ui/Delta";
import { TabHeader } from "@/components/ui/Headers";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { RankBadge } from "@/components/ui/RankBadge";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/SegmentedControl";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { fetchRankings } from "@/lib/rankings";
import { formatRating } from "@/utils/dupr";

const CATEGORY_OPTIONS: readonly SegmentedOption<MatchTopLevelType>[] = [
  { value: "doubles", label: "복식" },
  { value: "singles", label: "단식" },
];

const SKELETON_ROW_COUNT = 6;

const rowGridClassName =
  "grid w-full grid-cols-[24px_32px_minmax(0,1fr)_72px_auto_28px] items-center gap-2 rounded-pk-sm px-1.5 py-2 text-left text-pk-ink";

const RankingRow: React.FC<{
  entry: RankingEntry;
  isMe: boolean;
  onPress: () => void;
}> = ({ entry, isMe, onPress }) => {
  const { player } = entry;
  const trendLabel = SPARKLINE_TREND_LABELS[getSparklineTrend(entry.trend)];

  return (
    <button
      type="button"
      onClick={onPress}
      className={cx(
        rowGridClassName,
        isMe ? "bg-pk-primary-soft" : "active:bg-pk-bg",
      )}
    >
      <span className="flex justify-center">
        <RankBadge rank={entry.rank} />
      </span>
      <PlayerAvatar player={player} size={32} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-pk-15 font-bold">{player.username}</span>
        <span
          className={cx("text-pk-12", isMe ? "text-pk-primary" : "text-pk-muted")}
        >
          {entry.matchCount}경기{isMe ? " · 나" : ""}
        </span>
      </span>
      <span className="flex h-6 w-[72px] items-center">
        <Sparkline
          values={entry.trend}
          ariaLabel={`${player.username} 90일 평점 ${trendLabel}`}
        />
      </span>
      <span className="text-right text-pk-15 font-extrabold tabular-nums">
        {formatRating(entry.rating)}
      </span>
      <span className="text-right">
        <RankChange value={entry.rankChange} />
      </span>
    </button>
  );
};

/** 평점 없는(NR) 회원 줄. 순위 카드 맨 아래에 순위 "–"·NR 칩으로 이어 붙고 추이·변동은 비운다 */
const UnratedRow: React.FC<{
  entry: UnratedRankingEntry;
  isMe: boolean;
  onPress: () => void;
}> = ({ entry, isMe, onPress }) => (
  <button
    type="button"
    onClick={onPress}
    className={cx(
      rowGridClassName,
      isMe ? "bg-pk-primary-soft" : "active:bg-pk-bg",
    )}
  >
    <span className="flex justify-center text-pk-13 font-extrabold text-pk-muted">
      –
    </span>
    <PlayerAvatar player={entry.player} size={32} />
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-pk-15 font-bold">
        {entry.player.username}
      </span>
      <span
        className={cx("text-pk-12", isMe ? "text-pk-primary" : "text-pk-muted")}
      >
        {entry.matchCount}경기{isMe ? " · 나" : ""}
      </span>
    </span>
    <span />
    <span className="flex justify-end">
      <span className="rounded-full bg-pk-neutral px-2 py-0.5 text-pk-12 font-extrabold text-pk-muted">
        NR
      </span>
    </span>
    <span />
  </button>
);

/** NR 회원은 경기 수 많은 순, 같으면 아이디 순 */
const sortUnrated = (entries: readonly UnratedRankingEntry[]) =>
  [...entries].sort(
    (a, b) =>
      b.matchCount - a.matchCount ||
      a.player.username.localeCompare(b.player.username),
  );

const RankingSkeleton: React.FC = () => (
  <Card className="px-2 py-1.5">
    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <div key={index} className="flex items-center gap-2 px-1.5 py-2">
        <SkeletonBlock className="size-6 rounded-full" />
        <SkeletonBlock className="size-8 rounded-full" />
        <div className="flex flex-1 flex-col gap-1">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-3 w-12" />
        </div>
        <SkeletonBlock className="h-6 w-[72px]" />
        <SkeletonBlock className="h-4 w-11" />
      </div>
    ))}
  </Card>
);

/** 랭킹 탭. 순위·변동은 서버가 계산한 값을 그대로 보인다 */
const Ranking: React.FC = () => {
  const { player } = useAuth();
  const { openMemberProfile, dataVersion } = useAppNavigation();
  const { registerPullToRefresh } = useTabNavigation();
  const [category, setCategory] = useState<MatchTopLevelType>("doubles");
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 늦게 끝난 이전 요청(분류 전환 전 등)이 최신 결과를 덮지 않게 한다
  const requestIdRef = useRef(0);

  const loadRanking = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const response = await fetchRankings(category);
      if (requestId !== requestIdRef.current) return;
      setRanking(response);
      setErrorMessage(null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setErrorMessage(
        error instanceof Error ? error.message : "랭킹을 불러오지 못했어요.",
      );
    }
  }, [category]);

  useEffect(() => {
    void loadRanking();
  }, [loadRanking, dataVersion]);

  useEffect(
    () => registerPullToRefresh("ranking", loadRanking),
    [loadRanking, registerPullToRefresh],
  );

  // 분류를 바꾼 직후에는 이전 분류 결과 대신 스켈레톤을 보인다
  const currentRanking = ranking?.category === category ? ranking : null;
  const myPlayerId = player?.id;

  return (
    <div className="pb-6">
      <TabHeader
        title="랭킹"
        right={
          <SegmentedControl
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(nextCategory) => {
              setErrorMessage(null);
              setCategory(nextCategory);
            }}
            ariaLabel="종목"
          />
        }
      />
      <div className="flex flex-col gap-2.5 px-4">
        {currentRanking ? (
          <>
            {currentRanking.entries.length + currentRanking.unrated.length >
            0 ? (
              <Card className="px-2 py-1.5">
                {currentRanking.entries.map((entry) => (
                  <RankingRow
                    key={entry.player.id}
                    entry={entry}
                    isMe={entry.player.id === myPlayerId}
                    onPress={() => openMemberProfile(entry.player.id)}
                  />
                ))}
                {sortUnrated(currentRanking.unrated).map((entry) => (
                  <UnratedRow
                    key={entry.player.id}
                    entry={entry}
                    isMe={entry.player.id === myPlayerId}
                    onPress={() => openMemberProfile(entry.player.id)}
                  />
                ))}
              </Card>
            ) : null}
          </>
        ) : errorMessage ? (
          <p className="px-1 py-6 text-center text-pk-13 text-pk-sub">
            {errorMessage}
          </p>
        ) : (
          <RankingSkeleton />
        )}
      </div>
    </div>
  );
};

export default Ranking;
