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
import {
  COUNT_UP,
  CountUpNumber,
  getRowCountUp,
} from "@/components/ui/CountUpNumber";
import { CheckIcon } from "@/components/record/RecordMatchParts";
import { SectionLabel } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useCountUp } from "@/hooks/useCountUp";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import {
  type AchievementProgressInfo,
  formatAchievementProgress,
  getAchievementProgressRatio,
  interpolateAchievementProgress,
} from "@/lib/achievements";
import {
  formatAchievementPoints,
  formatAchievementPointsLabel,
  formatKstNumericDate,
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

/** 업적 이름 줄 오른쪽 점수. 받은 업적은 파란 체크와 점수, 못 받았거나 0점이면 회색 */
const AchievementRowPoints: React.FC<{ points: number; earned: boolean }> = ({
  points,
  earned,
}) => {
  const isScored = earned && points > 0;
  return (
    <span
      className={cx(
        "flex shrink-0 items-center gap-0.5 text-pk-13 font-extrabold whitespace-nowrap tabular-nums",
        isScored ? "text-pk-primary" : "text-pk-muted",
      )}
    >
      {isScored ? <CheckIcon size={14} /> : null}
      {formatAchievementPointsLabel(points)}
    </span>
  );
};

/**
 * 업적 한 줄: 이름과 점수, 조건(2줄까지), 받은 날 또는 진행 막대·숫자.
 * 못 받은 업적의 막대·숫자는 화면이 보일 때마다 0(평점은 3.000)부터 센다(rowIndex: 못 받은 줄 순서)
 */
const AchievementRow: React.FC<{
  definition: AchievementDefinition;
  progress: AchievementProgressInfo | undefined;
  /** 못 받은 업적 줄 중 몇 번째인지. 세기 시작을 늦추는 데 쓴다 */
  rowIndex: number;
  onPress: () => void;
}> = ({ definition, progress, rowIndex, onPress }) => {
  const earned = !!progress?.earned;
  const count = useCountUp(1, getRowCountUp(rowIndex));
  // 받은 업적은 움직이지 않는다
  const t = earned ? 1 : count.value;
  const ratio = getAchievementProgressRatio(definition, progress) * t;

  return (
    <button
      type="button"
      onClick={onPress}
      className="grid w-full grid-cols-[44px_minmax(0,1fr)] items-start gap-x-3 py-3 text-left not-last:border-b not-last:border-pk-divider"
    >
      <AchievementBadge achievement={definition} earned={earned} size={44} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cx(
              "truncate text-pk-15 font-bold",
              earned ? "text-pk-ink" : "text-pk-muted",
            )}
          >
            {definition.name}
          </span>
          <AchievementRowPoints points={definition.points} earned={earned} />
        </span>
        <span className="line-clamp-2 text-pk-13 text-pk-muted">
          {definition.condition}
        </span>
        {earned && progress?.earnedAt ? (
          <span className="mt-0.5 text-pk-12 text-pk-sub tabular-nums">
            {formatKstNumericDate(progress.earnedAt)}
          </span>
        ) : (
          <span className="mt-1.5 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-pk-neutral"
            >
              <span
                className="block h-full rounded-full bg-pk-primary"
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
            <span className="shrink-0 text-pk-12 text-pk-sub tabular-nums">
              {formatAchievementProgress(
                definition,
                interpolateAchievementProgress(definition, progress, t),
              )}
            </span>
          </span>
        )}
      </span>
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
  // 못 받은 업적 줄의 화면 순서. 진행 막대·숫자를 이 순서로 조금씩 늦게 센다
  const unearnedIndexById = useMemo(() => {
    const indexById = new Map<string, number>();
    for (const { definitions } of CATEGORY_SECTIONS) {
      for (const definition of definitions) {
        if (!progressById.get(definition.id)?.earned) {
          indexById.set(definition.id, indexById.size);
        }
      }
    }
    return indexById;
  }, [progressById]);
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
                    rowIndex={unearnedIndexById.get(definition.id) ?? 0}
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
