import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import { IoSettingsOutline } from "react-icons/io5";
import AchievementsScreen from "@/components/profile/AchievementsScreen";
import AchievementsSection from "@/components/profile/AchievementsSection";
import PartnerChemistryCard from "@/components/profile/PartnerChemistryCard";
import PlayerMatchesDrawer from "@/components/profile/PlayerMatchesDrawer";
import ProfileStatTile from "@/components/profile/ProfileStatTile";
import RivalCard from "@/components/profile/RivalCard";
import {
  ProfileBodySkeleton,
  ProfileLoadError,
  ProfileRatingSection,
  RecentMatchesSection,
  WinRateTile,
} from "@/components/profile/ProfileSections";
import { useProfileOverview } from "@/components/profile/useProfileOverview";
import { RatingDelta } from "@/components/ui/Delta";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SectionLabel } from "@/components/ui/Section";
import { StatusMessageChip } from "@/components/ui/StatusMessageChip";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { isTabRefreshDue } from "@/lib/tabRefresh";

const MATCH_HISTORY_DEPTH_ID = "me-match-history";
const ACHIEVEMENTS_DEPTH_ID = "me-achievements";

const Me: React.FC = () => {
  const { player, isAuthenticated, refreshMe } = useAuth();
  const { openSettings } = useAppNavigation();
  const { registerPullToRefresh, selectedTab } = useTabNavigation();
  const playerId = isAuthenticated ? (player?.id ?? null) : null;
  const { overview, hasError, lastLoadedAt, reload } =
    useProfileOverview(playerId);
  const [category, setCategory] = useState<MatchTopLevelType>("doubles");
  const [isMatchHistoryRequested, setIsMatchHistoryRequested] = useState(false);
  const [isAchievementsRequested, setIsAchievementsRequested] = useState(false);
  const wasTabActiveRef = useRef(false);

  useEffect(
    () =>
      registerPullToRefresh("me", async () => {
        await Promise.all([refreshMe(), reload({ throwOnError: true })]);
      }),
    [refreshMe, registerPullToRefresh, reload],
  );

  // 오래 지난 뒤 나 탭으로 돌아오면 보이는 내용을 유지한 채 새로 받는다
  useEffect(() => {
    const isTabActive = selectedTab === "me";
    if (!isTabActive) {
      wasTabActiveRef.current = false;
      return;
    }
    if (wasTabActiveRef.current) return;
    wasTabActiveRef.current = true;
    if (lastLoadedAt !== null && isTabRefreshDue(lastLoadedAt)) void reload();
  }, [lastLoadedAt, reload, selectedTab]);

  const closeMatchHistory = useCallback(
    () => setIsMatchHistoryRequested(false),
    [],
  );
  const closeAchievements = useCallback(
    () => setIsAchievementsRequested(false),
    [],
  );

  const username = player?.username ?? "";
  const ratingDelta = overview?.summary.ratingDelta[category];
  const partners = overview?.summary.partners ?? [];
  const rivals = overview?.summary.rivals ?? [];
  const achievements = overview?.summary.achievements ?? [];

  return (
    <>
      <header className="flex items-center gap-3 pt-4 pr-4 pb-4 pl-5">
        {player ? (
          <PlayerAvatar
            player={{ id: player.id, username, avatarUrl: player.avatarUrl }}
            size={52}
          />
        ) : (
          <span className="size-[52px] shrink-0 animate-pulse rounded-full bg-pk-neutral" />
        )}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <h1 className="max-w-full truncate text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
            {username}
          </h1>
          {player?.statusMessage ? (
            <StatusMessageChip
              message={player.statusMessage}
              color={player.statusMessageBackgroundColor}
            />
          ) : null}
        </div>
        <button
          type="button"
          aria-label="설정"
          onClick={openSettings}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-pk-sub active:bg-pk-neutral"
        >
          <IoSettingsOutline className="size-[22px]" />
        </button>
      </header>

      <div className="flex flex-col gap-2.5 px-4">
        {overview && ratingDelta ? (
          <>
            <ProfileRatingSection
              overview={overview}
              category={category}
              onCategoryChange={setCategory}
              fallbackRating={player?.duprRating?.[category] ?? null}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <WinRateTile overview={overview} category={category} />
              <ProfileStatTile
                label="최근 7일"
                value={
                  <RatingDelta
                    value={ratingDelta.last7Days}
                    className="!text-pk-22 leading-[1.4]"
                  />
                }
                foot={`${ratingDelta.last7DaysMatchCount}경기`}
              />
            </div>
            {partners.length > 0 ? (
              <section className="flex flex-col gap-2.5 pt-1">
                <SectionLabel>파트너 궁합</SectionLabel>
                <PartnerChemistryCard partners={partners} />
              </section>
            ) : null}
            <section className="flex flex-col gap-2.5 pt-1">
              <SectionLabel>상성 · 자주 진 상대</SectionLabel>
              <RivalCard rivals={rivals} />
            </section>
            {playerId ? (
              <AchievementsSection
                playerId={playerId}
                progress={achievements}
                variant="me"
                onViewAll={() => setIsAchievementsRequested(true)}
              />
            ) : null}
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
