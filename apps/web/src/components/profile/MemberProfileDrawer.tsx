import React, { useCallback, useMemo, useState } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import PushScreen from "@/components/PushScreen";
import AchievementsSection from "@/components/profile/AchievementsSection";
import SkeletonBlock from "@/components/SkeletonBlock";
import PlayerMatchesDrawer from "@/components/profile/PlayerMatchesDrawer";
import ProfileStatTile, {
  PROFILE_STAT_COUNT,
  WinLossCount,
} from "@/components/profile/ProfileStatTile";
import {
  ProfileBodySkeleton,
  ProfileLoadError,
  ProfileRatingSection,
  RecentMatchesSection,
  WinRateTile,
} from "@/components/profile/ProfileSections";
import { useProfileOverview } from "@/components/profile/useProfileOverview";
import { CountUpNumber } from "@/components/ui/CountUpNumber";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { StatusMessageChip } from "@/components/ui/StatusMessageChip";
import { useAuth } from "@/context/AuthContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { usePlayers } from "@/hooks/usePlayers";

export interface MemberProfileDrawerProps {
  playerId: string;
  /** 열어 달라는 요청. false가 되면 닫히는 움직임 뒤 onExited를 부른다 */
  isOpen: boolean;
  tabKey: TabKey;
  /** 화면 스택에서 이 화면을 구분하는 깊이 id */
  depthId: string;
  onClose: () => void;
  onExited: () => void;
}

/** 전역 회원 프로필 화면. 평점 카드·경기 승률·나와의 상대 전적·받은 업적·최근 경기 */
export default function MemberProfileDrawer({
  playerId,
  isOpen: isRequested,
  tabKey,
  depthId,
  onClose,
  onExited,
}: MemberProfileDrawerProps): React.ReactElement {
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  const { players, reload: reloadPlayers } = usePlayers();
  const { player: viewer } = useAuth();
  const [category, setCategory] = useState<MatchTopLevelType>("doubles");
  const [isMatchHistoryRequested, setIsMatchHistoryRequested] = useState(false);
  const { overview, hasError, reload } = useProfileOverview(playerId);

  const isOpen = useLayerDepth({
    isOpen: isRequested,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });
  const closeMatchHistory = useCallback(
    () => setIsMatchHistoryRequested(false),
    [],
  );

  const refreshProfile = useCallback(async () => {
    await Promise.all([reloadPlayers(), reload({ throwOnError: true })]);
  }, [reload, reloadPlayers]);

  const handleProfileExited = useCallback(() => {
    restoreScrollTop(tabKey);
    onExited();
  }, [onExited, restoreScrollTop, tabKey]);

  const close = useCallback(() => {
    if (!closeDepth(tabKey, depthId)) onClose();
  }, [closeDepth, depthId, onClose, tabKey]);

  const member = useMemo(
    () => players.find((candidate) => candidate.id === playerId) ?? null,
    [playerId, players],
  );
  const username =
    member?.username ??
    overview?.rankings[category]?.entries.find(
      (entry) => entry.player.id === playerId,
    )?.player.username ??
    "";

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
      <PushScreen
        isOpen={isOpen}
        isActive={tabKey === selectedTab}
        ariaLabel="회원 프로필"
        title={username}
        onBack={close}
        onExited={handleProfileExited}
        onPullToRefresh={refreshProfile}
      >
        <div className="flex flex-col gap-2.5 px-4 pb-8">
          <div className="flex items-center gap-3 px-1 pb-1.5">
            <PlayerAvatar
              player={{
                id: playerId,
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
                  {/* 머리 줄은 평점 카드와 함께 바로 센다 */}
                  <CountUpNumber
                    value={totalStats.wins + totalStats.losses}
                    durationMs={PROFILE_STAT_COUNT.durationMs}
                  />
                  경기 ·{" "}
                  <WinLossCount
                    wins={totalStats.wins}
                    losses={totalStats.losses}
                    delayMs={0}
                  />
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
                {/* 분류를 바꾸면 key로 다시 마운트해 카운트업을 처음부터 재생한다. 상대 전적은 분류와 무관해 그대로 둔다 */}
                <WinRateTile
                  key={category}
                  overview={overview}
                  category={category}
                />
                <ProfileStatTile
                  label="나와의 상대 전적"
                  value={
                    headToHead && headToHead.matchCount > 0 ? (
                      <WinLossCount
                        wins={headToHead.wins}
                        losses={headToHead.losses}
                      />
                    ) : (
                      "–"
                    )
                  }
                  foot={`내 기준 · ${headToHead?.matchCount ?? 0}경기`}
                />
              </div>
              <AchievementsSection
                playerId={playerId}
                progress={overview.summary.achievements}
                variant="member"
                badgeSize={44}
              />
              <RecentMatchesSection
                title="최근 경기"
                matches={overview.summary.recentMatches}
                viewerPlayerId={viewer?.id}
                onViewAll={() => setIsMatchHistoryRequested(true)}
              />
            </>
          ) : hasError ? (
            <ProfileLoadError onRetry={() => void reload()} />
          ) : (
            <ProfileBodySkeleton />
          )}
        </div>
      </PushScreen>
      <PlayerMatchesDrawer
        isOpen={isMatchHistoryRequested && isRequested}
        tabKey={tabKey}
        playerId={playerId}
        title={`${username} 경기`}
        initialCategory={category}
        depthId={`${depthId}:matches`}
        onClose={closeMatchHistory}
      />
    </>
  );
}
