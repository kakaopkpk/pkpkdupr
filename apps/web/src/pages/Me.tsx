import React, { useCallback, useEffect, useState } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import { IoSettingsOutline } from "react-icons/io5";
import { cx } from "@/components/ui/cx";
import { buttonPressClassName } from "@/components/ui/Button";
import AchievementsScreen from "@/components/profile/AchievementsScreen";
import AchievementsSection from "@/components/profile/AchievementsSection";
import PartnerRivalSections from "@/components/profile/PartnerRivalSections";
import PlayerMatchesDrawer from "@/components/profile/PlayerMatchesDrawer";
import ProfileHeader from "@/components/profile/ProfileHeader";
import {
  Last7DaysTile,
  ProfileBodySkeleton,
  ProfileLoadError,
  ProfileRatingSection,
  RecentMatchesSection,
  WinRateTile,
} from "@/components/profile/ProfileSections";
import { useProfileOverview } from "@/components/profile/useProfileOverview";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useTabNavigation } from "@/context/TabNavigationContext";

const MATCH_HISTORY_DEPTH_ID = "me-match-history";
const ACHIEVEMENTS_DEPTH_ID = "me-achievements";

const Me: React.FC = () => {
  const { player, isAuthenticated, refreshMe } = useAuth();
  const { openSettings } = useAppNavigation();
  const { registerPullToRefresh } = useTabNavigation();
  const playerId = isAuthenticated ? (player?.id ?? null) : null;
  const { overview, hasError, loadErrorMessage, reload } =
    useProfileOverview(playerId);
  const [category, setCategory] = useState<MatchTopLevelType>("doubles");
  const [isMatchHistoryRequested, setIsMatchHistoryRequested] = useState(false);
  const [isAchievementsRequested, setIsAchievementsRequested] = useState(false);

  useEffect(
    () =>
      registerPullToRefresh("me", async () => {
        await Promise.all([refreshMe(), reload({ throwOnError: true })]);
      }),
    [refreshMe, registerPullToRefresh, reload],
  );

  const closeMatchHistory = useCallback(
    () => setIsMatchHistoryRequested(false),
    [],
  );
  const closeAchievements = useCallback(
    () => setIsAchievementsRequested(false),
    [],
  );

  const username = player?.username ?? "";
  const achievements = overview?.summary.achievements ?? [];

  return (
    <>
      <ProfileHeader
        className="pt-4 pr-4 pb-4 pl-5"
        tabKey="me"
        player={
          player ? { id: player.id, username, avatarUrl: player.avatarUrl } : null
        }
        statusMessage={player?.statusMessage}
        statusMessageBackgroundColor={player?.statusMessageBackgroundColor}
        matchStats={overview?.summary.matchStats}
        winStreak={overview?.summary.winStreak}
        hideStats={hasError}
        right={
          <button
            type="button"
            aria-label="설정"
            onClick={openSettings}
            className={cx("flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-pk-sub", buttonPressClassName)}
          >
            <IoSettingsOutline className="size-[22px]" />
          </button>
        }
      />

      <div className="flex flex-col gap-2.5 px-4">
        {overview ? (
          <>
            <ProfileRatingSection
              overview={overview}
              category={category}
              onCategoryChange={setCategory}
              fallbackRating={player?.duprRating?.[category] ?? null}
            />
            {/* 분류를 바꾸면 key로 다시 마운트해 카운트업을 처음부터 재생한다 */}
            <div key={category} className="grid grid-cols-2 gap-2.5">
              <WinRateTile overview={overview} category={category} />
              <Last7DaysTile overview={overview} category={category} />
            </div>
            <PartnerRivalSections
              partners={overview.summary.partners}
              rivals={overview.summary.rivals}
              tabKey="me"
              depthId="me"
            />
            {playerId ? (
              <AchievementsSection
                playerId={playerId}
                progress={achievements}
                onViewAll={() => setIsAchievementsRequested(true)}
              />
            ) : null}
            <RecentMatchesSection
              title="최근 경기"
              matches={overview.summary.recentMatches}
              ownerPlayerId={playerId ?? undefined}
              onViewAll={() => setIsMatchHistoryRequested(true)}
            />
          </>
        ) : hasError ? (
          <ProfileLoadError
            message={loadErrorMessage}
            onRetry={() => void reload()}
          />
        ) : (
          <ProfileBodySkeleton />
        )}
      </div>

      <PlayerMatchesDrawer
        isOpen={isMatchHistoryRequested}
        tabKey="me"
        playerId={playerId}
        title="내 경기"
        initialCategory={category}
        depthId={MATCH_HISTORY_DEPTH_ID}
        onClose={closeMatchHistory}
      />
      <AchievementsScreen
        isOpen={isAchievementsRequested}
        tabKey="me"
        depthId={ACHIEVEMENTS_DEPTH_ID}
        playerId={playerId}
        progress={achievements}
        onClose={closeAchievements}
      />
    </>
  );
};

export default Me;
