import React from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type { MatchInfo } from "@/types/match";
import SkeletonBlock from "@/components/SkeletonBlock";
import ProfileRatingCard from "@/components/profile/ProfileRatingCard";
import ProfileStatTile from "@/components/profile/ProfileStatTile";
import type { ProfileOverview } from "@/components/profile/useProfileOverview";
import { Card } from "@/components/ui/Card";
import { MatchRow } from "@/components/ui/MatchRow";
import { SectionLabel, TextLink } from "@/components/ui/Section";
import { useAppNavigation } from "@/context/AppNavigationContext";

const RECENT_MATCH_COUNT = 3;

/** 이 분류 랭킹에서 순위와 평점을 찾는다. 랭킹을 못 받았으면 회원 정보의 평점으로 대신한다 */
const getRankAndRating = (
  overview: ProfileOverview,
  category: MatchTopLevelType,
  fallbackRating: number | null,
) => {
  const ranking = overview.rankings[category];
  if (!ranking) return { rank: null, rating: fallbackRating };

  const entry = ranking.entries.find(
    (candidate) => candidate.player.id === overview.playerId,
  );
  return { rank: entry?.rank ?? null, rating: entry?.rating ?? null };
};

export const ProfileRatingSection: React.FC<{
  overview: ProfileOverview;
  category: MatchTopLevelType;
  onCategoryChange: (category: MatchTopLevelType) => void;
  fallbackRating: number | null;
}> = ({ overview, category, onCategoryChange, fallbackRating }) => {
  const { rank, rating } = getRankAndRating(overview, category, fallbackRating);
  return (
    <ProfileRatingCard
      category={category}
      onCategoryChange={onCategoryChange}
      rank={rank}
      rating={rating}
      last30Days={overview.summary.ratingDelta[category].last30Days}
      history={overview.summary.ratingHistory[category]}
    />
  );
};

/** 선택 분류의 경기 승률 타일 */
export const WinRateTile: React.FC<{
  overview: ProfileOverview;
  category: MatchTopLevelType;
}> = ({ overview, category }) => {
  const { matchWins, matchLosses } = overview.summary.matchStats[category];
  const total = matchWins + matchLosses;
  return (
    <ProfileStatTile
      label="경기 승률"
      value={total > 0 ? `${Math.round((matchWins / total) * 100)}%` : "–"}
      foot={`${matchWins}승 ${matchLosses}패`}
    />
  );
};

/** 최근 완료 경기 3개와 "전체 보기" */
export const RecentMatchesSection: React.FC<{
  title: string;
  matches: readonly MatchInfo[];
  /** 보는 사람 id. 주면 그 사람이 뛴 경기에 "내 경기"를 붙인다 */
  viewerPlayerId?: string;
  onViewAll: () => void;
}> = ({ title, matches, viewerPlayerId, onViewAll }) => {
  const { openMatchDetail } = useAppNavigation();
  // 진행 중 경기는 빼고 보인다
  const recentMatches = matches
    .filter((match) => match.status === "completed")
    .slice(0, RECENT_MATCH_COUNT);

  return (
    <section className="flex flex-col gap-2.5 pt-1">
      <SectionLabel
        right={
          <TextLink onPress={onViewAll} chevron>
            전체 보기
          </TextLink>
        }
      >
        {title}
      </SectionLabel>
      <Card>
        {recentMatches.length > 0 ? (
          recentMatches.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              currentPlayerId={viewerPlayerId}
              timeLabel="weekday-time"
              onPress={() => openMatchDetail(match.id)}
            />
          ))
        ) : (
          <p className="py-6 text-center text-pk-13 text-pk-muted">
            완료한 경기가 없어요.
          </p>
        )}
      </Card>
    </section>
  );
};

/** 평점 카드·타일·경기 목록 자리 스켈레톤 */
export const ProfileBodySkeleton: React.FC = () => (
  <div aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-2.5">
    <SkeletonBlock className="h-[268px] rounded-pk-lg" />
    <div className="grid grid-cols-2 gap-2.5">
      <SkeletonBlock className="h-[92px] rounded-pk-lg" />
      <SkeletonBlock className="h-[92px] rounded-pk-lg" />
    </div>
    <SkeletonBlock className="mt-3 h-[180px] rounded-pk-lg" />
  </div>
);

/** 불러오기 실패 안내 */
export const ProfileLoadError: React.FC<{ onRetry: () => void }> = ({
  onRetry,
}) => (
  <Card className="flex flex-col items-center gap-1 py-6">
    <p className="text-pk-15 font-bold text-pk-ink">프로필을 불러오지 못했어요.</p>
    <TextLink onPress={onRetry}>다시 시도</TextLink>
  </Card>
);
