import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { IoSettingsOutline } from "react-icons/io5";
import BottomSheet from "@/components/BottomSheet";
import type {
  MatchInfo,
  MatchListResponse,
  PlayerProfileSummaryResponse,
} from "@/components/Match";
import MemberProfile from "@/components/MemberProfile";
import ProfileMatchDetailDrawer from "@/components/ProfileMatchDetailDrawer";
import ProfileMatchHistoryDrawer from "@/components/ProfileMatchHistoryDrawer";
import ProfileSettingsSheetBody from "@/components/ProfileSettingsSheetBody";
import TabPanelHeader from "@/components/TabPanelHeader";
import { useAuth } from "@/context/AuthContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { apiFetch } from "@/lib/api";
import { isTabRefreshDue } from "@/lib/tabRefresh";
import {
  buildProfileMatchList,
  buildRecentProfileMatches,
  buildRatingHistory,
  createEmptyMatchStats,
  createEmptyRatingDelta,
  createEmptyRatingHistory,
} from "@/utils/matchStats";

const noop = () => {};
const MATCH_HISTORY_DEPTH_ID = "me-match-history";
const MATCH_HISTORY_PAGE_SIZE = 20;

const Me: React.FC = () => {
  const { player, isAuthenticated, refreshMe } = useAuth();
  const {
    closeDepth,
    depthStacks,
    pushDepth,
    registerPullToRefresh,
    registerScrollContainer,
    restoreScrollTop,
    saveScrollPosition,
    scrollToTop,
    selectedTab,
  } = useTabNavigation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [matchStats, setMatchStats] = useState(createEmptyMatchStats);
  const [ratingDelta, setRatingDelta] = useState(createEmptyRatingDelta);
  const [ratingHistory, setRatingHistory] = useState(createEmptyRatingHistory);
  const [profileMatches, setProfileMatches] = useState<MatchInfo[]>([]);
  const [isMatchStatsLoading, setIsMatchStatsLoading] = useState(true);
  const [isMatchHistoryRequested, setIsMatchHistoryRequested] = useState(false);
  const [isMatchHistoryLoading, setIsMatchHistoryLoading] = useState(false);
  const [matchHistoryPage, setMatchHistoryPage] = useState(0);
  const [matchHistoryTotal, setMatchHistoryTotal] = useState(0);
  const [selectedProfileMatch, setSelectedProfileMatch] =
    useState<MatchInfo | null>(null);
  const lastSuccessfulLoadAtRef = useRef<number | null>(null);
  const wasTabActiveRef = useRef(false);
  const playerId = player?.id;

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const loadMatchStats = useCallback(
    async (
      signal: AbortSignal,
      preserveVisibleData = false,
      throwOnError = false,
    ) => {
      if (!isAuthenticated || !playerId) {
        lastSuccessfulLoadAtRef.current = null;
        setMatchStats(createEmptyMatchStats());
        setRatingDelta(createEmptyRatingDelta());
        setRatingHistory(createEmptyRatingHistory());
        setProfileMatches([]);
        setIsMatchStatsLoading(false);
        return;
      }

      if (!preserveVisibleData) {
        setIsMatchStatsLoading(true);
      }

      try {
        const res = await apiFetch(
          `/api/players/${encodeURIComponent(playerId)}/profile-summary`,
          { signal },
        );

        if (!res.ok) {
          throw new Error("매치 목록을 불러오지 못했습니다.");
        }

        const data = (await res.json()) as PlayerProfileSummaryResponse;

        if (!signal.aborted) {
          setMatchStats(data.matchStats);
          setRatingDelta(data.ratingDelta);
          setProfileMatches(data.recentMatches);
          setRatingHistory(buildRatingHistory(data.ratingHistory));
          setMatchHistoryPage(0);
          setMatchHistoryTotal(0);
          lastSuccessfulLoadAtRef.current = Date.now();
        }
      } catch {
        if (!signal.aborted && !preserveVisibleData) {
          setMatchStats(createEmptyMatchStats());
          setRatingDelta(createEmptyRatingDelta());
          setRatingHistory(createEmptyRatingHistory());
          setProfileMatches([]);
        }
        if (!signal.aborted && throwOnError) {
          throw new Error("내 경기 통계를 새로고침하지 못했습니다.");
        }
      } finally {
        if (!signal.aborted && !preserveVisibleData) {
          setIsMatchStatsLoading(false);
        }
      }
  },
    [playerId, isAuthenticated],
  );

  const loadMatchHistory = useCallback(
    async (page: number, append = false) => {
      if (!isAuthenticated || !playerId) return;

      setIsMatchHistoryLoading(true);
      try {
        const searchParams = new URLSearchParams({
          playerId,
          page: String(page),
          limit: String(MATCH_HISTORY_PAGE_SIZE),
        });
        const res = await apiFetch(`/api/matches?${searchParams.toString()}`);
        if (!res.ok) throw new Error("매치 목록을 불러오지 못했습니다.");

        const data = (await res.json()) as MatchListResponse;
        setProfileMatches((current) => {
          if (!append) return data.matches;
          const ids = new Set(current.map((match) => match.id));
          return [...current, ...data.matches.filter((match) => !ids.has(match.id))];
        });
        setMatchHistoryPage(page + 1);
        setMatchHistoryTotal(data.total);
      } finally {
        setIsMatchHistoryLoading(false);
      }
    },
    [playerId, isAuthenticated],
  );

  useEffect(() => {
    const isTabActive = selectedTab === "me";
    if (!isTabActive) {
      wasTabActiveRef.current = false;
      return;
    }

    if (wasTabActiveRef.current) return;

    wasTabActiveRef.current = true;
    if (!isTabRefreshDue(lastSuccessfulLoadAtRef.current)) return;

    const abortController = new AbortController();
    void loadMatchStats(
      abortController.signal,
      lastSuccessfulLoadAtRef.current !== null,
    );

    return () => {
      abortController.abort();
      // React Strict Mode와 인증 정보 갱신으로 effect가 다시 실행될 때,
      // 취소된 첫 요청 때문에 다음 요청까지 막히지 않도록 한다.
      wasTabActiveRef.current = false;
    };
  }, [loadMatchStats, selectedTab]);

  useEffect(() => {
    if (!isAuthenticated || !playerId) {
      lastSuccessfulLoadAtRef.current = null;
      setMatchStats(createEmptyMatchStats());
      setRatingDelta(createEmptyRatingDelta());
      setRatingHistory(createEmptyRatingHistory());
      setProfileMatches([]);
      setIsMatchStatsLoading(false);
    }
  }, [playerId, isAuthenticated]);

  useEffect(
    () =>
      registerPullToRefresh("me", async () => {
        await refreshMe();
        const abortController = new AbortController();
        await loadMatchStats(abortController.signal, true, true);
      }),
    [loadMatchStats, refreshMe, registerPullToRefresh],
  );

  const openSettings = () => {
    pushDepth("me", {
      id: "me-settings",
      kind: "bottom-sheet",
      onClose: closeSettings,
    });
    setIsSettingsOpen(true);
  };

  const handleSettingsOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      openSettings();
      return;
    }

    closeDepth("me", "me-settings");
    setIsSettingsOpen(false);
  };

  const profileMatchList = useMemo(
    () => (playerId ? buildProfileMatchList(profileMatches, playerId) : []),
    [playerId, profileMatches],
  );
  const recentProfileMatches = useMemo(
    () => (playerId ? buildRecentProfileMatches(profileMatches, playerId) : []),
    [playerId, profileMatches],
  );
  const isMatchHistoryDrawerOpen =
    isMatchHistoryRequested && depthStacks.me.includes(MATCH_HISTORY_DEPTH_ID);
  const profileMatchDetailDepthId = selectedProfileMatch
    ? `me-match-detail:${selectedProfileMatch.id}`
    : null;
  const isProfileMatchDetailDrawerOpen =
    !!profileMatchDetailDepthId && depthStacks.me.includes(profileMatchDetailDepthId);

  const registerMatchHistoryScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      registerScrollContainer("me", MATCH_HISTORY_DEPTH_ID, element);
    },
    [registerScrollContainer],
  );
  const registerProfileMatchDetailScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      if (!profileMatchDetailDepthId) return;
      registerScrollContainer("me", profileMatchDetailDepthId, element);
    },
    [profileMatchDetailDepthId, registerScrollContainer],
  );

  const openMatchHistory = () => {
    saveScrollPosition("me");
    pushDepth("me", {
      id: MATCH_HISTORY_DEPTH_ID,
      kind: "match-history",
      onClose: noop,
    });
    setIsMatchHistoryRequested(true);
    void loadMatchHistory(0);
    window.requestAnimationFrame(() => scrollToTop("auto"));
  };

  const openProfileMatchDetail = (match: MatchInfo) => {
    saveScrollPosition("me");
    pushDepth("me", {
      id: `me-match-detail:${match.id}`,
      kind: "match-detail",
      onClose: noop,
    });
    setSelectedProfileMatch(match);
    window.requestAnimationFrame(() => scrollToTop("auto"));
  };

  const completeMatchHistoryClose = useCallback(() => {
    setIsMatchHistoryRequested(false);
    restoreScrollTop("me");
  }, [restoreScrollTop]);

  const completeProfileMatchDetailClose = useCallback(() => {
    setSelectedProfileMatch(null);
    restoreScrollTop("me");
  }, [restoreScrollTop]);

  const settingsButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="rounded-full border-0 px-0 font-bold !text-pkpk-primary-bg"
      onPress={openSettings}
    >
      <IoSettingsOutline className="size-4" />
      설정
    </Button>
  );

  return (
    <>
      <TabPanelHeader title="Me">{settingsButton}</TabPanelHeader>
      <MemberProfile
        player={player}
        isMe
        showDetailHeader={false}
        matchStats={matchStats}
        ratingDelta={ratingDelta}
        ratingHistory={ratingHistory}
        isStatsLoading={isMatchStatsLoading}
        recentMatches={recentProfileMatches}
        showPlayerId
        onPressRecentMatch={openProfileMatchDetail}
        onViewAllMatches={openMatchHistory}
      />

      <ProfileMatchHistoryDrawer
        isOpen={isMatchHistoryDrawerOpen}
        isActive={selectedTab === "me"}
        tabKey="me"
        matches={profileMatchList}
        isLoading={isMatchHistoryLoading}
        hasMore={profileMatches.length < matchHistoryTotal}
        isLoadingMore={isMatchHistoryLoading && profileMatches.length > 0}
        onLoadMore={() => void loadMatchHistory(matchHistoryPage, true)}
        onPullToRefresh={() => loadMatchHistory(0)}
        onPressMatch={openProfileMatchDetail}
        onExited={completeMatchHistoryClose}
        onScrollContainerChange={registerMatchHistoryScrollContainer}
        layer={60}
      />
      <ProfileMatchDetailDrawer
        isOpen={isProfileMatchDetailDrawerOpen}
        isActive={selectedTab === "me"}
        tabKey="me"
        match={selectedProfileMatch}
        currentPlayerId={playerId}
        onExited={completeProfileMatchDetailClose}
        onScrollContainerChange={registerProfileMatchDetailScrollContainer}
        layer={70}
      />

      <BottomSheet
        isOpen={isSettingsOpen}
        isActive={selectedTab === "me"}
        onOpenChange={handleSettingsOpenChange}
        ariaLabel="설정"
      >
        <ProfileSettingsSheetBody />
      </BottomSheet>
    </>
  );
};

export default Me;
