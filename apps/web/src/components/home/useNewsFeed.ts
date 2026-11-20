import { useCallback, useEffect, useRef, useState } from "react";
import { useDataVersion } from "@/context/DataSyncContext";
import { getUserErrorMessage } from "@/lib/errors";
import {
  fetchNewsFeed,
  getNewsFeedItemKey,
  type NewsFeedItemInfo,
} from "@/lib/newsFeed";

const FIRST_PAGE_FALLBACK = "소식을 불러오지 못했어요";
const NEWS_FEED_DATA_KINDS = [
  "sessions",
  "matches",
  "ratings",
  "achievements",
] as const;

export interface NewsFeedState {
  items: NewsFeedItemInfo[];
  /** 첫 페이지 상태. 다시 받는 동안에도 받아 둔 목록이 있으면 ready를 유지한다 */
  status: "loading" | "ready" | "error";
  error: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  /** 다음 페이지를 받지 못했으면 true. 다시 시도(loadMore)할 때까지 이어 부르지 않는다 */
  hasMoreError: boolean;
  /** 첫 페이지부터 다시 받는다. 실패해도 던지지 않는다 */
  reload: () => Promise<void>;
  loadMore: () => void;
}

/**
 * 홈 소식 피드(GET /api/news-feed). enabled일 때만 받고, 데이터 버전이 바뀌면 보이는 목록을 둔 채 첫 페이지부터 다시 받는다.
 * 다음 페이지는 loadMore로 nextCursor를 이어 붙이고, 첫 페이지를 다시 받으면 진행 중인 다음 페이지 응답은 버린다
 */
export const useNewsFeed = ({
  enabled,
}: {
  enabled: boolean;
}): NewsFeedState => {
  const dataVersion = useDataVersion(NEWS_FEED_DATA_KINDS);
  const [items, setItems] = useState<NewsFeedItemInfo[]>([]);
  const [status, setStatus] = useState<NewsFeedState["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreError, setHasMoreError] = useState(false);
  const requestIdRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  // reload 실패 처리가 응답을 기다린 뒤의 목록 유무를 읽는다
  const hasItemsRef = useRef(false);
  useEffect(() => {
    hasItemsRef.current = items.length > 0;
  }, [items]);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    // 오류 화면에서 다시 시도하면 스켈레톤으로 돌아간다
    setStatus((current) => (current === "error" ? "loading" : current));
    try {
      const page = await fetchNewsFeed();
      if (requestIdRef.current !== requestId) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasMoreError(false);
      setStatus("ready");
      setError(null);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      // 받아 둔 목록이 있으면 그대로 두고, 처음 받기에 실패했을 때만 오류 화면으로 바꾼다
      if (hasItemsRef.current) return;
      setError(getUserErrorMessage(err, FIRST_PAGE_FALLBACK));
      setStatus("error");
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || isLoadingMoreRef.current) return;
    const requestId = requestIdRef.current;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setHasMoreError(false);
    void fetchNewsFeed(nextCursor)
      .then((page) => {
        if (requestIdRef.current !== requestId) return;
        setItems((current) => {
          const keys = new Set(current.map(getNewsFeedItemKey));
          return [
            ...current,
            ...page.items.filter((item) => !keys.has(getNewsFeedItemKey(item))),
          ];
        });
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setHasMoreError(true);
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      });
  }, [nextCursor]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [dataVersion, enabled, reload]);

  return {
    items,
    status,
    error,
    hasMore: nextCursor !== null,
    isLoadingMore,
    hasMoreError,
    reload,
    loadMore,
  };
};
