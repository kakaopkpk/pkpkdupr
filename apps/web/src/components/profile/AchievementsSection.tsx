import React from "react";
import { ACHIEVEMENTS } from "@pkpkdupr/shared/achievements";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { rowPressClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionLabel, TextLink } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  type AchievementProgressInfo,
  getEarnedAchievementsByRecent,
} from "@/lib/achievements";

const MAX_VISIBLE_BADGES = 4;

export interface AchievementsSectionProps {
  /** 업적 주인 */
  playerId: string;
  progress: readonly AchievementProgressInfo[];
  /** "me": "업적 · N/전체 수" + 전체 보기, "member": "받은 업적 · N" */
  variant: "me" | "member";
  /** 기본 48 */
  badgeSize?: number;
  onViewAll?: () => void;
}

/** 받은 업적만 최근 받은 순으로 한 줄(최대 4개). 못 받은 업적·진행도는 보이지 않는다 */
export const AchievementsSection: React.FC<AchievementsSectionProps> = ({
  playerId,
  progress,
  variant,
  badgeSize = 48,
  onViewAll,
}) => {
  const { openAchievementDetail } = useAppNavigation();
  const earned = getEarnedAchievementsByRecent(progress);
  const title =
    variant === "me"
      ? `업적 · ${earned.length}/${ACHIEVEMENTS.length}`
      : `받은 업적 · ${earned.length}`;

  return (
    <section className="flex flex-col gap-2.5 pt-1">
      <SectionLabel
        right={
          onViewAll ? (
            <TextLink onPress={onViewAll} chevron>
              전체 보기
            </TextLink>
          ) : undefined
        }
      >
        {title}
      </SectionLabel>
      {earned.length > 0 ? (
        <Card className="grid grid-cols-4 gap-1 px-2 py-4">
          {earned.slice(0, MAX_VISIBLE_BADGES).map(({ definition }) => (
            <button
              key={definition.id}
              type="button"
              aria-label={`${definition.name} 업적`}
              onClick={() =>
                openAchievementDetail({
                  playerId,
                  achievementId: definition.id,
                })
              }
              className={cx(
                "flex min-w-0 flex-col items-center gap-2.5 rounded-pk-sm py-1 active:bg-pk-bg",
                rowPressClassName,
              )}
            >
              <AchievementBadge
                achievement={definition}
                earned
                size={badgeSize}
              />
              <span className="max-w-full truncate px-0.5 text-pk-12 font-bold text-pk-ink">
                {definition.name}
              </span>
            </button>
          ))}
        </Card>
      ) : (
        <p className="px-1 py-2 text-pk-13 text-pk-muted">
          아직 받은 업적이 없어요
        </p>
      )}
    </section>
  );
};

export default AchievementsSection;
