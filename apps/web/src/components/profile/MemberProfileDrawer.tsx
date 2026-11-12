import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import RightDrawer from "@/components/RightDrawer";
import SkeletonBlock from "@/components/SkeletonBlock";
import PlayerMatchesDrawer from "@/components/profile/PlayerMatchesDrawer";
import ProfileStatTile from "@/components/profile/ProfileStatTile";
import {
  ProfileBodySkeleton,
  ProfileLoadError,
  ProfileRatingSection,
  RecentMatchesSection,
  WinRateTile,
} from "@/components/profile/ProfileSections";
import { useProfileOverview } from "@/components/profile/useProfileOverview";
import { DetailHeader } from "@/components/ui/Headers";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { StatusMessageChip } from "@/components/ui/StatusMessageChip";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { usePlayers } from "@/hooks/usePlayers";

export interface MemberProfileDrawerProps {
  playerId: string | null;
  tabKey: TabKey;
  onClose: () => void;
}

const PROFILE_DEPTH_ID = "global-member-profile";
const MATCH_HISTORY_DEPTH_ID = "global-member-match-history";

/** 전역 회원 프로필. 평점 카드·경기 승률·나와의 상대 전적·최근 경기 */
export default function MemberProfileDrawer({
  playerId,
  tabKey,
  onClose,
}: MemberProfileDrawerProps): React.ReactElement {
  const {
    registerScrollContainer,
    requestCloseTopDepth,
    restoreScrollTop,
    selectedTab,
  } = useTabNavigation();
  const { players, reload: reloadPlayers } = usePlayers();
  // 닫히는 애니메이션 동안 마지막 회원을 계속 보여 준다
  const [displayedPlayerId, setDisplayedPlayerId] = useState(playerId);
  const [category, setCategory] = useState<MatchTopLevelType>("doubles");
  const [isMatchHistoryRequested, setIsMatchHistoryRequested] = useState(false);
  const { overview, hasError, reload } = useProfileOverview(displayedPlayerId);

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

  useEffect(() => {
    if (playerId) setDisplayedPlayerId(playerId);
  }, [playerId]);

  // 다른 회원을 열면 분류를 처음(복식)으로 돌린다
  useEffect(() => {
    setCategory("doubles");
  }, [displayedPlayerId]);

  const refreshProfile = useCallback(async () => {
    await Promise.all([reloadPlayers(), reload({ throwOnError: true })]);
  }, [reload, reloadPlayers]);

  const handleProfileExited = useCallback(() => {
    setDisplayedPlayerId(null);
    setIsMatchHistoryRequested(false);
    restoreScrollTop(tabKey);
  }, [restoreScrollTop, tabKey]);

  const registerProfileScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      registerScrollContainer(tabKey, PROFILE_DEPTH_ID, element);
    },
    [registerScrollContainer, tabKey],
  );

  const member = useMemo(
    () => players.find((candidate) => candidate.id === displayedPlayerId) ?? null,
    [displayedPlayerId, players],
  );
  const username =
    member?.username ??
    overview?.rankings[category]?.entries.find(
      (entry) => entry.player.id === displayedPlayerId,
    )?.player.username ??
    "";

  if (!displayedPlayerId) return <></>;

  const totalStats = overview
    ? Object.values(overview.summary.matchStats).reduce(
        (sum, stats) => ({
          wins: sum.wins + stats.matchWins,
          losses: sum.losses + stats.matchLosses,
        }),
        { wins: 0, losses: 0 },
      )
    : null;
  const headToHead = overview?.summary.headToHead ?? null;

  return (
    <>
      <RightDrawer
        isOpen={isOpen}
        isActive={tabKey === selectedTab}
        ariaLabel="회원 프로필"
        onExited={handleProfileExited}
        onScrollContainerChange={registerProfileScrollContainer}
        onPullToRefresh={refreshProfile}
        layer={GLOBAL_LAYER.memberProfile}
      >
        <DetailHeader
          title={username}
          onBack={() => requestCloseTopDepth(tabKey)}
        />
        <div className="flex flex-col gap-2.5 px-4 pb-8">
          <div className="flex items-center gap-3 px-1 pb-1.5">
            <PlayerAvatar
              player={{
                id: displayedPlayerId,
                username,
                avatarUrl: member?.avatarUrl,
              }}
              size={56}
            />
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              {member?.statusMessage ? (
                <StatusMessageChip
                  message={member.statusMessage}
                  color={member.statusMessageBackgroundColor}
                />
              ) : null}
              {totalStats ? (
                <span className="text-pk-13 text-pk-sub tabular-nums">
                  {totalStats.wins + totalStats.losses}경기 · {totalStats.wins}승{" "}
                  {totalStats.losses}패
                </span>
              ) : (
                <SkeletonBlock className="h-4 w-32" />
              )}
            </div>
          </div>
          {overview ? (
            <>
              <ProfileRatingSection
                overview={overview}
                category={category}
                onCategoryChange={setCategory}
                fallbackRating={member?.duprRating?.[category] ?? null}
              />
              <div className="grid grid-cols-2 gap-2.5">
                <WinRateTile overview={overview} category={category} />
                <ProfileStatTile
                  label="나와의 상대 전적"
                  value={
                    headToHead && headToHead.matchCount > 0
                      ? `${headToHead.wins}승 ${headToHead.losses}패`
                      : "–"
                  }
                  foot={`내 기준 · ${headToHead?.matchCount ?? 0}경기`}
                />
              </div>
              <RecentMatchesSection
                title="최근 경기"
                matches={overview.summary.recentMatches}
                onViewAll={() => setIsMatchHistoryRequested(true)}
              />
            </>
          ) : hasError ? (
            <ProfileLoadError onRetry={() => void reload()} />
          ) : (
            <ProfileBodySkeleton />
          )}
        </div>
      </RightDrawer>
      <PlayerMatchesDrawer
        isOpen={isMatchHistoryRequested && !!playerId}
        tabKey={tabKey}
        playerId={displayedPlayerId}
        title={`${username} 경기`}
        initialCategory={category}
        depthId={MATCH_HISTORY_DEPTH_ID}
        layer={GLOBAL_LAYER.memberMatchHistory}
        onClose={closeMatchHistory}
      />
    </>
  );
}
