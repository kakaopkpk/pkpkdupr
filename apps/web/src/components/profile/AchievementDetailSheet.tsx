import React, { useCallback, useEffect, useState } from "react";
import type { AchievementHoldersResponse } from "@pkpkdupr/shared/achievements";
import BottomSheet from "@/components/BottomSheet";
import SkeletonBlock from "@/components/SkeletonBlock";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { PkButton } from "@/components/ui/Button";
import { LinkChevron } from "@/components/ui/Section";
import {
  GLOBAL_LAYER,
  type AchievementDetailRequest,
  useAppNavigation,
} from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { apiFetch } from "@/lib/api";
import {
  type AchievementProgressInfo,
  fetchAchievementHolders,
  formatAchievementProgress,
  getAchievementDefinition,
} from "@/lib/achievements";
import { formatKstLongDate } from "@/lib/format";
import { fetchPlayerProfileSummary } from "@/lib/playerProfile";
import { getTeamResultScores, type MatchInfo } from "@/types/match";

const DEPTH_ID = "global-achievement-detail";

interface DetailData {
  request: AchievementDetailRequest;
  progress: AchievementProgressInfo | null;
  holderCount: number | null;
  /** 받게 된 경기. 못 받았거나 불러오지 못했으면 null */
  match: MatchInfo | null;
}

type DetailState =
  | { status: "loading"; request: AchievementDetailRequest }
  | { status: "error"; request: AchievementDetailRequest }
  | ({ status: "ready" } & DetailData);

const fetchMatch = async (matchId: string): Promise<MatchInfo | null> => {
  const res = await apiFetch(`/api/matches/${encodeURIComponent(matchId)}`);
  return res.ok ? ((await res.json()) as MatchInfo) : null;
};

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
    summary.achievements?.find((item) => item.id === request.achievementId) ??
    null;
  const match =
    progress?.earned && progress.earnedMatchId
      ? await fetchMatch(progress.earnedMatchId).catch(() => null)
      : null;

  return {
    request,
    progress,
    holderCount: holders ? (holders.counts[request.achievementId] ?? 0) : null,
    match,
  };
};

/** 업적 주인 팀 점수를 앞에 둔다 */
const formatOwnerScore = (match: MatchInfo, playerId: string) => {
  const [scoreA, scoreB] = getTeamResultScores(match);
  const isTeamB = match.teams[1].players.some(
    (player) => player.id === playerId,
  );
  return isTeamB ? `${scoreB} : ${scoreA}` : `${scoreA} : ${scoreB}`;
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
  /**
   * false면 받게 된 경기를 눌러도 경기 상세로 가지 않는다.
   * 경기 기록 시트 위에서 열면 경기 상세가 그 시트 아래에 열리므로 막는다.
   */
  canOpenMatch: boolean;
  onClose: () => void;
}

/** 업적 상세 바텀시트: 배지·이름·조건, 받은 날·받게 된 경기·받은 회원 수 */
export default function AchievementDetailSheet({
  request,
  tabKey,
  canOpenMatch,
  onClose,
}: AchievementDetailSheetProps): React.ReactElement {
  const { openMatchDetail } = useAppNavigation();
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
  const progress = ready?.progress ?? null;
  const earned = !!progress?.earned;
  const earnedMatch = ready?.match ?? null;

  let content: React.ReactElement;
  if (!definition || !displayedRequest) {
    content = <div />;
  } else {
    const playerId = displayedRequest.playerId;
    content = (
      <>
        <BottomSheet.Header className="flex flex-col items-center gap-1 px-1 pt-1 text-center">
          {ready ? (
            <AchievementBadge achievement={definition} earned={earned} size={72} />
          ) : (
            <SkeletonBlock className="size-[72px] !rounded-full" />
          )}
          <h2 className="mt-3 text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
            {definition.name}
          </h2>
          <p className="text-pk-15 text-pk-sub">{definition.condition}</p>
        </BottomSheet.Header>
        <BottomSheet.Body className="!gap-0 px-1">
          {currentDetail?.status === "error" ? (
            <p role="alert" className="pb-2 text-pk-13 font-bold text-pk-down">
              업적 정보를 불러오지 못했어요.
            </p>
          ) : null}
          <DetailRow label="받은 날">
            {isLoading ? (
              <ValueSkeleton />
            ) : earned && progress?.earnedAt ? (
              formatKstLongDate(progress.earnedAt)
            ) : (
              <span className="font-medium text-pk-muted">아직 못 받았어요</span>
            )}
          </DetailRow>
          {isLoading ? null : earned ? (
            <DetailRow label="받게 된 경기">
              {earnedMatch ? (
                canOpenMatch ? (
                  <button
                    type="button"
                    onClick={() => close(() => openMatchDetail(earnedMatch.id))}
                    className="-mr-1 inline-flex min-h-11 items-center gap-0.5 px-1 text-pk-primary"
                  >
                    {formatOwnerScore(earnedMatch, playerId)}
                    <LinkChevron />
                  </button>
                ) : (
                  formatOwnerScore(earnedMatch, playerId)
                )
              ) : (
                "–"
              )}
            </DetailRow>
          ) : ready ? (
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
      className="h-[min(440px,calc(var(--app-shell-height)-3rem))]"
    >
      {content}
    </BottomSheet>
  );
}
