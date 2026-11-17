import React, { useCallback, useMemo } from "react";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABEL,
  sumAchievementPoints,
  type AchievementCategory,
  type AchievementDefinition,
} from "@pkpkdupr/shared/achievements";
import PushScreen from "@/components/PushScreen";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { formatAchievementPoints } from "@/components/profile/AchievementPointsSummary";
import { Card } from "@/components/ui/Card";
import { COUNT_UP, CountUpNumber } from "@/components/ui/CountUpNumber";
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
  getAchievementProgressRatio,
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
  const ratio = getAchievementProgressRatio(definition, progress);

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
        <span className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
          {definition.points > 0 ? (
            <span className="text-pk-13 font-extrabold text-pk-primary">
              +{definition.points}
            </span>
          ) : null}
          <span className="text-pk-13 text-pk-sub">
            {formatKstShortDate(progress.earnedAt)}
          </span>
        </span>
      ) : (
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-pk-13 font-bold text-pk-muted tabular-nums">
            {definition.points > 0 ? `${definition.points}점` : "점수 없음"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-pk-12 text-pk-sub tabular-nums">
              {formatAchievementProgress(definition, progress)}
            </span>
            <span
              aria-hidden="true"
              className="h-1 w-12 overflow-hidden rounded-full bg-pk-neutral"
            >
              <span
                className="block h-full rounded-full bg-pk-primary"
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
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
  /** 머리 제목. 기본 "업적" */
  title?: string;
  onClose: () => void;
}

/**
 * 업적 전체 보기. 맨 위에 업적 점수와 받은 개수를 두고, 분류별로 받은 점수 / 분류 만점,
 * 받은 업적은 얻은 점수와 받은 날, 못 받은 업적은 걸린 점수와 진행도를 보인다
 */
export default function AchievementsScreen({
  isOpen,
  tabKey,
  depthId,
  playerId,
  progress,
  title = "업적",
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
  const points = sumAchievementPoints(progress);

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
      ariaLabel={title}
      title={title}
      onBack={close}
      onExited={handleExited}
    >
      <div className="flex flex-col gap-4 px-4 pt-1 pb-4">
        <Card className="flex items-end justify-between gap-3 p-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-pk-13 text-pk-sub">업적 점수</span>
            <span className="flex items-baseline gap-0.5">
              <span className="font-num text-[40px] leading-none font-bold tabular-nums text-pk-ink">
                <CountUpNumber
                  value={points}
                  format={formatAchievementPoints}
                  {...COUNT_UP}
                />
              </span>
              <span className="text-pk-15 font-bold text-pk-ink">점</span>
            </span>
          </span>
          <p className="text-pk-13 text-pk-sub">
            {ACHIEVEMENTS.length}개 중{" "}
            <strong className="font-bold text-pk-ink">{earnedCount}개</strong>{" "}
            받음
          </p>
        </Card>
        {CATEGORY_ORDER.map((category) => {
          const definitions = ACHIEVEMENTS.filter(
            (definition) => definition.category === category,
          );
          const categoryMaxPoints = definitions.reduce(
            (sum, definition) => sum + definition.points,
            0,
          );
          const categoryPoints = definitions.reduce(
            (sum, definition) =>
              progressById.get(definition.id)?.earned
                ? sum + definition.points
                : sum,
            0,
          );
          return (
            <section key={category} className="flex flex-col gap-1.5">
              <SectionLabel
                right={
                  <span className="text-pk-13 font-semibold text-pk-muted tabular-nums">
                    {categoryPoints} / {categoryMaxPoints}점
                  </span>
                }
              >
                {ACHIEVEMENT_CATEGORY_LABEL[category]}
              </SectionLabel>
              <Card>
                {definitions.map((definition) => (
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
          );
        })}
      </div>
    </PushScreen>
  );
}
