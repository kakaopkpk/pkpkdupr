import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type { MatchInfo } from "@/types/match";
import PushScreen, {
  usePushScreenScrollContainer,
} from "@/components/PushScreen";
import SkeletonBlock from "@/components/SkeletonBlock";
import { PROFILE_CATEGORY_OPTIONS } from "@/components/profile/ProfileRatingCard";
import { Card } from "@/components/ui/Card";
import { MatchRow } from "@/components/ui/MatchRow";
import { SectionLabel, TextLink } from "@/components/ui/Section";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { formatKstShortDate } from "@/lib/format";
import { fetchPlayerMatches } from "@/lib/playerProfile";

const PAGE_SIZE = 20;
// 바닥에 닿기 전 이만큼 남았을 때 다음 페이지를 미리 불러온다
const PREFETCH_MARGIN_PX = 240;

interface MatchGroup {
  key: string;
  label: string;
  matches: MatchInfo[];
}

/** 이어지는 같은 날짜·같은 세션 경기를 한 묶음으로 모은다 */
const groupMatches = (matches: readonly MatchInfo[]): MatchGroup[] => {
  const groups: MatchGroup[] = [];
  let previousKey: string | null = null;

  for (const match of matches) {
    const dateLabel = formatKstShortDate(match.matchStartsAt);
    const key = `${dateLabel}|${match.session?.id ?? ""}`;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && key === previousKey) {
      lastGroup.matches.push(match);
      continue;
    }

    previousKey = key;
    groups.push({
      key: `${key}#${groups.length}`,
      label: match.session?.name
        ? `${dateLabel} · ${match.session.name}`
        : dateLabel,
      matches: [match],
    });
  }

  return groups;
};

/** 스크롤 영역 바닥 근처에 닿으면 onReach를 부른다 */
const InfiniteScrollTrigger: React.FC<{
  isEnabled: boolean;
  /** 바뀔 때마다 다시 관찰해 화면이 덜 찼으면 이어서 불러오게 한다 */
  loadedCount: number;
  onReach: () => void;
}> = ({ isEnabled, loadedCount, onReach }) => {
  const scrollContainer = usePushScreenScrollContainer();
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!isEnabled || !target || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach();
      },
      { root: scrollContainer, rootMargin: `0px 0px ${PREFETCH_MARGIN_PX}px 0px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isEnabled, loadedCount, onReach, scrollContainer]);

  return <div ref={targetRef} aria-hidden="true" className="h-px" />;
};

const MatchListSkeleton: React.FC = () => (
  <div aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-2.5">
    <SkeletonBlock className="h-5 w-40" />
    <SkeletonBlock className="h-[200px] !rounded-pk-lg" />
    <SkeletonBlock className="mt-1 h-5 w-40" />
    <SkeletonBlock className="h-[140px] !rounded-pk-lg" />
  </div>
);

export interface PlayerMatchesDrawerProps {
  /** 열어 달라는 요청 */
  isOpen: boolean;
  tabKey: TabKey;
  playerId: string | null;
  title: string;
  /** 열 때 고를 분류(프로필 평점 카드에서 고른 분류) */
  initialCategory: MatchTopLevelType;
  depthId: string;
  onClose: () => void;
}

/** 한 선수의 완료 경기 목록 화면. 복식/단식 전환, 날짜·세션 묶음, 무한 스크롤 */
export default function PlayerMatchesDrawer({
  isOpen,
  tabKey,
  playerId,
  title,
  initialCategory,
  depthId,
  onClose,
}: PlayerMatchesDrawerProps): React.ReactElement {
  const { openMatchDetail, dataVersion } = useAppNavigation();
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  const [category, setCategory] = useState(initialCategory);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  // 진행 중 경기를 거르기 전 받은 개수. 다음 페이지 여부는 이 값과 total로 정한다
  const [loadedCount, setLoadedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);

  const isLayerOpen = useLayerDepth({
    isOpen: isOpen && !!playerId,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });

  const loadPage = useCallback(
    async (
      targetCategory: MatchTopLevelType,
      page: number,
      { throwOnError = false }: { throwOnError?: boolean } = {},
    ) => {
      if (!playerId) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      isLoadingRef.current = true;
      setIsLoading(true);
      setHasError(false);

      try {
        const data = await fetchPlayerMatches({
          playerId,
          category: targetCategory,
          page,
          limit: PAGE_SIZE,
        });
        if (requestIdRef.current !== requestId) return;

        const completed = data.matches.filter(
          (match) => match.status === "completed",
        );
        setMatches((current) => {
          if (page === 0) return completed;
          const ids = new Set(current.map((match) => match.id));
          return [...current, ...completed.filter((match) => !ids.has(match.id))];
        });
        setLoadedCount((current) =>
          page === 0 ? data.matches.length : current + data.matches.length,
        );
        // 빈 페이지면 total과 실제 행 수가 어긋난 것이므로 더 불러오지 않는다
        setTotal(data.matches.length > 0 ? data.total : 0);
        setNextPage(page + 1);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setHasError(true);
        if (throwOnError) throw err;
      } finally {
        if (requestIdRef.current === requestId) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [playerId],
  );

  const resetAndLoad = useCallback(
    (targetCategory: MatchTopLevelType) => {
      setMatches([]);
      setLoadedCount(0);
      setTotal(0);
      setNextPage(0);
      void loadPage(targetCategory, 0);
    },
    [loadPage],
  );

  // 열 때마다 프로필에서 고른 분류로 처음부터 불러온다. 분류는 여는 시점 값만 쓴다
  const initialCategoryRef = useRef(initialCategory);
  useEffect(() => {
    initialCategoryRef.current = initialCategory;
  }, [initialCategory]);
  useEffect(() => {
    if (!isOpen || !playerId) return;
    setCategory(initialCategoryRef.current);
    resetAndLoad(initialCategoryRef.current);
  }, [isOpen, playerId, resetAndLoad]);

  // 경기 기록·수정 뒤에는 스켈레톤 없이 첫 페이지부터 다시 받는다. 뒤쪽 페이지는 스크롤하면 이어서 받는다
  const dataVersionRef = useRef(dataVersion);
  useEffect(() => {
    if (dataVersionRef.current === dataVersion) return;
    dataVersionRef.current = dataVersion;
    if (isOpen && playerId) void loadPage(category, 0);
  }, [category, dataVersion, isOpen, loadPage, playerId]);

  const changeCategory = (nextCategory: MatchTopLevelType) => {
    setCategory(nextCategory);
    resetAndLoad(nextCategory);
  };

  const hasMore = loadedCount < total;
  const loadMore = useCallback(() => {
    if (isLoadingRef.current || hasError) return;
    void loadPage(category, nextPage);
  }, [category, hasError, loadPage, nextPage]);

  const refresh = useCallback(
    () => loadPage(category, 0, { throwOnError: true }),
    [category, loadPage],
  );

  const close = useCallback(() => {
    if (!closeDepth(tabKey, depthId)) onClose();
  }, [closeDepth, depthId, onClose, tabKey]);

  const handleExited = useCallback(() => {
    requestIdRef.current += 1;
    isLoadingRef.current = false;
    setIsLoading(false);
    setMatches([]);
    setLoadedCount(0);
    setTotal(0);
    restoreScrollTop(tabKey);
  }, [restoreScrollTop, tabKey]);

  const groups = groupMatches(matches);
  const isInitialLoading = isLoading && loadedCount === 0;

  return (
    <PushScreen
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel={title}
      title={title}
      onBack={close}
      onExited={handleExited}
      onPullToRefresh={refresh}
    >
      <div className="flex flex-col gap-2.5 px-4 pb-8">
        <div className="mb-1 self-start">
          <SegmentedControl
            options={PROFILE_CATEGORY_OPTIONS}
            value={category}
            onChange={changeCategory}
            ariaLabel="종목"
          />
        </div>
        {isInitialLoading ? (
          <MatchListSkeleton />
        ) : groups.length > 0 ? (
          groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2.5">
              <SectionLabel>{group.label}</SectionLabel>
              <Card>
                {group.matches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    onPress={() => openMatchDetail(match.id)}
                  />
                ))}
              </Card>
            </section>
          ))
        ) : hasError ? null : (
          <p className="py-10 text-center text-pk-13 text-pk-muted">
            완료한 경기가 없어요.
          </p>
        )}
        {hasError ? (
          <div className="flex flex-col items-center py-4">
            <p className="text-pk-13 text-pk-muted">경기 목록을 불러오지 못했어요.</p>
            <TextLink
              onPress={() =>
                void loadPage(category, loadedCount === 0 ? 0 : nextPage)
              }
            >
              다시 시도
            </TextLink>
          </div>
        ) : null}
        {hasMore && !isInitialLoading ? (
          <>
            <InfiniteScrollTrigger
              isEnabled={isLayerOpen && !hasError}
              loadedCount={loadedCount}
              onReach={loadMore}
            />
            {isLoading ? (
              <SkeletonBlock className="h-[72px] !rounded-pk-lg" />
            ) : null}
          </>
        ) : null}
      </div>
    </PushScreen>
  );
}
