import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import type { MatchScore } from "@pkpkdupr/shared/match";
import type { MatchInfo } from "@/components/Match";
import MatchDetail, {
  MatchDetailSkeleton,
} from "@/components/MatchDetail";
import DetailPageHeader from "@/components/DetailPageHeader";
import RightDrawer from "@/components/RightDrawer";
import TabPanelStatus from "@/components/TabPanelStatus";
import { useAuth } from "@/context/AuthContext";
import type { TabKey } from "@/context/TabNavigationContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { apiFetch } from "@/lib/api";

interface ProfileMatchDetailDrawerProps {
  isOpen: boolean;
  isActive: boolean;
  tabKey: TabKey;
  match?: MatchInfo | null;
  matchId?: string;
  currentPlayerId?: string;
  onExited: () => void;
  onScrollContainerChange: (element: HTMLDivElement | null) => void;
  layer: number;
}

const ProfileMatchDetailDrawer: React.FC<ProfileMatchDetailDrawerProps> = ({
  isOpen,
  isActive,
  tabKey,
  match,
  matchId,
  currentPlayerId,
  onExited,
  onScrollContainerChange,
  layer,
}) => {
  const { isAuthenticated } = useAuth();
  const isOnline = useOnlineStatus();
  const [displayedMatch, setDisplayedMatch] = useState<MatchInfo | null>(
    match ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const targetMatchId = match?.id ?? matchId ?? null;

  const loadMatchDetail = useCallback(
    async (matchId: string) => {
      if (!isAuthenticated) {
        setError("로그인이 필요합니다.");
        return;
      }
      if (!isOnline) {
        setError("온라인 연결이 필요합니다.");
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const res = await apiFetch(`/api/matches/${matchId}`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "매치를 불러오지 못했습니다.");
        }

        const nextMatch = (await res.json()) as MatchInfo;
        if (requestIdRef.current === requestId) {
          setDisplayedMatch(nextMatch);
        }
      } catch (err) {
        if (requestIdRef.current === requestId) {
          setError(
            err instanceof Error ? err.message : "매치를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [isOnline, isAuthenticated],
  );

  const handleSubmitResult = useCallback(
    async (matchId: string, scores: MatchScore[]) => {
      if (!isAuthenticated) throw new Error("로그인이 필요해요.");
      if (!isOnline) {
        throw new Error(
          "오프라인에서는 결과를 입력할 수 없습니다. 온라인 연결이 필요합니다.",
        );
      }

      try {
        setIsSubmittingResult(true);
        const res = await apiFetch(`/api/matches/${matchId}/result`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ scores }),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "결과를 입력하지 못했어요.");
        }

        setDisplayedMatch((await res.json()) as MatchInfo);
        await loadMatchDetail(matchId);
      } finally {
        setIsSubmittingResult(false);
      }
    },
    [isOnline, loadMatchDetail, isAuthenticated],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    setDisplayedMatch(match ?? null);
    setError(null);
    setIsLoading(false);

    if (isOpen && targetMatchId) {
      void loadMatchDetail(targetMatchId);
    }
  }, [isOpen, loadMatchDetail, match, targetMatchId]);

  const retryMatchId = displayedMatch?.id ?? targetMatchId;

  let content: React.ReactNode;
  if (displayedMatch) {
    content = (
      <>
        {error ? (
          <div className="px-2 pt-2">
            <TabPanelStatus message={error} tone="error" />
            {isOnline && retryMatchId ? (
              <Button
                type="button"
                className="app-action-button w-full rounded-2xl bg-pkpk-primary-bg font-semibold text-pkpk-primary-font hover:bg-pkpk-primary-bg/90"
                onPress={() => void loadMatchDetail(retryMatchId)}
              >
                다시 시도
              </Button>
            ) : null}
          </div>
        ) : null}
        <MatchDetail
          match={displayedMatch}
          tabKey={tabKey}
          currentPlayerId={currentPlayerId}
          onSubmitResult={handleSubmitResult}
          onAutoApprovalDue={() => {
            void loadMatchDetail(displayedMatch.id);
          }}
          isOnline={isOnline}
          isSubmittingResult={isSubmittingResult}
          isLoading={isLoading}
        />
      </>
    );
  } else if (isLoading) {
    content = <MatchDetailSkeleton />;
  } else {
    content = (
      <div className="min-h-full">
        <DetailPageHeader title="Match Detail" tabKey={tabKey} />
        <TabPanelStatus
          message={error ?? "매치를 불러오지 못했습니다."}
          tone="error"
        />
        {isOnline && retryMatchId ? (
          <div className="px-2 pt-2">
            <Button
              type="button"
              className="app-action-button w-full rounded-2xl bg-pkpk-primary-bg font-semibold text-pkpk-primary-font hover:bg-pkpk-primary-bg/90"
              onPress={() => void loadMatchDetail(retryMatchId)}
            >
              다시 시도
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <RightDrawer
      isOpen={isOpen}
      isActive={isActive}
      ariaLabel="매치 상세"
      onExited={onExited}
      onScrollContainerChange={onScrollContainerChange}
      onPullToRefresh={() =>
        targetMatchId ? loadMatchDetail(targetMatchId) : Promise.resolve()
      }
      layer={layer}
    >
      {content}
    </RightDrawer>
  );
};

export default ProfileMatchDetailDrawer;
