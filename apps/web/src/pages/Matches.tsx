import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Switch } from "@heroui/react";
import Match, {
  type MatchFeedItemInfo,
  type MatchInfo,
} from "@/components/Match";
import MatchDetail, { MatchDetailSkeleton } from "@/components/MatchDetail";
import DetailPageHeader from "@/components/DetailPageHeader";
import LoadMoreButton from "@/components/LoadMoreButton";
import RightDrawer from "@/components/RightDrawer";
import SessionCard, { type SessionCardSession } from "@/components/SessionCard";
import SessionDetail from "@/components/SessionDetail";
import SkeletonBlock from "@/components/SkeletonBlock";
import TabPanelHeader from "@/components/TabPanelHeader";
import TabPanelStatus from "@/components/TabPanelStatus";
import TodaySessionSection from "@/components/TodaySessionSection";
import { useAuth } from "@/context/AuthContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { apiFetch } from "@/lib/api";
import {
  fetchMatchSession,
  fetchTodayMatchSessions,
  type MatchSessionDetailInfo,
  type TodayMatchSessionsInfo,
} from "@/lib/matchSessions";
import { isTabRefreshDue } from "@/lib/tabRefresh";
import {
  CACHED_MATCH_FEED_KEY,
  CACHED_MY_MATCH_FEED_KEY,
} from "@/lib/userCache";

interface MatchesProps {
  reloadKey?: number;
}

const LEGACY_CACHED_MATCH_KEYS = [
  "pkpkdupr:matches",
  "pkpkdupr:matches:v2-public-dupr",
  "pkpkdupr:matches:v2-public-dupr:my",
];
const MATCHES_PAGE_SIZE = 20;
const OFFLINE_FALLBACK_MESSAGE =
  "최신 정보를 불러오지 못해 저장된 매치 목록을 표시합니다.";

interface CachedMatchFeed {
  items: MatchFeedItemInfo[];
  total: number;
}

interface MatchFeedResponse {
  items: MatchFeedItemInfo[];
  total: number;
}

const MatchFeedSkeleton: React.FC = () => (
  <div
    className="flex flex-col gap-3"
    role="status"
    aria-label="매치 목록 로딩 중"
  >
    {Array.from({ length: 4 }, (_, index) => (
      <Card key={index} className="rounded-3xl bg-white/95 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="h-5 w-10 rounded-full" />
          </div>
          <SkeletonBlock className="size-5 rounded-full" />
        </div>
        <SkeletonBlock className="mt-2 h-5 w-36" />
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="flex flex-col gap-2">
            <SkeletonBlock className="h-3 w-12" />
            <SkeletonBlock className="h-7 w-24 rounded-full" />
          </div>
          <SkeletonBlock className="h-9 w-14" />
          <div className="flex flex-col items-end gap-2">
            <SkeletonBlock className="h-3 w-12" />
            <SkeletonBlock className="h-7 w-24 rounded-full" />
          </div>
        </div>
      </Card>
    ))}
  </div>
);

const clearLegacyCachedMatches = () => {
  for (const key of LEGACY_CACHED_MATCH_KEYS) {
    localStorage.removeItem(key);
  }
};

const getCachedMatchFeedKey = (isMyMatchOnly: boolean) =>
  isMyMatchOnly ? CACHED_MY_MATCH_FEED_KEY : CACHED_MATCH_FEED_KEY;

const readCachedMatchFeed = (key: string): CachedMatchFeed | null => {
  try {
    const cachedFeed = localStorage.getItem(key);
    if (!cachedFeed) return null;

    const parsed = JSON.parse(cachedFeed) as Partial<CachedMatchFeed>;
    if (!Array.isArray(parsed.items) || typeof parsed.total !== "number") {
      return null;
    }

    const items = dedupeFeedItems(parsed.items as MatchFeedItemInfo[]);
    return { items, total: Math.max(items.length, parsed.total) };
  } catch {
    return null;
  }
};

const writeCachedMatchFeed = (key: string, cachedFeed: CachedMatchFeed) => {
  localStorage.setItem(key, JSON.stringify(cachedFeed));
};

const getFeedItemKey = (item: MatchFeedItemInfo) =>
  item.kind === "match"
    ? `match:${item.match.id}`
    : `session:${item.session.id}`;

const dedupeFeedItems = (items: MatchFeedItemInfo[]) => {
  const itemIndexByKey = new Map<string, number>();
  const dedupedItems: MatchFeedItemInfo[] = [];

  for (const item of items) {
    const key = getFeedItemKey(item);
    const existingIndex = itemIndexByKey.get(key);

    if (existingIndex == null) {
      itemIndexByKey.set(key, dedupedItems.length);
      dedupedItems.push(item);
      continue;
    }

    // 동일 세션의 더 최신 응답으로 갱신하되, 피드에서의 표시 순서는 유지한다.
    dedupedItems[existingIndex] = item;
  }

  return dedupedItems;
};

const mergeFeedItems = (
  currentItems: MatchFeedItemInfo[],
  nextItems: MatchFeedItemInfo[],
) => dedupeFeedItems([...currentItems, ...nextItems]);

const isSessionDetailInfo = (
  session: SessionCardSession | MatchSessionDetailInfo,
): session is MatchSessionDetailInfo => "isToday" in session;

const noop = () => {};

const Matches: React.FC<MatchesProps> = ({ reloadKey = 0 }) => {
  const { player, isAuthenticated } = useAuth();
  const isOnline = useOnlineStatus();
  const {
    depthStacks,
    pushDepth,
    registerScrollContainer,
    restoreScrollTop,
    saveScrollPosition,
    selectedTab,
    scrollToTop,
    registerPullToRefresh,
  } = useTabNavigation();
  const [feedItems, setFeedItems] = useState<MatchFeedItemInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isMyMatchOnly, setIsMyMatchOnly] = useState(false);
  // 상세를 받기 전 헤더용. 피드 요약 또는 오늘 세션 응답
  const [selectedSession, setSelectedSession] =
    useState<SessionCardSession | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] =
    useState<MatchSessionDetailInfo | null>(null);
  const [isLoadingSessionDetail, setIsLoadingSessionDetail] = useState(false);
  const [sessionDetailError, setSessionDetailError] = useState<string | null>(
    null,
  );
  const [todaySessions, setTodaySessions] =
    useState<TodayMatchSessionsInfo | null>(null);
  const [isLoadingTodaySessions, setIsLoadingTodaySessions] = useState(true);
  const [todaySessionsError, setTodaySessionsError] = useState<string | null>(
    null,
  );
  const [selectedSessionMatches, setSelectedSessionMatches] = useState<
    MatchInfo[]
  >([]);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchInfo | null>(null);
  const [isLoadingSelectedMatch, setIsLoadingSelectedMatch] = useState(false);
  const [selectedMatchError, setSelectedMatchError] = useState<string | null>(
    null,
  );
  const isMatchFeedLoading = useMinimumLoading(isLoading);
  const isSelectedMatchLoading = useMinimumLoading(isLoadingSelectedMatch);
  const latestRequestIdRef = useRef(0);
  const latestTodayRequestIdRef = useRef(0);
  // 늦게 도착한 다른 세션의 응답이 열린 상세를 덮어쓰지 않게 한다
  const selectedSessionIdRef = useRef<string | null>(null);
  const lastSuccessfulLoadAtRef = useRef<number | null>(null);
  const wasTabActiveRef = useRef(false);
  const pendingReloadRef = useRef(false);
  const previousReloadKeyRef = useRef(reloadKey);
  const previousIsMyMatchOnlyRef = useRef(isMyMatchOnly);

  useEffect(() => {
    clearLegacyCachedMatches();
  }, []);

  const loadFeed = useCallback(
    async (
      page = 0,
      append = false,
      preserveVisibleData = false,
      throwOnError = false,
    ) => {
      if (!isAuthenticated) {
        latestRequestIdRef.current += 1;
        setFeedItems([]);
        setTotal(0);
        setNextPage(0);
        setIsLoading(false);
        lastSuccessfulLoadAtRef.current = null;
        return;
      }

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      const cachedFeedKey = getCachedMatchFeedKey(isMyMatchOnly);

      try {
        if (append) {
          setIsLoadingMore(true);
          setLoadMoreError(null);
        } else if (!preserveVisibleData) {
          setFeedItems([]);
          setTotal(0);
          setNextPage(0);
          setIsLoading(true);
          setError(null);
          setLoadMoreError(null);
          setNotice(null);
        }

        const searchParams = new URLSearchParams({
          page: String(page),
          limit: String(MATCHES_PAGE_SIZE),
        });
        if (isMyMatchOnly && player?.id) {
          searchParams.set("playerId", player.id);
        }

        const res = await apiFetch(`/api/match-feed?${searchParams.toString()}`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || "매치 목록을 불러오지 못했습니다.",
          );
        }

        const data = (await res.json()) as MatchFeedResponse;
        if (latestRequestIdRef.current !== requestId) return;

        setFeedItems((currentItems) => {
          const nextItems = append
            ? mergeFeedItems(currentItems, data.items)
            : dedupeFeedItems(data.items);
          writeCachedMatchFeed(cachedFeedKey, {
            items: nextItems,
            total: data.total,
          });
          return nextItems;
        });
        setTotal(data.total);
        setNextPage(page + 1);
        if (!append) {
          lastSuccessfulLoadAtRef.current = Date.now();
          setError(null);
          setNotice(null);
        }
      } catch (err) {
        if (latestRequestIdRef.current !== requestId) return;

        if (!isOnline) {
          const cachedFeed = readCachedMatchFeed(cachedFeedKey);
          if (cachedFeed && !append && !preserveVisibleData) {
            setFeedItems(cachedFeed.items);
            setTotal(cachedFeed.total);
            setNextPage(Math.ceil(cachedFeed.items.length / MATCHES_PAGE_SIZE));
            setNotice(OFFLINE_FALLBACK_MESSAGE);
            setError(null);
            return;
          }
        }

        const message =
          err instanceof Error ? err.message : "매치 목록을 불러오지 못했습니다.";
        if (append) {
          setLoadMoreError(message);
        } else if (!preserveVisibleData) {
          setError(message);
        }
        if (throwOnError) throw err;
      } finally {
        if (latestRequestIdRef.current === requestId) {
          if (append) {
            setIsLoadingMore(false);
          } else if (!preserveVisibleData) {
            setIsLoading(false);
          }
        }
      }
    },
    [isMyMatchOnly, isOnline, player?.id, isAuthenticated],
  );

  const loadSelectedMatch = useCallback(
    async (matchId: string) => {
      if (!isAuthenticated) throw new Error("로그인이 필요해요.");

      const res = await apiFetch(`/api/matches/${matchId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "매치를 불러오지 못했습니다.");
      }

      const refreshedMatch = (await res.json()) as MatchInfo;
      setSelectedMatch(refreshedMatch);
      setFeedItems((currentItems) =>
        currentItems.map((item) =>
          item.kind === "match" && item.match.id === refreshedMatch.id
            ? { kind: "match", match: refreshedMatch }
            : item,
        ),
      );
      setSelectedSessionMatches((currentMatches) =>
        currentMatches.map((match) =>
          match.id === refreshedMatch.id ? refreshedMatch : match,
        ),
      );
    },
    [isAuthenticated],
  );

  const loadMatchDetail = useCallback(
    async (matchId: string) => {
      setIsLoadingSelectedMatch(true);
      setSelectedMatchError(null);

      try {
        await loadSelectedMatch(matchId);
      } catch (err) {
        setSelectedMatchError(
          err instanceof Error ? err.message : "매치를 불러오지 못했습니다.",
        );
      } finally {
        setIsLoadingSelectedMatch(false);
      }
    },
    [loadSelectedMatch],
  );

  const loadSessionMatches = useCallback(
    async (
      sessionId: string,
      preserveVisibleData = false,
      throwOnError = false,
    ) => {
      if (!isAuthenticated) {
        const nextError = "로그인이 필요해요.";
        setSessionError(nextError);
        if (throwOnError) throw new Error(nextError);
        return;
      }
      if (!isOnline) {
        const nextError = "오프라인에서는 세션의 전체 경기를 불러올 수 없습니다.";
        setSessionError(nextError);
        if (throwOnError) throw new Error(nextError);
        return;
      }

      try {
        if (!preserveVisibleData) {
          setSelectedSessionMatches([]);
          setIsLoadingSession(true);
          setSessionError(null);
        }
        const res = await apiFetch(
          `/api/match-sessions/${encodeURIComponent(sessionId)}/matches`,
        );
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || "세션 경기를 불러오지 못했습니다.",
          );
        }

        const sessionMatches = (await res.json()) as MatchInfo[];
        if (selectedSessionIdRef.current !== sessionId) return;
        setSelectedSessionMatches(sessionMatches);
        setSessionError(null);
      } catch (err) {
        if (selectedSessionIdRef.current !== sessionId) return;
        const message =
          err instanceof Error ? err.message : "세션 경기를 불러오지 못했습니다.";
        setSessionError(message);
        if (throwOnError) throw err;
      } finally {
        if (selectedSessionIdRef.current === sessionId) {
          setIsLoadingSession(false);
        }
      }
    },
    [isOnline, isAuthenticated],
  );

  const loadSessionDetail = useCallback(
    async (
      sessionId: string,
      preserveVisibleData = false,
      throwOnError = false,
    ) => {
      if (!isAuthenticated) {
        const nextError = "로그인이 필요해요.";
        setSessionDetailError(nextError);
        if (throwOnError) throw new Error(nextError);
        return;
      }

      try {
        if (!preserveVisibleData) {
          setIsLoadingSessionDetail(true);
          setSessionDetailError(null);
        }
        const detail = await fetchMatchSession(sessionId);
        if (selectedSessionIdRef.current !== sessionId) return;
        setSelectedSessionDetail(detail);
        setSessionDetailError(null);
      } catch (err) {
        if (selectedSessionIdRef.current !== sessionId) return;
        setSessionDetailError(
          err instanceof Error ? err.message : "세션 정보를 불러오지 못했어요.",
        );
        if (throwOnError) throw err;
      } finally {
        if (selectedSessionIdRef.current === sessionId) {
          setIsLoadingSessionDetail(false);
        }
      }
    },
    [isAuthenticated],
  );

  /** 세션 상세(참여자 등)와 세션 경기 목록을 함께 읽는다 */
  const loadSession = useCallback(
    async (
      sessionId: string,
      preserveVisibleData = false,
      throwOnError = false,
    ) => {
      await Promise.all([
        loadSessionDetail(sessionId, preserveVisibleData, throwOnError),
        loadSessionMatches(sessionId, preserveVisibleData, throwOnError),
      ]);
    },
    [loadSessionDetail, loadSessionMatches],
  );

  const loadTodaySessions = useCallback(async () => {
    const requestId = latestTodayRequestIdRef.current + 1;
    latestTodayRequestIdRef.current = requestId;

    if (!isAuthenticated) {
      setTodaySessions(null);
      setTodaySessionsError(null);
      setIsLoadingTodaySessions(false);
      return;
    }

    setIsLoadingTodaySessions(true);
    try {
      const data = await fetchTodayMatchSessions();
      if (latestTodayRequestIdRef.current !== requestId) return;
      setTodaySessions(data);
      setTodaySessionsError(null);
    } catch (err) {
      if (latestTodayRequestIdRef.current !== requestId) return;
      // 이전 응답이 있으면 그대로 보여 주고 오류만 남긴다
      setTodaySessionsError(
        err instanceof Error ? err.message : "오늘 세션을 불러오지 못했어요.",
      );
    } finally {
      if (latestTodayRequestIdRef.current === requestId) {
        setIsLoadingTodaySessions(false);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const isTabActive = selectedTab === "match";
    if (!isTabActive) {
      wasTabActiveRef.current = false;
      return;
    }
    if (wasTabActiveRef.current) return;

    wasTabActiveRef.current = true;
    if (
      !pendingReloadRef.current &&
      !isTabRefreshDue(lastSuccessfulLoadAtRef.current)
    ) {
      return;
    }

    pendingReloadRef.current = false;
    void loadFeed(0, false, lastSuccessfulLoadAtRef.current !== null);
    void loadTodaySessions();
  }, [loadFeed, loadTodaySessions, selectedTab]);

  useEffect(() => {
    if (previousReloadKeyRef.current === reloadKey) return;

    previousReloadKeyRef.current = reloadKey;
    if (selectedTab !== "match") {
      pendingReloadRef.current = true;
      return;
    }
    void loadFeed(0, false, feedItems.length > 0);
    void loadTodaySessions();
  }, [feedItems.length, loadFeed, loadTodaySessions, reloadKey, selectedTab]);

  useEffect(() => {
    if (previousIsMyMatchOnlyRef.current === isMyMatchOnly) return;

    previousIsMyMatchOnlyRef.current = isMyMatchOnly;
    if (selectedTab !== "match") {
      pendingReloadRef.current = true;
      return;
    }
    void loadFeed();
  }, [isMyMatchOnly, loadFeed, selectedTab]);

  useEffect(() => {
    if (!selectedMatchId) return;

    const refreshedMatch =
      selectedSessionMatches.find((match) => match.id === selectedMatchId) ??
      feedItems.find(
        (item): item is Extract<MatchFeedItemInfo, { kind: "match" }> =>
          item.kind === "match" && item.match.id === selectedMatchId,
      )?.match;
    if (refreshedMatch) setSelectedMatch(refreshedMatch);
  }, [feedItems, selectedMatchId, selectedSessionMatches]);

  useEffect(() => {
    if (!selectedSession) return;

    const refreshedSession = feedItems.find(
      (item): item is Extract<MatchFeedItemInfo, { kind: "session" }> =>
        item.kind === "session" && item.session.id === selectedSession.id,
    )?.session;
    if (refreshedSession) setSelectedSession(refreshedSession);
  }, [feedItems, selectedSession]);

  useEffect(
    () =>
      registerPullToRefresh("match", async () => {
        if (selectedMatch) {
          await loadSelectedMatch(selectedMatch.id);
          return;
        }
        if (selectedSession) {
          await loadSession(selectedSession.id, true, true);
          return;
        }
        await Promise.all([
          loadFeed(0, false, true, true),
          loadTodaySessions(),
        ]);
      }),
    [
      loadFeed,
      loadSelectedMatch,
      loadSession,
      loadTodaySessions,
      registerPullToRefresh,
      selectedMatch,
      selectedSession,
    ],
  );

  const refreshFeedAndSession = useCallback(async () => {
    await Promise.all([loadFeed(), loadTodaySessions()]);
    if (selectedSession) {
      await loadSession(selectedSession.id, true);
    }
  }, [loadFeed, loadSession, loadTodaySessions, selectedSession]);

  const handleSessionParticipantsChanged = useCallback(async () => {
    if (!selectedSession) return;

    await Promise.all([
      loadSessionDetail(selectedSession.id, true, true),
      loadTodaySessions(),
    ]);
  }, [loadSessionDetail, loadTodaySessions, selectedSession]);

  const handleMatchRecorded = useCallback(
    (recordedMatch: MatchInfo) => {
      const isSelected = recordedMatch.id === selectedMatchId;
      // "한 판 더"로 만든 새 경기는 피드에만 반영하고 상세는 수정한 경기를 유지한다
      if (isSelected) setSelectedMatch(recordedMatch);

      void (async () => {
        await refreshFeedAndSession();
        // 피드 항목이 상세를 덮어쓰므로 상세 응답으로 다시 맞춘다
        if (isSelected) await loadSelectedMatch(recordedMatch.id);
      })().catch(() => {
        // 저장은 이미 성공했으므로 상세 재조회 실패로 기록 시트의 완료 화면을 오류 화면으로 바꾸지 않는다.
        // 피드 조회 오류는 loadFeed가 직접 표시한다
      });
    },
    [loadSelectedMatch, refreshFeedAndSession, selectedMatchId],
  );

  const completeMatchDetailClose = useCallback(() => {
    setSelectedMatchId(null);
    setSelectedMatch(null);
    setSelectedMatchError(null);
    setIsLoadingSelectedMatch(false);
    restoreScrollTop("match");
  }, [restoreScrollTop]);

  const completeSessionDetailClose = useCallback(() => {
    selectedSessionIdRef.current = null;
    setSelectedSession(null);
    setSelectedSessionDetail(null);
    setSessionDetailError(null);
    setIsLoadingSessionDetail(false);
    setIsLoadingSession(false);
    setSelectedSessionMatches([]);
    setSessionError(null);
    restoreScrollTop("match");
  }, [restoreScrollTop]);

  const openMatchDetail = useCallback(
    (match: MatchInfo) => {
      saveScrollPosition("match");
      pushDepth("match", {
        id: `match-detail:${match.id}`,
        kind: "match-detail",
        onClose: noop,
      });
      setSelectedMatchId(match.id);
      setSelectedMatch(match);
      window.requestAnimationFrame(() => scrollToTop("auto"));
      void loadMatchDetail(match.id);
    },
    [
      loadMatchDetail,
      pushDepth,
      saveScrollPosition,
      scrollToTop,
    ],
  );

  const openSessionDetail = useCallback(
    (session: SessionCardSession | MatchSessionDetailInfo) => {
      saveScrollPosition("match");
      pushDepth("match", {
        id: `session-detail:${session.id}`,
        kind: "session-detail",
        onClose: noop,
      });
      selectedSessionIdRef.current = session.id;
      setSelectedSession(session);
      // 오늘 세션 카드에서 열면 이미 상세 응답이므로 참여자를 바로 보여 준다
      setSelectedSessionDetail(isSessionDetailInfo(session) ? session : null);
      setSessionDetailError(null);
      setSelectedSessionMatches([]);
      setSessionError(null);
      window.requestAnimationFrame(() => scrollToTop("auto"));
      void loadSession(session.id).catch(() => {});
    },
    [
      loadSession,
      pushDepth,
      saveScrollPosition,
      scrollToTop,
    ],
  );

  const handleSessionCreated = useCallback(
    (session: MatchSessionDetailInfo) => {
      void loadTodaySessions();
      openSessionDetail(session);
    },
    [loadTodaySessions, openSessionDetail],
  );

  const hasMoreItems = isOnline && feedItems.length < total;
  const sessionDepthId = selectedSession
    ? `session-detail:${selectedSession.id}`
    : null;
  const matchDepthId = selectedMatchId
    ? `match-detail:${selectedMatchId}`
    : null;
  const isSessionDrawerOpen =
    !!sessionDepthId && depthStacks.match.includes(sessionDepthId);
  const isMatchDrawerOpen =
    !!matchDepthId && depthStacks.match.includes(matchDepthId);

  const registerSessionScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      if (!sessionDepthId) return;
      registerScrollContainer("match", sessionDepthId, element);
    },
    [registerScrollContainer, sessionDepthId],
  );

  const registerMatchScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      if (!matchDepthId) return;
      registerScrollContainer("match", matchDepthId, element);
    },
    [matchDepthId, registerScrollContainer],
  );

  let matchDrawerContent: React.ReactNode = null;

  if (selectedMatchId && selectedMatchError && !isSelectedMatchLoading) {
    matchDrawerContent = (
      <div className="min-h-full">
        <DetailPageHeader title="Match Detail" tabKey="match" />
        <div className="p-2">
          <div className="flex flex-col gap-3">
            <TabPanelStatus
              message={selectedMatchError ?? undefined}
              tone="error"
            />
            <Button
              type="button"
              className="app-action-button w-full rounded-2xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
              onPress={() => void loadMatchDetail(selectedMatchId)}
            >
              다시 시도
            </Button>
          </div>
        </div>
      </div>
    );
  } else if (selectedMatchId && isSelectedMatchLoading && !selectedMatch) {
    matchDrawerContent = <MatchDetailSkeleton />;
  } else if (selectedMatch) {
    matchDrawerContent = (
      <MatchDetail
        match={selectedMatch}
        currentPlayerId={player?.id}
        onMatchRecorded={handleMatchRecorded}
        isOnline={isOnline}
        isLoading={isSelectedMatchLoading}
      />
    );
  }

  const sessionDrawerContent = selectedSession ? (
      <SessionDetail
        session={selectedSession}
        detail={selectedSessionDetail}
        isDetailLoading={isLoadingSessionDetail}
        detailError={sessionDetailError}
        matches={selectedSessionMatches}
        currentPlayerId={player?.id}
        isLoading={isLoadingSession}
        error={sessionError}
        isOnline={isOnline}
        onRetry={() => void loadSession(selectedSession.id)}
        onPressMatch={openMatchDetail}
        onParticipantsChanged={handleSessionParticipantsChanged}
        onMatchRecorded={handleMatchRecorded}
      />
    ) : null;

  return (
    <>
      <TabPanelHeader title="Matches">
        <Switch
          aria-label="내경기만 보기"
          className="shrink-0"
          isSelected={isMyMatchOnly}
          onChange={setIsMyMatchOnly}
          size="sm"
          style={
            {
              "--switch-control-bg": "#d1d5db",
              "--switch-control-bg-hover": "#cbd5e1",
              "--switch-control-bg-checked": "#3b52cc",
              "--switch-control-bg-checked-hover": "#2d42a8",
            } as React.CSSProperties
          }
        >
          <Switch.Content className="-mx-2 -my-1 min-h-11 gap-2 rounded-full px-2 py-1 text-pkpk-accent-font touch-manipulation">
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <span className="text-sm font-bold leading-none text-pkpk-primary-bg">
              내경기
            </span>
          </Switch.Content>
        </Switch>
      </TabPanelHeader>
      <div className="flex min-h-full p-2">
        <div className="mx-auto flex min-h-full w-full flex-1 flex-col gap-4">
          <TodaySessionSection
            today={todaySessions}
            isLoading={isLoadingTodaySessions}
            error={todaySessionsError}
            currentPlayerId={player?.id}
            isOnline={isOnline}
            onChanged={loadTodaySessions}
            onOpenSession={openSessionDetail}
            onSessionCreated={handleSessionCreated}
          />
          {notice ? (
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-pkpk-sub-font">
              {notice}
            </p>
          ) : null}

          {isMatchFeedLoading ? (
            <MatchFeedSkeleton />
          ) : error ? (
            <TabPanelStatus message={error} tone="error" />
          ) : feedItems.length === 0 ? (
            <TabPanelStatus
              message={
                isMyMatchOnly
                  ? "현재 표시할 내 경기가 없어요."
                  : "현재 표시할 매치가 없어요."
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {feedItems.map((item) =>
                item.kind === "session" ? (
                  <SessionCard
                    key={getFeedItemKey(item)}
                    session={item.session}
                    onPress={openSessionDetail}
                  />
                ) : (
                  <Match
                    key={item.match.id}
                    match={item.match}
                    currentPlayerId={player?.id}
                    onPress={openMatchDetail}
                  />
                ),
              )}
              {loadMoreError ? (
                <p
                  className="text-center text-sm font-medium text-error"
                  role="alert"
                >
                  {loadMoreError}
                </p>
              ) : null}
              {hasMoreItems ? (
                <LoadMoreButton
                  isLoading={isLoadingMore}
                  onPress={() => void loadFeed(nextPage, true)}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
      {selectedSession && sessionDepthId ? (
        <RightDrawer
          isOpen={isSessionDrawerOpen}
          isActive={selectedTab === "match"}
          ariaLabel="세션 상세"
          onExited={completeSessionDetailClose}
          onScrollContainerChange={registerSessionScrollContainer}
          onPullToRefresh={() => loadSession(selectedSession.id, true, true)}
        >
          {sessionDrawerContent}
        </RightDrawer>
      ) : null}
      {selectedMatchId && matchDepthId ? (
        <RightDrawer
          isOpen={isMatchDrawerOpen}
          isActive={selectedTab === "match"}
          ariaLabel="매치 상세"
          onExited={completeMatchDetailClose}
          onScrollContainerChange={registerMatchScrollContainer}
          onPullToRefresh={() => loadMatchDetail(selectedMatchId)}
          layer={60}
        >
          {matchDrawerContent}
        </RightDrawer>
      ) : null}
    </>
  );
};

export default Matches;
