import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABEL,
  sumAchievementPoints,
  type AchievementCategory,
  type AchievementDefinition,
} from "@pkpkdupr/shared/achievements";
import PushScreen from "@/components/PushScreen";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
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
import {
  formatAchievementPoints,
  formatAchievementPointsLabel,
  formatKstShortDate,
} from "@/lib/format";
import { fetchAchievementRanking } from "@/lib/rankings";

/** 분류별 업적 정의와 분류 만점(ACHIEVEMENT_CATEGORY_LABEL 순서) */
const CATEGORY_SECTIONS = (
  Object.keys(ACHIEVEMENT_CATEGORY_LABEL) as AchievementCategory[]
).map((category) => {
  const definitions = ACHIEVEMENTS.filter(
    (definition) => definition.category === category,
  );
  return {
    category,
    definitions,
    maxPoints: definitions.reduce(
      (sum, definition) => sum + definition.points,
      0,
    ),
  };
});

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
          ) : (
            <span className="text-pk-13 font-bold text-pk-muted">
              {formatAchievementPointsLabel(0)}
            </span>
          )}
          <span className="text-pk-13 text-pk-sub">
            {formatKstShortDate(progress.earnedAt)}
          </span>
        </span>
      ) : (
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-pk-13 font-bold text-pk-muted tabular-nums">
            {formatAchievementPointsLabel(definition.points)}
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
 * 업적 전체 보기. 맨 위에 업적 점수·받은 개수·업적 랭킹 순위를 두고,
 * 분류별로 받은 점수 / 분류 만점, 받은 업적은 얻은 점수와 받은 날,
 * 못 받은 업적은 걸린 점수와 진행도를 보인다
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
  const { openAchievementDetail, dataVersion } = useAppNavigation();
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  const [achievementRank, setAchievementRank] = useState<{
    playerId: string;
    rank: number;
  } | null>(null);

  const isLayerOpen = useLayerDepth({
    isOpen: isOpen && !!playerId,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });

  // 업적 점수 순위. 순위표에 없거나(게스트·비활성) 불러오지 못하면 순위 줄을 보이지 않는다
  useEffect(() => {
    if (!isLayerOpen || !playerId) return undefined;
    let isCancelled = false;
    fetchAchievementRanking()
      .then(({ entries }) => {
        if (isCancelled) return;
        const entry = entries.find((item) => item.player.id === playerId);
        setAchievementRank(entry ? { playerId, rank: entry.rank } : null);
      })
      .catch(() => {
        if (!isCancelled) setAchievementRank(null);
      });
    return () => {
      isCancelled = true;
    };
  }, [dataVersion, isLayerOpen, playerId]);
  // 다른 회원의 화면으로 바뀐 직후 이전 회원 순위를 보이지 않는다
  const rank =
    achievementRank?.playerId === playerId ? achievementRank.rank : null;

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
          <span className="flex flex-col items-end gap-0.5 text-pk-13 text-pk-sub">
            <span>
              {ACHIEVEMENTS.length}개 중{" "}
              <strong className="font-bold text-pk-ink">{earnedCount}개</strong>{" "}
              받음
            </span>
            {rank != null ? (
              <span>
                업적 랭킹{" "}
                <strong className="font-bold text-pk-ink tabular-nums">
                  {rank}위
                </strong>
              </span>
            ) : null}
          </span>
        </Card>
        {CATEGORY_SECTIONS.map(({ category, definitions, maxPoints }) => {
          const categoryPoints = sumAchievementPoints(
            definitions.map((definition) => ({
              id: definition.id,
              earned: !!progressById.get(definition.id)?.earned,
            })),
          );
          return (
            <section key={category} className="flex flex-col gap-1.5">
              <SectionLabel
                right={
                  <span className="text-pk-13 font-semibold text-pk-muted tabular-nums">
                    {formatAchievementPoints(categoryPoints)} /{" "}
                    {formatAchievementPoints(maxPoints)}점
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
