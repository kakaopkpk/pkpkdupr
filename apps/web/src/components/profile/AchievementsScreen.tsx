import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABEL,
  sumAchievementPoints,
  type AchievementCategory,
  type AchievementDefinition,
} from "@pkpkdupr/shared/achievements";
import PushScreen, {
  usePushScreenScrollContainer,
} from "@/components/PushScreen";
import SkeletonBlock from "@/components/SkeletonBlock";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { AchievementPointsSummary } from "@/components/profile/AchievementPointsSummary";
import { Card } from "@/components/ui/Card";
import { CountUpText } from "@/components/ui/CountUpText";
import { CheckIcon } from "@/components/ui/Icons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { getRowCountUp } from "@/components/ui/CountUpNumber";
import { Section } from "@/components/ui/Section";
import { StateMessage } from "@/components/ui/StateMessage";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useCountUp } from "@/hooks/useCountUp";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
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
  /** true면 카드 폭 가득 연한 파랑 바탕이 한 번 반짝이고 사라진다 */
  isFlashing: boolean;
  onFlashEnd: () => void;
  onPress: () => void;
}> = ({ definition, progress, rowIndex, isFlashing, onFlashEnd, onPress }) => {
  const earned = !!progress?.earned;
  // 받은 업적 줄은 움직이지 않아 세지 않는다
  const count = useCountUp(1, { ...getRowCountUp(rowIndex), isReady: !earned });
  const t = earned ? 1 : count.value;
  const ratio = getAchievementProgressRatio(definition, progress) * t;

  return (
    <button
      type="button"
      onClick={onPress}
      data-achievement-id={definition.id}
      className="relative isolate grid w-full grid-cols-[44px_minmax(0,1fr)] items-start gap-x-3 py-3 text-left not-last:border-b not-last:border-pk-divider"
    >
      {isFlashing ? (
        // 카드 안쪽 좌우 여백(px-4)까지 덮는다
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -inset-x-4 -z-10 animate-pk-flash rounded-pk-sm bg-pk-primary-soft"
          style={{ animationDelay: `${FLASH_DELAY_MS}ms` }}
          onAnimationEnd={onFlashEnd}
        />
      ) : null}
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
        ) : null}
        {!earned ? (
          <span className="mt-1.5 flex items-center gap-2">
            <ProgressBar ratio={ratio} className="h-1.5 flex-1" />
            <CountUpText
              finalContent={formatAchievementProgress(definition, progress)}
              className="shrink-0 text-pk-12 text-pk-sub tabular-nums"
            >
              {formatAchievementProgress(
                definition,
                interpolateAchievementProgress(definition, progress, t),
              )}
            </CountUpText>
          </span>
        ) : null}
      </span>
    </button>
  );
};

/** 지정한 업적 줄 위쪽 끝을 둘 위치(스크롤 영역 높이 비율) */
const FOCUS_ROW_VIEWPORT_RATIO = 0.4;
/** 화면이 들어오는 움직임(PushScreen TRANSITION_MS 320ms)이 거의 끝난 뒤 반짝인다. 그 값을 바꾸면 함께 맞춘다 */
const FLASH_DELAY_MS = 280;

/** 화면 본문 안에 두어 스크롤 영역에서 지정한 업적 줄 위쪽 끝이 영역 높이의 40%에 오게 한 번 스크롤한다 */
const FocusRowScroller: React.FC<{
  achievementId: string;
  onScrolled: () => void;
}> = ({ achievementId, onScrolled }) => {
  const container = usePushScreenScrollContainer();

  useEffect(() => {
    if (!container) return;
    const row = container.querySelector<HTMLElement>(
      `[data-achievement-id="${CSS.escape(achievementId)}"]`,
    );
    if (row) {
      const rowTop =
        row.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      // 맨 위·맨 아래 근처라 그 위치까지 못 가면 갈 수 있는 끝까지 간다
      container.scrollTop = Math.min(
        Math.max(rowTop - container.clientHeight * FOCUS_ROW_VIEWPORT_RATIO, 0),
        Math.max(maxScrollTop, 0),
      );
    }
    onScrolled();
  }, [achievementId, container, onScrolled]);

  return null;
};

/** 진행도를 불러오는 동안 보이는 자리. 맨 위 요약 카드와 분류 카드 모양 */
const AchievementsSkeleton: React.FC = () => (
  <div
    role="status"
    aria-busy="true"
    aria-label="불러오는 중"
    className="flex flex-col gap-2.5"
  >
    <SkeletonBlock className="h-[104px] rounded-pk-lg" />
    <SkeletonBlock className="mt-3 h-[320px] rounded-pk-lg" />
  </div>
);

export interface AchievementsScreenProps {
  /** 열어 달라는 요청 */
  isOpen: boolean;
  tabKey: TabKey;
  depthId: string;
  playerId: string | null;
  progress: readonly AchievementProgressInfo[];
  /** 머리 제목. 기본 "업적" */
  title?: string;
  /** true면 진행도를 불러오는 중이라 자리만 보인다 */
  isLoading?: boolean;
  /** 진행도를 불러오지 못했을 때 문구와 다시 시도. 주면 본문 대신 보인다 */
  loadError?: { message: string; onRetry: () => void } | null;
  /** 주면 진행도가 준비된 뒤 그 업적 줄로 스크롤해 한 번 반짝인다. 없는 id면 무시한다 */
  focusAchievementId?: string;
  onClose: () => void;
  /** 닫히는 움직임이 끝난 뒤 */
  onExited?: () => void;
}

/**
 * 업적 전체 보기. 맨 위에 프로필 업적 카드와 같은 점수 줄·게이지 바와 받은 개수·업적 랭킹 순위를 두고,
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
  isLoading = false,
  loadError = null,
  focusAchievementId,
  onClose,
  onExited,
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

  const handleExited = useCallback(() => {
    restoreScrollTop(tabKey);
    onExited?.();
  }, [onExited, restoreScrollTop, tabKey]);

  // 지정한 업적으로 옮기기는 화면을 연 뒤 한 번만 한다(재조회·다시 보임으로 반복하지 않는다)
  const [hasFocused, setHasFocused] = useState(false);
  const [flashingAchievementId, setFlashingAchievementId] = useState<
    string | null
  >(null);
  const isContentReady = !isLoading && !loadError;
  const pendingFocusId =
    isLayerOpen &&
    isContentReady &&
    !hasFocused &&
    focusAchievementId &&
    ACHIEVEMENTS.some((definition) => definition.id === focusAchievementId)
      ? focusAchievementId
      : null;
  const handleFocusScrolled = useCallback(() => {
    setHasFocused(true);
    if (focusAchievementId && !prefersReducedMotion()) {
      setFlashingAchievementId(focusAchievementId);
    }
  }, [focusAchievementId]);
  const handleFlashEnd = useCallback(() => setFlashingAchievementId(null), []);

  return (
    <PushScreen
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel={title}
      title={title}
      onBack={close}
      onExited={handleExited}
    >
      {pendingFocusId ? (
        <FocusRowScroller
          achievementId={pendingFocusId}
          onScrolled={handleFocusScrolled}
        />
      ) : null}
      <div className="flex flex-col gap-2.5 px-4 pt-1 pb-4">
        {loadError ? (
          <Card>
            <StateMessage
              kind="error"
              message={loadError.message}
              onRetry={loadError.onRetry}
            />
          </Card>
        ) : isLoading ? (
          <AchievementsSkeleton />
        ) : (
          <>
            <Card className="flex flex-col gap-2.5 p-4">
              <AchievementPointsSummary points={points} />
              <div className="flex items-baseline justify-between gap-3 text-pk-13 text-pk-sub">
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
              </div>
            </Card>
            {CATEGORY_SECTIONS.map(({ category, definitions, maxPoints }) => {
              const categoryPoints = sumAchievementPoints(
                definitions.map((definition) => ({
                  id: definition.id,
                  earned: !!progressById.get(definition.id)?.earned,
                })),
              );
              return (
                <Section
                  key={category}
                  title={ACHIEVEMENT_CATEGORY_LABEL[category]}
                  right={
                    <span className="text-pk-13 font-semibold text-pk-muted tabular-nums">
                      {formatAchievementPoints(categoryPoints)} /{" "}
                      {formatAchievementPoints(maxPoints)}점
                    </span>
                  }
                >
                  <Card>
                    {definitions.map((definition) => (
                      <AchievementRow
                        key={definition.id}
                        definition={definition}
                        progress={progressById.get(definition.id)}
                        rowIndex={unearnedIndexById.get(definition.id) ?? 0}
                        isFlashing={flashingAchievementId === definition.id}
                        onFlashEnd={handleFlashEnd}
                        onPress={() => {
                          if (playerId) {
                            openAchievementDetail({
                              playerId,
                              achievementId: definition.id,
                              earned: !!progressById.get(definition.id)?.earned,
                            });
                          }
                        }}
                      />
                    ))}
                  </Card>
                </Section>
              );
            })}
          </>
        )}
      </div>
    </PushScreen>
  );
}
