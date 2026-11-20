import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  AchievementRankingEntry,
  AchievementRankingResponse,
  RankingCategory,
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
import { WinStreakAvatarFrame } from "@/components/ui/WinStreakAvatarFrame";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useDataVersion } from "@/context/DataSyncContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { getUserErrorMessage } from "@/lib/errors";
import { formatAchievementPoints } from "@/lib/format";
import { fetchRankings } from "@/lib/rankings";
import { formatRating } from "@/utils/dupr";

// 분류마다 쓰는 데이터 종류. 복식·단식은 같은 종류라 버전을 함께 쓴다
const RATING_RANKING_DATA_KINDS = ["ratings", "players"] as const;
const ACHIEVEMENT_RANKING_DATA_KINDS = ["achievements", "players"] as const;

const CATEGORY_OPTIONS: readonly SegmentedOption<RankingCategory>[] = [
  { value: "doubles", label: "복식" },
  { value: "singles", label: "단식" },
  { value: "achievements", label: "업적" },
];

const SKELETON_ROW_COUNT = 6;

type RankingByCategory = Partial<
  Record<RankingCategory, RankingResponse | AchievementRankingResponse>
>;
type ErrorByCategory = Partial<Record<RankingCategory, string | null>>;

// 순위 24 · 아바타 32 · 이름 · 평점(아래 변동). 줄 좌우 여백 없이 카드 안쪽 12px에 맞춘다.
// 최소 높이 61은 이름 아래 상태메시지 칩이 붙은 줄 높이(이름 22.5 + 간격 2 + 칩 20 + 위아래 여백 16)라, 칩 유무와 상관없이 모든 줄 높이가 같다
const rowGridClassName =
  "grid min-h-[61px] w-full grid-cols-[24px_32px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-pk-sm py-2 text-left text-pk-ink";

// 평점을 줄 오른쪽 끝에 붙이고 순위 변동은 그 아래 오른쪽 정렬로 둔다
const ratingCellClassName = "flex flex-col items-end gap-1";

/** 평점·점수 글자. 줄 높이를 1로 두어 브라우저마다 다른 기본 줄 높이에 흔들리지 않게 한다 */
const ratingTextClassName = "text-pk-15 leading-none font-extrabold tabular-nums";

/** 평점 아래 변동 줄. flex라 부모 글꼴 줄 높이(strut)가 끼지 않는다 */
const changeLineClassName = "flex whitespace-nowrap";

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
      />
    ) : null}
  </span>
);

/** 줄 아바타 32. 연승 중이면 앰버 링과 연승 수 태그를 붙인다 */
const RankingAvatar: React.FC<{
  entry: { player: RankingEntryPlayer; winStreak: number };
}> = ({ entry }) => (
  <WinStreakAvatarFrame winStreak={entry.winStreak} size="sm">
    <PlayerAvatar player={entry.player} size={32} />
  </WinStreakAvatarFrame>
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
      <RankingAvatar entry={entry} />
      <PlayerNameCell player={entry.player} />
      <span className={ratingCellClassName}>
        <span className={ratingTextClassName}>
          <CountUpNumber value={entry.rating} format={formatRating} {...countUp} />
        </span>
        <span className={changeLineClassName}>
          <CountUpPop delayMs={getCountUpEndMs(countUp)}>
            <RankChange value={entry.rankChange} className="leading-none" />
          </CountUpPop>
        </span>
      </span>
    </button>
  );
};

/** 업적 점수 순위 줄. 점수는 0부터 줄 순서만큼 늦게 세고, 순위 변동은 없다. 점수는 복식·단식 평점처럼 줄 오른쪽 끝에 붙는다 */
const AchievementRankingRow: React.FC<{
  entry: AchievementRankingEntry;
  index: number;
  onPress: () => void;
}> = ({ entry, index, onPress }) => (
  <button
    type="button"
    onClick={onPress}
    className={cx(rowGridClassName, rowPressClassName, "active:bg-pk-bg")}
  >
    <span className="flex justify-center">
      <RankBadge rank={entry.rank} />
    </span>
    <RankingAvatar entry={entry} />
    <PlayerNameCell player={entry.player} />
    <span className={ratingTextClassName}>
      <CountUpNumber
        value={entry.points}
        format={formatAchievementPoints}
        {...getRowCountUp(index)}
      />
      점
    </span>
  </button>
);

/** 평점 없는(NR) 회원 줄. 순위 카드 맨 아래에 순위·평점 모두 "–"로 이어 붙고 변동 줄은 없다 */
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
    <RankingAvatar entry={entry} />
    <PlayerNameCell player={entry.player} />
    <span className={cx(ratingTextClassName, "text-pk-muted")}>–</span>
  </button>
);

/** NR 회원은 경기 수 많은 순, 같으면 아이디 순 */
const sortUnrated = (entries: readonly UnratedRankingEntry[]) =>
  [...entries].sort(
    (a, b) =>
      b.matchCount - a.matchCount ||
      a.player.username.localeCompare(b.player.username),
  );

const countRankingRows = (
  response: RankingResponse | AchievementRankingResponse,
) =>
  response.category === "achievements"
    ? response.entries.length
    : response.entries.length + response.unrated.length;

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
        <span className={ratingCellClassName}>
          <SkeletonBlock className="h-4 w-11" />
          <SkeletonBlock className="h-3 w-6" />
        </span>
      </div>
    ))}
  </Card>
);

/** 랭킹 탭. 순위·변동은 서버가 계산한 값을 그대로 보인다 */
const Ranking: React.FC = () => {
  const { openMemberProfile } = useAppNavigation();
  const { registerPullToRefresh } = useTabNavigation();
  const [category, setCategory] = useState<RankingCategory>("doubles");
  const ratingDataVersion = useDataVersion(RATING_RANKING_DATA_KINDS);
  const achievementDataVersion = useDataVersion(ACHIEVEMENT_RANKING_DATA_KINDS);
  // 보고 있는 분류의 데이터 버전. 다른 분류는 이 값이 달라도 볼 때까지 받지 않는다
  const dataVersion =
    category === "achievements" ? achievementDataVersion : ratingDataVersion;
  const [isListFading, setIsListFading] = useState(false);
  // 분류마다 한 번 받은 결과를 메모리에 보관해 이미 본 분류로 돌아오면 바로 보인다
  const [rankings, setRankings] = useState<RankingByCategory>({});
  const [errors, setErrors] = useState<ErrorByCategory>({});
  const categoryRef = useRef(category);
  const dataVersionRef = useRef(dataVersion);
  // 커밋된 값만 담는다. 받기 effect보다 먼저 실행돼 loadCategory가 이번 렌더의 dataVersion을 읽는다
  useLayoutEffect(() => {
    categoryRef.current = category;
    dataVersionRef.current = dataVersion;
  }, [category, dataVersion]);
  // 분류마다 가장 최근 요청 번호. 늦게 끝난 이전 요청이 최신 결과를 덮지 않게 한다
  const requestIdsRef = useRef(new Map<RankingCategory, number>());
  const requestSequenceRef = useRef(0);
  // 분류마다 마지막으로 받기 시작한 그 분류의 dataVersion. 같은 기준으로 받아 둔 분류는 다시 받지 않고, 다르면 오래된 것으로 보고 그 분류를 볼 때 받는다
  const loadStampsRef = useRef(new Map<RankingCategory, number>());

  /** 그 분류를 다시 받는다. 받아 둔 내용은 새 결과가 올 때까지 그대로 둔다 */
  const loadCategory = useCallback(async (target: RankingCategory) => {
    const requestId = ++requestSequenceRef.current;
    requestIdsRef.current.set(target, requestId);
    loadStampsRef.current.set(target, dataVersionRef.current);
    const isLatest = () => requestIdsRef.current.get(target) === requestId;
    try {
      const response = await fetchRankings(target);
      if (!isLatest()) return;
      setRankings((current) => ({ ...current, [target]: response }));
      setErrors((current) => ({ ...current, [target]: null }));
      // 빈 결과면 페이드 래퍼가 그려지지 않으므로 대기 중인 페이드를 버린다. 남겨 두면 나중 재조회에서 재생된다
      if (target === categoryRef.current && countRankingRows(response) === 0) {
        setIsListFading(false);
      }
    } catch (error) {
      if (!isLatest()) return;
      // 실패한 분류는 다시 보일 때 또 받는다
      loadStampsRef.current.delete(target);
      if (target === categoryRef.current) setIsListFading(false);
      setErrors((current) => ({
        ...current,
        [target]: getUserErrorMessage(error, "랭킹을 불러오지 못했어요"),
      }));
    }
  }, []);

  // 보고 있는 분류만 받는다. 이미 이 기준으로 받아 둔 분류는 건너뛴다
  useEffect(() => {
    if (loadStampsRef.current.get(category) === dataVersion) return;
    void loadCategory(category);
  }, [loadCategory, category, dataVersion]);

  useEffect(
    () =>
      registerPullToRefresh("ranking", () => loadCategory(categoryRef.current)),
    [loadCategory, registerPullToRefresh],
  );

  const currentRanking = rankings[category] ?? null;
  const errorMessage = errors[category] ?? null;

  return (
    <div className="pb-6">
      <TabHeader
        title="랭킹"
        right={
          <SegmentedControl
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(nextCategory) => {
              setErrors((current) => ({ ...current, [nextCategory]: null }));
              setCategory(nextCategory);
              // 보관한 결과가 빈 목록이면 페이드 래퍼가 그려지지 않으므로 대기시키지 않는다
              const cached = rankings[nextCategory];
              setIsListFading(!cached || countRankingRows(cached) > 0);
            }}
            ariaLabel="종목"
          />
        }
      />
      <div className="flex flex-col gap-2.5 px-4">
        {currentRanking ? (
          <>
            {countRankingRows(currentRanking) > 0 ? (
              <SegmentSwitchFade
                // 분류마다 새로 그려 페이드와 카운트업이 처음부터 재생되게 한다
                key={category}
                isPlaying={isListFading}
                onFinish={() => setIsListFading(false)}
              >
                <Card className={rankingCardClassName}>
                  {currentRanking.category === "achievements" ? (
                    currentRanking.entries.map((entry, index) => (
                      <AchievementRankingRow
                        key={entry.player.id}
                        entry={entry}
                        index={index}
                        onPress={() => openMemberProfile(entry.player.id)}
                      />
                    ))
                  ) : (
                    <>
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
                    </>
                  )}
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
              setErrors((current) => ({ ...current, [category]: null }));
              void loadCategory(category);
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
