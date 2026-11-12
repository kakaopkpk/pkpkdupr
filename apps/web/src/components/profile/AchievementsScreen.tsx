import React, { useCallback, useMemo } from "react";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABEL,
  type AchievementCategory,
  type AchievementDefinition,
} from "@pkpkdupr/shared/achievements";
import PushScreen from "@/components/PushScreen";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import {
  type AchievementProgressInfo,
  formatAchievementProgress,
} from "@/lib/achievements";
import { formatKstShortDate } from "@/lib/format";

const CATEGORY_ORDER = Object.keys(
  ACHIEVEMENT_CATEGORY_LABEL,
) as AchievementCategory[];

const AchievementRow: React.FC<{
  definition: AchievementDefinition;
  progress: AchievementProgressInfo | undefined;
  onPress: () => void;
}> = ({ definition, progress, onPress }) => {
  const earned = !!progress?.earned;
  const ratio =
    definition.target > 0
      ? Math.min((progress?.current ?? 0) / definition.target, 1)
      : 0;

  return (
    <button
      type="button"
      onClick={onPress}
      className="flex min-h-16 w-full items-center gap-3 py-2.5 text-left not-last:border-b not-last:border-pk-divider"
    >
      <AchievementBadge achievement={definition} earned={earned} size={44} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cx(
            "truncate text-pk-15 font-bold",
            earned ? "text-pk-ink" : "text-pk-muted",
          )}
        >
          {definition.name}
        </span>
        <span className="truncate text-pk-13 text-pk-muted">
          {definition.condition}
        </span>
      </span>
      {earned && progress?.earnedAt ? (
        <span className="shrink-0 text-pk-13 text-pk-sub tabular-nums">
          {formatKstShortDate(progress.earnedAt)}
        </span>
      ) : (
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-pk-13 text-pk-sub tabular-nums">
            {formatAchievementProgress(definition, progress)}
          </span>
          <span
            aria-hidden="true"
            className="h-1 w-16 overflow-hidden rounded-full bg-pk-neutral"
          >
            <span
              className="block h-full rounded-full bg-pk-primary"
              style={{ width: `${ratio * 100}%` }}
            />
          </span>
        </span>
      )}
    </button>
  );
};

export interface AchievementsScreenProps {
  /** 열어 달라는 요청 */
  isOpen: boolean;
  tabKey: TabKey;
  depthId: string;
  playerId: string | null;
  progress: readonly AchievementProgressInfo[];
  onClose: () => void;
}

/** 업적 전체 보기. 분류별로 받은 업적은 받은 날, 못 받은 업적은 진행도를 보인다 */
export default function AchievementsScreen({
  isOpen,
  tabKey,
  depthId,
  playerId,
  progress,
  onClose,
}: AchievementsScreenProps): React.ReactElement {
  const { openAchievementDetail } = useAppNavigation();
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();

  const isLayerOpen = useLayerDepth({
    isOpen: isOpen && !!playerId,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });

  const progressById = useMemo(
    () => new Map(progress.map((item) => [item.id, item])),
    [progress],
  );
  const earnedCount = progress.filter((item) => item.earned).length;

  const close = useCallback(() => {
    if (!closeDepth(tabKey, depthId)) onClose();
  }, [closeDepth, depthId, onClose, tabKey]);

  const handleExited = useCallback(
    () => restoreScrollTop(tabKey),
    [restoreScrollTop, tabKey],
  );

  return (
    <PushScreen
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel="업적"
      title="업적"
      onBack={close}
      onExited={handleExited}
    >
      <div className="flex flex-col gap-4 px-4 pt-1 pb-4">
        <p className="px-1 text-pk-15 text-pk-sub">
          {ACHIEVEMENTS.length}개 중{" "}
          <strong className="font-bold text-pk-ink">{earnedCount}개</strong>{" "}
          받음
        </p>
        {CATEGORY_ORDER.map((category) => (
          <section key={category} className="flex flex-col gap-1.5">
            <SectionLabel>{ACHIEVEMENT_CATEGORY_LABEL[category]}</SectionLabel>
            <Card>
              {ACHIEVEMENTS.filter(
                (definition) => definition.category === category,
              ).map((definition) => (
                <AchievementRow
                  key={definition.id}
                  definition={definition}
                  progress={progressById.get(definition.id)}
                  onPress={() => {
                    if (playerId) {
                      openAchievementDetail({
                        playerId,
                        achievementId: definition.id,
                      });
                    }
                  }}
                />
              ))}
            </Card>
          </section>
        ))}
      </div>
    </PushScreen>
  );
}
