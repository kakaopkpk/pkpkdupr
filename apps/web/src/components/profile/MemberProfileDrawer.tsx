import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MatchInfo,
  MatchListResponse,
  PlayerProfileSummaryResponse,
} from "@/components/Match";
import MemberProfile from "@/components/MemberProfile";
import ProfileMatchHistoryDrawer from "@/components/ProfileMatchHistoryDrawer";
import RightDrawer from "@/components/RightDrawer";
import {
  GLOBAL_LAYER,
  useAppNavigation,
} from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { usePlayers } from "@/hooks/usePlayers";
import { apiFetch } from "@/lib/api";
import {
  buildProfileMatchList,
  buildRecentProfileMatches,
  buildRatingHistory,
  createEmptyMatchStats,
  createEmptyRatingDelta,
  createEmptyRatingHistory,
} from "@/utils/matchStats";

export interface MemberProfileDrawerProps {
  playerId: string | null;
  tabKey: TabKey;
  onClose: () => void;
}

const PROFILE_DEPTH_ID = "global-member-profile";
const MATCH_HISTORY_DEPTH_ID = "global-member-match-history";
const MATCH_HISTORY_PAGE_SIZE = 20;

/** 전역 회원 프로필. 지금은 기존 MemberProfile과 경기 기록 드로어를 감싼다 */
export default function MemberProfileDrawer({
  playerId,
  tabKey,
  onClose,
}: MemberProfileDrawerProps): React.ReactElement {
  const { isAuthenticated } = useAuth();
  const { openMatchDetail } = useAppNavigation();
  const { registerScrollContainer, restoreScrollTop, selectedTab } =
    useTabNavigation();
  const { players, reload: reloadPlayers } = usePlayers();
  // 닫히는 애니메이션 동안 마지막 회원을 계속 보여 준다
  const [displayedPlayerId, setDisplayedPlayerId] = useState(playerId);
  const [matchStats, setMatchStats] = useState(createEmptyMatchStats);
  const [ratingDelta, setRatingDelta] = useState(createEmptyRatingDelta);
  const [ratingHistory, setRatingHistory] = useState(createEmptyRatingHistory);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [isMatchHistoryRequested, setIsMatchHistoryRequested] = useState(false);
  const [isMatchHistoryLoading, setIsMatchHistoryLoading] = useState(false);
  const [matchHistoryPage, setMatchHistoryPage] = useState(0);
  const [matchHistoryTotal, setMatchHistoryTotal] = useState(0);
  const requestIdRef = useRef(0);

  const isOpen = useLayerDepth({
    isOpen: !!playerId,
    tabKey,
    depthId: PROFILE_DEPTH_ID,
    kind: "member-profile",
    onClose,
    saveScroll: true,
  });
  const closeMatchHistory = useCallback(
    () => setIsMatchHistoryRequested(false),
    [],
  );
  const isMatchHistoryOpen = useLayerDepth({
    isOpen: isMatchHistoryRequested && !!playerId,
    tabKey,
    depthId: MATCH_HISTORY_DEPTH_ID,
    kind: "match-history",
    onClose: closeMatchHistory,
    saveScroll: true,
  });

  const loadSummary = useCallback(
    async (memberId: string, preserveVisibleData = false, throwOnError = false) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      if (!isAuthenticated) return;

      if (!preserveVisibleData) {
        setMatchStats(createEmptyMatchStats());
        setRatingDelta(createEmptyRatingDelta());
        setRatingHistory(createEmptyRatingHistory());
        setMatches([]);
        setIsStatsLoading(true);
      }

      try {
        const res = await apiFetch(
          `/api/players/${encodeURIComponent(memberId)}/profile-summary`,
        );
        if (!res.ok) throw new Error("매치 목록을 불러오지 못했습니다.");

        const data = (await res.json()) as PlayerProfileSummaryResponse;
        if (requestIdRef.current !== requestId) return;
        setMatchStats(data.matchStats);
        setRatingDelta(data.ratingDelta);
        setMatches(data.recentMatches);
        setRatingHistory(buildRatingHistory(data.ratingHistory));
        setMatchHistoryPage(0);
        setMatchHistoryTotal(0);
      } catch (err) {
        if (throwOnError) throw err;
      } finally {
        if (requestIdRef.current === requestId && !preserveVisibleData) {
          setIsStatsLoading(false);
        }
      }
    },
    [isAuthenticated],
  );

  const loadMatchHistory = useCallback(
    async (memberId: string, page: number, append = false) => {
      if (!isAuthenticated) return;

      setIsMatchHistoryLoading(true);
      try {
        const searchParams = new URLSearchParams({
          playerId: memberId,
          page: String(page),
          limit: String(MATCH_HISTORY_PAGE_SIZE),
        });
        const res = await apiFetch(`/api/matches?${searchParams.toString()}`);
        if (!res.ok) throw new Error("매치 목록을 불러오지 못했습니다.");

        const data = (await res.json()) as MatchListResponse;
        setMatches((current) => {
          if (!append) return data.matches;
          const ids = new Set(current.map((match) => match.id));
          return [
            ...current,
            ...data.matches.filter((match) => !ids.has(match.id)),
          ];
        });
        setMatchHistoryPage(page + 1);
        setMatchHistoryTotal(data.total);
      } finally {
        setIsMatchHistoryLoading(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    if (!playerId) return;

    setDisplayedPlayerId(playerId);
    void loadSummary(playerId);
  }, [loadSummary, playerId]);

  const refreshProfile = useCallback(async () => {
    if (!displayedPlayerId) return;
    await Promise.all([
      reloadPlayers(),
      loadSummary(displayedPlayerId, true, true),
    ]);
  }, [displayedPlayerId, loadSummary, reloadPlayers]);

  const openMatchHistory = () => {
    if (!displayedPlayerId) return;
    setIsMatchHistoryRequested(true);
    void loadMatchHistory(displayedPlayerId, 0);
  };

  const handleProfileExited = useCallback(() => {
    setDisplayedPlayerId(null);
    setIsStatsLoading(false);
    setIsMatchHistoryRequested(false);
    restoreScrollTop(tabKey);
  }, [restoreScrollTop, tabKey]);

  const handleMatchHistoryExited = useCallback(() => {
    restoreScrollTop(tabKey);
  }, [restoreScrollTop, tabKey]);

  const registerProfileScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      registerScrollContainer(tabKey, PROFILE_DEPTH_ID, element);
    },
    [registerScrollContainer, tabKey],
  );
  const registerMatchHistoryScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      registerScrollContainer(tabKey, MATCH_HISTORY_DEPTH_ID, element);
    },
    [registerScrollContainer, tabKey],
  );

  const member = useMemo(
    () => players.find((candidate) => candidate.id === displayedPlayerId) ?? null,
    [displayedPlayerId, players],
  );
  const profileMatchList = useMemo(
    () =>
      displayedPlayerId ? buildProfileMatchList(matches, displayedPlayerId) : [],
    [displayedPlayerId, matches],
  );
  const recentMatches = useMemo(
    () =>
      displayedPlayerId
        ? buildRecentProfileMatches(matches, displayedPlayerId)
        : [],
    [displayedPlayerId, matches],
  );
  const isActive = tabKey === selectedTab;

  if (!displayedPlayerId) return <></>;

  return (
    <>
      <RightDrawer
        isOpen={isOpen}
        isActive={isActive}
        ariaLabel="멤버 프로필"
        onExited={handleProfileExited}
        onScrollContainerChange={registerProfileScrollContainer}
        onPullToRefresh={refreshProfile}
        layer={GLOBAL_LAYER.memberProfile}
      >
        <MemberProfile
          player={member}
          isMe={false}
          matchStats={matchStats}
          ratingDelta={ratingDelta}
          ratingHistory={ratingHistory}
          isStatsLoading={isStatsLoading}
          recentMatches={recentMatches}
          onPressRecentMatch={(match) => openMatchDetail(match.id)}
          onViewAllMatches={openMatchHistory}
        />
      </RightDrawer>
      <ProfileMatchHistoryDrawer
        isOpen={isMatchHistoryOpen}
        isActive={isActive}
        tabKey={tabKey}
        matches={profileMatchList}
        isLoading={isMatchHistoryLoading}
        hasMore={matches.length < matchHistoryTotal}
        isLoadingMore={isMatchHistoryLoading && matches.length > 0}
        onLoadMore={() =>
          void loadMatchHistory(displayedPlayerId, matchHistoryPage, true)
        }
        onPullToRefresh={() => loadMatchHistory(displayedPlayerId, 0)}
        onPressMatch={(match) => openMatchDetail(match.id)}
        onExited={handleMatchHistoryExited}
        onScrollContainerChange={registerMatchHistoryScrollContainer}
        layer={GLOBAL_LAYER.memberMatchHistory}
      />
    </>
  );
}
