import React, { useCallback, useEffect, useState } from "react";
import type {
  AchievementDefinition,
  AchievementHoldersResponse,
} from "@pkpkdupr/shared/achievements";
import BottomSheet from "@/components/BottomSheet";
import SkeletonBlock from "@/components/SkeletonBlock";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { PkButton } from "@/components/ui/Button";
import { LockIcon, ShareIcon } from "@/components/ui/Icons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  GLOBAL_LAYER,
  type AchievementDetailRequest,
} from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useAchievementShare } from "@/hooks/useAchievementShare";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import {
  type AchievementProgressInfo,
  fetchAchievementHolders,
  formatAchievementProgress,
  getAchievementDefinition,
  getAchievementProgressRatio,
} from "@/lib/achievements";
import {
  formatAchievementPointsLabel,
  formatKstLongDate,
} from "@/lib/format";
import { fetchPlayerProfileSummary } from "@/lib/playerProfile";

const DEPTH_ID = "global-achievement-detail";
const BADGE_SIZE = 96;
// 빛줄기 회전 속도는 업적 축하 연출(AchievementCelebration)과 같다
const RAYS_SPIN_MS = 22000;
// 시트가 올라오는 동안 배지가 튀어나오기 시작하지 않게 조금 기다린다
const BADGE_POP_DELAY_MS = 150;
const RING_DELAY_MS = BADGE_POP_DELAY_MS + 150;

const ms = (value: number) => `${value}ms`;

interface DetailData {
  request: AchievementDetailRequest;
  progress: AchievementProgressInfo | null;
  holderCount: number | null;
}

type DetailState =
  | { status: "loading"; request: AchievementDetailRequest }
  | { status: "error"; request: AchievementDetailRequest }
  | ({ status: "ready" } & DetailData);

const loadDetail = async (
  request: AchievementDetailRequest,
): Promise<DetailData> => {
  const [summary, holders] = await Promise.all([
    fetchPlayerProfileSummary(request.playerId),
    // 회원 수를 못 받아도 나머지는 보여 준다
    fetchAchievementHolders().catch(
      (): AchievementHoldersResponse | null => null,
    ),
  ]);
  const progress =
    summary.achievements.find((item) => item.id === request.achievementId) ??
    null;

  return {
    request,
    progress,
    holderCount: holders ? (holders.counts[request.achievementId] ?? 0) : null,
  };
};

const DetailRow: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex min-h-12 items-center justify-between gap-3">
    <span className="shrink-0 text-pk-15 text-pk-sub">{label}</span>
    <span className="flex min-w-0 items-center justify-end text-pk-15 font-bold text-pk-ink tabular-nums">
      {children}
    </span>
  </div>
);

const ValueSkeleton: React.FC = () => <SkeletonBlock className="h-4 w-16" />;

/**
 * 받은 업적 배지. 업적 축하 연출의 앰버 빛줄기·후광을 뒤에 깔고, 열릴 때 배지가 한 번 튀어나오고
 * 고리가 한 번 퍼진다. 빛줄기는 천천히 돈다. 움직임 줄이기면 정지 상태로 보인다
 */
const EarnedBadge: React.FC<{
  definition: AchievementDefinition;
}> = ({ definition }) => (
  <>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 -mt-[170px] -ml-[170px] size-[340px] animate-pk-spin-slow motion-reduce:animate-none"
      style={{ animationDuration: ms(RAYS_SPIN_MS) }}
    >
      <div className="pk-celebration-rays size-full rounded-full" />
    </div>
    <div
      aria-hidden="true"
      className="pk-celebration-glow pointer-events-none absolute top-1/2 left-1/2 -mt-[100px] -ml-[100px] size-[200px] animate-pk-fade-in rounded-full motion-reduce:animate-none"
      style={{ animationDelay: ms(BADGE_POP_DELAY_MS), animationDuration: ms(600) }}
    />
    {/* 한 번만 퍼진다. 시작 전에는 보이지 않게 fill-mode를 forwards로 둔다 */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 -mt-[50px] -ml-[50px] size-[100px] animate-pk-ping rounded-full border-3 border-pk-hl opacity-0 motion-reduce:hidden"
      style={{
        animationDelay: ms(RING_DELAY_MS),
        animationDuration: ms(700),
        animationIterationCount: 1,
        animationFillMode: "forwards",
      }}
    />
    <div
      className="relative animate-pk-celebrate-pop motion-reduce:animate-none"
      style={{ animationDelay: ms(BADGE_POP_DELAY_MS) }}
    >
      <AchievementBadge achievement={definition} earned size={BADGE_SIZE} />
    </div>
  </>
);

/** 못 받은 업적 배지 오른쪽 아래에 겹치는 자물쇠 */
const LockMark: React.FC = () => (
  <span
    aria-hidden="true"
    className="absolute -right-0.5 bottom-1.5 flex size-7 items-center justify-center rounded-full bg-white text-pk-muted shadow-[inset_0_0_0_1.5px_var(--color-pk-line)]"
  >
    <LockIcon />
  </span>
);

export interface AchievementDetailSheetProps {
  request: AchievementDetailRequest | null;
  tabKey: TabKey;
  onClose: () => void;
}

/**
 * 업적 상세 바텀시트. 높이는 내용에 맞춘다.
 * 머리는 배지·이름·조건이고, 본문은 받은 업적이면 받은 날, 못 받은 업적이면 진행(숫자 + 막대),
 * 이어서 점수와 받은 회원 수다
 */
export default function AchievementDetailSheet({
  request,
  tabKey,
  onClose,
}: AchievementDetailSheetProps): React.ReactElement {
  const { closeDepth, selectedTab } = useTabNavigation();
  // 닫히는 애니메이션 동안 마지막 요청의 내용을 유지한다
  const [displayedRequest, setDisplayedRequest] = useState(request);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const isOpen = useLayerDepth({
    isOpen: !!request,
    tabKey,
    depthId: DEPTH_ID,
    kind: "bottom-sheet",
    onClose,
  });

  useEffect(() => {
    if (!request) return undefined;
    setDisplayedRequest(request);

    let isCancelled = false;
    setDetail({ status: "loading", request });
    loadDetail(request).then(
      (data) => {
        if (!isCancelled) setDetail({ status: "ready", ...data });
      },
      () => {
        if (!isCancelled) setDetail({ status: "error", request });
      },
    );
    return () => {
      isCancelled = true;
    };
  }, [request]);

  /** 시트를 닫고, 히스토리 정리가 끝난 뒤 afterClose를 실행한다 */
  const close = useCallback(
    (afterClose?: () => void) => {
      if (!closeDepth(tabKey, DEPTH_ID, afterClose)) {
        onClose();
        afterClose?.();
      }
    },
    [closeDepth, onClose, tabKey],
  );

  const definition = displayedRequest
    ? getAchievementDefinition(displayedRequest.achievementId)
    : null;
  const currentDetail =
    detail && detail.request === displayedRequest ? detail : null;
  const ready = currentDetail?.status === "ready" ? currentDetail : null;
  const isLoading = !currentDetail || currentDetail.status === "loading";
  const isError = currentDetail?.status === "error";
  const progress = ready?.progress ?? null;
  // 불러오기 전에는 여는 곳이 넘긴 값을 쓰고, 불러오면 받은 결과를 따른다
  const earned = ready ? !!progress?.earned : !!displayedRequest?.earned;
  const { player } = useAuth();
  // 공유는 내가 받은 업적만이다. 버튼은 처음부터 두고(불러오는 동안 비활성), 받은 날을 불러온 뒤 이미지를 만든다.
  // 닫히는 애니메이션 동안에도 내용(displayedRequest)과 같이 남긴다
  const canOfferShare =
    !isError && earned && !!player && displayedRequest?.playerId === player.id;
  const shareState = useAchievementShare(
    canOfferShare && ready && definition && player?.username
      ? { definition, username: player.username, earnedAt: progress?.earnedAt ?? null }
      : null,
  );

  let content: React.ReactElement;
  if (!definition || !displayedRequest) {
    content = <div />;
  } else {
    const holderCount = isLoading ? (
      <ValueSkeleton />
    ) : ready?.holderCount != null ? (
      `${ready.holderCount}명`
    ) : (
      "–"
    );
    content = (
      <>
        <BottomSheet.Header className="flex flex-col items-center gap-1 px-1 pt-1 text-center">
          <div
            className="relative"
            style={{ width: BADGE_SIZE, height: BADGE_SIZE }}
          >
            {earned ? (
              <EarnedBadge definition={definition} />
            ) : (
              <>
                <AchievementBadge
                  achievement={definition}
                  earned={false}
                  size={BADGE_SIZE}
                />
                <LockMark />
              </>
            )}
          </div>
          {/* 받은 업적의 빛줄기가 글자를 덮지 않게 위로 올린다 */}
          <h2 className="relative mt-3 text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
            {definition.name}
          </h2>
          <p className="relative text-pk-15 text-pk-sub">{definition.condition}</p>
        </BottomSheet.Header>
        <BottomSheet.Body className="gap-0 px-1">
          {isError ? (
            <p role="alert" className="pb-2 text-pk-13 font-bold text-pk-down">
              업적 정보를 불러오지 못했어요.
            </p>
          ) : null}
          <div className="divide-y divide-pk-divider">
            {/* 불러오지 못하면 받은 날·진행 줄은 빼고 나머지만 보인다 */}
            {!isError && earned ? (
              <DetailRow label="받은 날">
                {ready ? (
                  progress?.earnedAt ? formatKstLongDate(progress.earnedAt) : "–"
                ) : (
                  <ValueSkeleton />
                )}
              </DetailRow>
            ) : null}
            {!isError && !earned ? (
              <div className="flex flex-col pb-4">
                <DetailRow label="진행">
                  {ready ? (
                    formatAchievementProgress(definition, progress)
                  ) : (
                    <ValueSkeleton />
                  )}
                </DetailRow>
                <ProgressBar
                  ratio={
                    ready ? getAchievementProgressRatio(definition, progress) : 0
                  }
                  className="h-1.5"
                />
              </div>
            ) : null}
            <DetailRow label="점수">
              <span
                className={
                  definition.points > 0
                    ? "text-pk-primary"
                    : "font-medium text-pk-muted"
                }
              >
                {formatAchievementPointsLabel(definition.points)}
              </span>
            </DetailRow>
            <DetailRow label="받은 회원">{holderCount}</DetailRow>
          </div>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <div className="flex gap-2">
            {canOfferShare && shareState.isAvailable ? (
              <PkButton
                variant="soft"
                size="lg"
                disabled={!shareState.canShare}
                onClick={shareState.share}
              >
                <ShareIcon />
                공유
              </PkButton>
            ) : null}
            <PkButton size="lg" className="flex-1" onClick={() => close()}>
              닫기
            </PkButton>
          </div>
        </BottomSheet.Footer>
      </>
    );
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      isActive={tabKey === selectedTab}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) close();
      }}
      ariaLabel="업적 상세"
      layer={GLOBAL_LAYER.achievementDetail}
      isFixedHeight={false}
    >
      {content}
    </BottomSheet>
  );
}
