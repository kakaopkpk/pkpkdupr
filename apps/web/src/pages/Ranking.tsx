import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type {
  RankingEntry,
  RankingEntryPlayer,
  RankingResponse,
  UnratedRankingEntry,
} from "@pkpkdupr/shared/ranking";
import SkeletonBlock from "@/components/SkeletonBlock";
import { rowPressClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  CountUpNumber,
  CountUpPop,
  getCountUpEndMs,
  getRowCountUp,
} from "@/components/ui/CountUpNumber";
import { RankChange } from "@/components/ui/Delta";
import { TabHeader } from "@/components/ui/Headers";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { RankBadge } from "@/components/ui/RankBadge";
import {
  SegmentedControl,
  SegmentSwitchFade,
  type SegmentedOption,
} from "@/components/ui/SegmentedControl";
import { StateMessage } from "@/components/ui/StateMessage";
import { StatusMessageChip } from "@/components/ui/StatusMessageChip";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { getUserErrorMessage } from "@/lib/errors";
import { fetchRankings } from "@/lib/rankings";
import { formatRating } from "@/utils/dupr";

const CATEGORY_OPTIONS: readonly SegmentedOption<MatchTopLevelType>[] = [
  { value: "doubles", label: "복식" },
  { value: "singles", label: "단식" },
];

const SKELETON_ROW_COUNT = 6;

// 순위 24 · 아바타 32 · 이름 · 평점+변동. 줄 좌우 여백 없이 카드 안쪽 12px에 맞춘다
const rowGridClassName =
  "grid min-h-[52px] w-full grid-cols-[24px_32px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-pk-sm py-2 text-left text-pk-ink";

// 평점(15px)과 변동(12px)의 글자 세로 중심을 맞춘다. 줄 높이를 1로 두어 브라우저마다 다른 기본 줄 높이에 흔들리지 않게 한다
const ratingCellClassName = "flex items-center gap-1.5";

/** 변동 32px 폭. 왼쪽 정렬이라 ▲·▼·– 시작 위치와 평점과의 간격이 모든 줄에서 같다. flex라 부모 글꼴 줄 높이(strut)가 끼지 않는다 */
const changeSlotClassName = "flex w-8 shrink-0 items-center whitespace-nowrap";

/** 랭킹 카드: Card 기본 좌우 여백 16을 12로 줄인다 */
const rankingCardClassName = "px-3 py-1.5";

/** 이름과 그 아래 상태메시지 칩. 상태메시지가 없으면 이름만 세로 가운데에 놓인다 */
const PlayerNameCell: React.FC<{ player: RankingEntryPlayer }> = ({
  player,
}) => (
  <span className="flex min-w-0 flex-col items-start gap-0.5">
    <span className="max-w-full truncate text-pk-15 font-bold">
      {player.username}
    </span>
    {player.statusMessage ? (
      <StatusMessageChip
        message={player.statusMessage}
        color={player.statusMessageBackgroundColor}
        size="sm"
      />
    ) : null}
  </span>
);

/**
 * 순위 줄. 평점은 0.000부터 줄 순서만큼 늦게 세고, 다 세면 순위 변동이 튀어나온다
 */
const RankingRow: React.FC<{
  entry: RankingEntry;
  /** 목록 안 순서(0부터). 세기 시작을 늦추는 데 쓴다 */
  index: number;
  onPress: () => void;
}> = ({ entry, index, onPress }) => {
  const countUp = getRowCountUp(index);
  return (
    <button
      type="button"
      onClick={onPress}
      className={cx(rowGridClassName, rowPressClassName, "active:bg-pk-bg")}
    >
      <span className="flex justify-center">
        <RankBadge rank={entry.rank} />
      </span>
      <PlayerAvatar player={entry.player} size={32} />
      <PlayerNameCell player={entry.player} />
      <span className={ratingCellClassName}>
        <span className="text-pk-15 leading-none font-extrabold tabular-nums">
          <CountUpNumber value={entry.rating} format={formatRating} {...countUp} />
        </span>
        <span className={changeSlotClassName}>
          <CountUpPop delayMs={getCountUpEndMs(countUp)}>
            <RankChange value={entry.rankChange} className="leading-none" />
          </CountUpPop>
        </span>
      </span>
    </button>
  );
};

/** 평점 없는(NR) 회원 줄. 순위 카드 맨 아래에 순위 "–"·NR 칩으로 이어 붙고 변동은 비운다 */
const UnratedRow: React.FC<{
  entry: UnratedRankingEntry;
  onPress: () => void;
}> = ({ entry, onPress }) => (
  <button
    type="button"
    onClick={onPress}
    className={cx(rowGridClassName, rowPressClassName, "active:bg-pk-bg")}
  >
    <span className="flex justify-center text-pk-13 font-extrabold text-pk-muted">
      –
    </span>
    <PlayerAvatar player={entry.player} size={32} />
    <PlayerNameCell player={entry.player} />
    <span className="flex items-center justify-end gap-1.5">
      <span className="rounded-full bg-pk-neutral px-2 py-0.5 text-pk-12 font-extrabold text-pk-muted">
        NR
      </span>
      <span className={changeSlotClassName} />
    </span>
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
  <Card className={rankingCardClassName}>
    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
      <div key={index} className={rowGridClassName}>
        <SkeletonBlock className="size-6 rounded-full" />
        <SkeletonBlock className="size-8 rounded-full" />
        <div className="flex min-w-0 flex-col gap-1">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-3 w-16" />
        </div>
        <span className="flex items-center gap-1.5">
          <SkeletonBlock className="h-4 w-11" />
          <span className={changeSlotClassName} />
        </span>
      </div>
    ))}
  </Card>
);

/** 랭킹 탭. 순위·변동은 서버가 계산한 값을 그대로 보인다 */
const Ranking: React.FC = () => {
  const { openMemberProfile, dataVersion } = useAppNavigation();
  const { registerPullToRefresh } = useTabNavigation();
  const [category, setCategory] = useState<MatchTopLevelType>("doubles");
  const [isListFading, setIsListFading] = useState(false);
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
      // 빈 결과면 페이드 래퍼가 그려지지 않으므로 대기 중인 페이드를 버린다. 남겨 두면 나중 재조회에서 재생된다
      if (response.entries.length + response.unrated.length === 0) {
        setIsListFading(false);
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setIsListFading(false);
      setErrorMessage(getUserErrorMessage(error, "랭킹을 불러오지 못했어요"));
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
              setIsListFading(true);
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
              <SegmentSwitchFade
                isPlaying={isListFading}
                onFinish={() => setIsListFading(false)}
              >
                <Card className={rankingCardClassName}>
                  {currentRanking.entries.map((entry, index) => (
                    <RankingRow
                      key={entry.player.id}
                      entry={entry}
                      index={index}
                      onPress={() => openMemberProfile(entry.player.id)}
                    />
                  ))}
                  {sortUnrated(currentRanking.unrated).map((entry) => (
                    <UnratedRow
                      key={entry.player.id}
                      entry={entry}
                      onPress={() => openMemberProfile(entry.player.id)}
                    />
                  ))}
                </Card>
              </SegmentSwitchFade>
            ) : (
              <Card>
                <StateMessage
                  kind="empty"
                  message="아직 랭킹에 오른 회원이 없어요"
                />
              </Card>
            )}
          </>
        ) : errorMessage ? (
          <StateMessage
            kind="error"
            size="panel"
            message={errorMessage}
            onRetry={() => {
              // 다시 받는 동안 스켈레톤을 보인다
              setErrorMessage(null);
              void loadRanking();
            }}
          />
        ) : (
          <RankingSkeleton />
        )}
      </div>
    </div>
  );
};

export default Ranking;
