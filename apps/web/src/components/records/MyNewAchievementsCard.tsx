import React from "react";
import type { AchievementDefinition } from "@pkpkdupr/shared/achievements";
import AchievementBadge from "@/components/profile/AchievementBadge";
import { Card } from "@/components/ui/Card";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { getAchievementDefinition } from "@/lib/achievements";
import type { MatchSessionReportInfo } from "@/lib/rankings";

/** 세션 리포트 업적 중 그 회원이 받은 업적 정의 */
export const getPlayerSessionAchievements = (
  report: Pick<MatchSessionReportInfo, "achievements">,
  playerId: string | undefined,
): AchievementDefinition[] =>
  playerId
    ? report.achievements.flatMap((item) => {
        const definition =
          item.playerId === playerId
            ? getAchievementDefinition(item.achievementId)
            : null;
        return definition ? [definition] : [];
      })
    : [];

/** 세션 상세의 그 세션에서 받은 내 새 업적 카드. 누르면 업적 상세 시트를 연다 */
export const MyNewAchievementsCard: React.FC<{
  playerId: string;
  achievements: readonly AchievementDefinition[];
}> = ({ playerId, achievements }) => {
  const { openAchievementDetail } = useAppNavigation();

  return (
    <Card>
      <h3 className="mt-3 text-pk-13 font-bold text-pk-sub">내 새 업적</h3>
      {achievements.map((definition) => (
        <button
          key={definition.id}
          type="button"
          onClick={() =>
            openAchievementDetail({
              playerId,
              achievementId: definition.id,
              earned: true,
            })
          }
          className="flex min-h-14 w-full items-center gap-3 py-2 text-left not-last:border-b not-last:border-pk-divider active:opacity-80"
        >
          <AchievementBadge achievement={definition} earned size={36} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-pk-15 font-bold text-pk-ink">
              {definition.name}
            </span>
            <span className="truncate text-pk-13 text-pk-muted">
              {definition.condition}
            </span>
          </span>
          <ChevronRightIcon />
        </button>
      ))}
    </Card>
  );
};
