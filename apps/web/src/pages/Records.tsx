import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RecordListFooter,
  RecordListSkeleton,
  RecordMatchCard,
  RecordSessionCard,
} from "@/components/records/RecordCards";
import { TabHeader } from "@/components/ui/Headers";
import { SectionLabel } from "@/components/ui/Section";
import { StateMessage } from "@/components/ui/StateMessage";
import {
  SegmentedControl,
  SegmentSwitchFade,
} from "@/components/ui/SegmentedControl";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { getUserErrorMessage } from "@/lib/errors";
import { formatKstLongDate } from "@/lib/format";
import {
  fetchRecords,
  getRecordItemDate,
  getRecordItemKey,
  type RecordItemInfo,
} from "@/lib/records";

type RecordsMode = "all" | "mine";

const MODE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "mine", label: "내 경기" },
] as const;

const PAGE_SIZE = 20;
// 목록 끝에서 이만큼 카드가 남았을 때 다음 묶음을 미리 받는다
const PREFETCH_REMAINING_CARDS = 3;

type FirstPageStatus = "loading" | "ready" | "error";
type MoreStatus = "idle" | "loading" | "error";

interface RecordDateGroup {
  label: string;
  items: { item: RecordItemInfo; index: number }[];
}

/** 이어지는 같은 KST 날짜 항목을 날짜 제목 하나로 묶는다. index는 전체 목록 순번이다 */
const groupByDate = (items: readonly RecordItemInfo[]): RecordDateGroup[] => {
  const groups: RecordDateGroup[] = [];
  items.forEach((item, index) => {
    const label = formatKstLongDate(getRecordItemDate(item));
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.items.push({ item, index });
    } else {
      groups.push({ label, items: [{ item, index }] });
    }
  });
  return groups;
};

const mergeItems = (
  current: readonly RecordItemInfo[],
  next: readonly RecordItemInfo[],
) => {
  const keys = new Set(current.map(getRecordItemKey));
  return [...current, ...next.filter((item) => !keys.has(getRecordItemKey(item)))];
};

/**
 * 감싼 카드가 화면(탭 스크롤 영역이 잘라낸 보이는 범위)에 들어오면 onReach를 부른다.
 * 숨은 탭에서는 교차하지 않으므로 부르지 않는다.
 */
const PrefetchTrigger: React.FC<{
  onReach: () => void;
  children: React.ReactNode;
}> = ({ onReach, children }) => {
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onReach();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [onReach]);

  return <div ref={targetRef}>{children}</div>;
};

/** 기록 탭: 세션 카드와 세션 없는 경기 카드를 날짜 제목으로 묶은 최신순 목록, 무한 스크롤 */
const Records: React.FC = () => {
  const { player } = useAuth();
  const playerId = player?.id;
  const { openMatchDetail, openSessionReport, dataVersion } =
    useAppNavigation();
  const { registerPullToRefresh } = useTabNavigation();

  const [mode, setMode] = useState<RecordsMode>("all");
  const [isListFading, setIsListFading] = useState(false);
  const [items, setItems] = useState<RecordItemInfo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [firstStatus, setFirstStatus] = useState<FirstPageStatus>("loading");
  const [firstError, setFirstError] = useState<string | null>(null);
  const [moreStatus, setMoreStatus] = useState<MoreStatus>("idle");
  const [moreError, setMoreError] = useState("");

  // 첫 묶음을 다시 받으면 올리고, 응답 때 다르면 버린다(이어 받던 요청도 함께 무효)
  const requestIdRef = useRef(0);
  const isLoadingMoreRef = useRef(false);

  const requestPlayerId = mode === "mine" ? playerId : undefined;

  const loadFirstPage = useCallback(
    async (showSkeleton: boolean) => {
      const requestId = ++requestIdRef.current;
      isLoadingMoreRef.current = false;
      setMoreStatus("idle");
      if (showSkeleton) {
        setFirstStatus("loading");
        setItems([]);
        setNextCursor(null);
      }
      try {
        const data = await fetchRecords({
          limit: PAGE_SIZE,
          ...(requestPlayerId ? { playerId: requestPlayerId } : {}),
        });
        if (requestId !== requestIdRef.current) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setFirstStatus("ready");
        setFirstError(null);
        // 목록 없이 끝나면 페이드 래퍼가 그려지지 않으므로 대기 중인 페이드를 버린다. 남겨 두면 나중 재조회에서 재생된다
        if (data.items.length === 0) setIsListFading(false);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        // 새로고침 실패는 보이던 목록을 그대로 둔다
        if (!showSkeleton) return;
        setIsListFading(false);
        setFirstError(getUserErrorMessage(error, "기록을 불러오지 못했어요"));
        setFirstStatus("error");
      }
    },
    [requestPlayerId],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMoreRef.current) return;
    const requestId = requestIdRef.current;
    isLoadingMoreRef.current = true;
    setMoreStatus("loading");
    try {
      const data = await fetchRecords({
        limit: PAGE_SIZE,
        cursor: nextCursor,
        ...(requestPlayerId ? { playerId: requestPlayerId } : {}),
      });
      if (requestId !== requestIdRef.current) return;
      setItems((current) => mergeItems(current, data.items));
      setNextCursor(data.nextCursor);
      setMoreStatus("idle");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setMoreError(getUserErrorMessage(error, "기록을 불러오지 못했어요"));
      setMoreStatus("error");
    } finally {
      if (requestId === requestIdRef.current) isLoadingMoreRef.current = false;
    }
  }, [nextCursor, requestPlayerId]);

  // 실패한 뒤에는 다시 시도를 누르기 전까지 자동으로 받지 않는다
  const handlePrefetch = useCallback(() => {
    if (moreStatus === "idle") void loadMore();
  }, [loadMore, moreStatus]);

  // 보기 전환은 스켈레톤부터, 데이터 변경은 보이는 목록을 둔 채 첫 묶음부터 다시 받는다
  const lastListKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = requestPlayerId ?? "";
    const isNewList = lastListKeyRef.current !== key;
    lastListKeyRef.current = key;
    void loadFirstPage(isNewList);
  }, [loadFirstPage, requestPlayerId, dataVersion]);

  useEffect(
    () => registerPullToRefresh("records", () => loadFirstPage(false)),
    [loadFirstPage, registerPullToRefresh],
  );

  const handleModeChange = (nextMode: RecordsMode) => {
    setMode(nextMode);
    setIsListFading(true);
  };

  const groups = useMemo(() => groupByDate(items), [items]);
  const prefetchIndex = nextCursor
    ? Math.max(0, items.length - PREFETCH_REMAINING_CARDS)
    : -1;

  const renderItem = (item: RecordItemInfo) =>
    item.kind === "session" ? (
      <RecordSessionCard
        session={item.session}
        mine={item.mine}
        onPress={() => openSessionReport(item.session.id)}
      />
    ) : (
      <RecordMatchCard
        match={item.match}
        currentPlayerId={playerId}
        onPress={() => openMatchDetail(item.match.id)}
      />
    );

  const renderBody = () => {
    if (firstStatus === "loading") return <RecordListSkeleton />;
    if (firstStatus === "error" && items.length === 0) {
      return (
        <StateMessage
          kind="error"
          size="panel"
          message={firstError ?? "기록을 불러오지 못했어요"}
          onRetry={() => void loadFirstPage(true)}
        />
      );
    }
    if (items.length === 0) {
      return <StateMessage kind="empty" size="panel" message="기록이 없어요" />;
    }

    return (
      <SegmentSwitchFade
        isPlaying={isListFading}
        onFinish={() => setIsListFading(false)}
        className="flex flex-col gap-2.5"
      >
        {groups.map((group) => (
          <section
            key={`${group.label}|${group.items[0].index}`}
            className="flex flex-col gap-2.5"
          >
            <div className="pt-2">
              <SectionLabel>{group.label}</SectionLabel>
            </div>
            {group.items.map(({ item, index }) =>
              index === prefetchIndex ? (
                <PrefetchTrigger
                  key={getRecordItemKey(item)}
                  onReach={handlePrefetch}
                >
                  {renderItem(item)}
                </PrefetchTrigger>
              ) : (
                <React.Fragment key={getRecordItemKey(item)}>
                  {renderItem(item)}
                </React.Fragment>
              ),
            )}
          </section>
        ))}
        {nextCursor && moreStatus !== "idle" ? (
          <RecordListFooter
            status={moreStatus}
            errorMessage={moreError}
            onRetry={() => void loadMore()}
          />
        ) : null}
      </SegmentSwitchFade>
    );
  };

  return (
    <>
      <TabHeader
        title="기록"
        right={
          <SegmentedControl
            options={MODE_OPTIONS}
            value={mode}
            onChange={handleModeChange}
            ariaLabel="보기"
          />
        }
      />
      <div className="flex flex-col gap-2.5 px-4 pb-6">{renderBody()}</div>
    </>
  );
};

export default Records;
