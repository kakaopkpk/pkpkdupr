import React, { useCallback, useEffect, useState } from "react";
import type { AchievementHoldersResponse } from "@pkpkdupr/shared/achievements";
import BottomSheet from "@/components/BottomSheet";
import SkeletonBlock from "@/components/SkeletonBlock";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { PkButton } from "@/components/ui/Button";
import {
  GLOBAL_LAYER,
  type AchievementDetailRequest,
} from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import {
  type AchievementProgressInfo,
  fetchAchievementHolders,
  formatAchievementProgress,
  getAchievementDefinition,
} from "@/lib/achievements";
import { formatKstLongDate } from "@/lib/format";
import { fetchPlayerProfileSummary } from "@/lib/playerProfile";

const DEPTH_ID = "global-achievement-detail";

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
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex min-h-12 items-center justify-between gap-3 not-last:border-b not-last:border-pk-divider">
    <span className="shrink-0 text-pk-15 text-pk-sub">{label}</span>
    <span className="flex min-w-0 items-center justify-end text-pk-15 font-bold text-pk-ink tabular-nums">
      {children}
    </span>
  </div>
);

const ValueSkeleton: React.FC = () => <SkeletonBlock className="h-4 w-16" />;

export interface AchievementDetailSheetProps {
  request: AchievementDetailRequest | null;
  tabKey: TabKey;
  onClose: () => void;
}

/** 업적 상세 바텀시트: 배지·이름·조건, 받은 날·진행·받은 회원 수 */
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
  const earned = !!progress?.earned;

  let content: React.ReactElement;
  if (!definition || !displayedRequest) {
    content = <div />;
  } else {
    content = (
      <>
        <BottomSheet.Header className="flex flex-col items-center gap-1 px-1 pt-1 text-center">
          {isLoading ? (
            <SkeletonBlock className="size-[72px] rounded-full" />
          ) : (
            <AchievementBadge achievement={definition} earned={earned} size={72} />
          )}
          <h2 className="mt-3 text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
            {definition.name}
          </h2>
          <p className="text-pk-15 text-pk-sub">{definition.condition}</p>
        </BottomSheet.Header>
        <BottomSheet.Body className="gap-0 px-1">
          {isError ? (
            <p role="alert" className="pb-2 text-pk-13 font-bold text-pk-down">
              업적 정보를 불러오지 못했어요.
            </p>
          ) : null}
          <DetailRow label="받은 날">
            {isLoading ? (
              <ValueSkeleton />
            ) : isError ? (
              "–"
            ) : earned && progress?.earnedAt ? (
              formatKstLongDate(progress.earnedAt)
            ) : (
              <span className="font-medium text-pk-muted">아직 못 받았어요</span>
            )}
          </DetailRow>
          {ready && !earned ? (
            <DetailRow label="진행">
              {formatAchievementProgress(definition, progress)}
            </DetailRow>
          ) : null}
          <DetailRow label="받은 회원">
            {isLoading ? (
              <ValueSkeleton />
            ) : ready?.holderCount != null ? (
              `${ready.holderCount}명`
            ) : (
              "–"
            )}
          </DetailRow>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <PkButton size="lg" fullWidth onClick={() => close()}>
            닫기
          </PkButton>
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
      className="h-[min(420px,calc(var(--app-shell-height)-3rem))]"
    >
      {content}
    </BottomSheet>
  );
}
