import React, { useCallback, useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import type { MatchInfo } from "@/components/Match";
import RecordMatchDrawerBody from "@/components/RecordMatchDrawerBody";
import SkeletonBlock from "@/components/SkeletonBlock";
import {
  GLOBAL_LAYER,
  type RecordMatchSheetRequest,
  useAppNavigation,
} from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { apiFetch } from "@/lib/api";

export interface RecordMatchSheetProps {
  request: RecordMatchSheetRequest | null;
  tabKey: TabKey;
  onClose: () => void;
}

const DEPTH_ID = "global-record-match-sheet";

type ScoreMatchState =
  | { status: "loading" }
  | { status: "ready"; match: MatchInfo }
  | { status: "error"; message: string };

/**
 * 전역 경기 기록 시트. 지금은 기존 RecordMatchDrawerBody를 감싼다.
 * "score" 요청은 경기를 받아 수정 모드로 연다. "new"의 presetTeams는 아직 반영하지 않는다.
 */
export default function RecordMatchSheet({
  request,
  tabKey,
  onClose,
}: RecordMatchSheetProps): React.ReactElement {
  const isOnline = useOnlineStatus();
  const { notifyDataChanged } = useAppNavigation();
  const { closeDepth, selectedTab } = useTabNavigation();
  // 열 때마다 올려서 입력을 초기 상태로 리마운트한다
  const [sheetKey, setSheetKey] = useState(0);
  const [scoreMatch, setScoreMatch] = useState<ScoreMatchState | null>(null);
  // 닫히는 애니메이션 동안 마지막 요청의 화면을 유지한다
  const [displayedRequest, setDisplayedRequest] = useState(request);
  const isOpen = useLayerDepth({
    isOpen: !!request,
    tabKey,
    depthId: DEPTH_ID,
    kind: "bottom-sheet",
    onClose,
  });
  const scoreMatchId =
    displayedRequest?.kind === "score" ? displayedRequest.matchId : null;

  useEffect(() => {
    if (!request) return;
    setDisplayedRequest(request);
    setSheetKey((key) => key + 1);
  }, [request]);

  useEffect(() => {
    if (!scoreMatchId) {
      setScoreMatch(null);
      return;
    }

    let isCancelled = false;
    setScoreMatch({ status: "loading" });
    void (async () => {
      try {
        const res = await apiFetch(
          `/api/matches/${encodeURIComponent(scoreMatchId)}`,
        );
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "경기를 불러오지 못했어요.");
        }
        const match = (await res.json()) as MatchInfo;
        if (!isCancelled) setScoreMatch({ status: "ready", match });
      } catch (err) {
        if (!isCancelled) {
          setScoreMatch({
            status: "error",
            message:
              err instanceof Error ? err.message : "경기를 불러오지 못했어요.",
          });
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
    // 같은 경기를 다시 열어도(sheetKey 증가) 최신 경기로 다시 받는다
  }, [scoreMatchId, sheetKey]);

  const close = useCallback(() => {
    if (!closeDepth(tabKey, DEPTH_ID)) onClose();
  }, [closeDepth, onClose, tabKey]);

  const handleOpenChange = useCallback(
    (nextIsOpen: boolean) => {
      if (!nextIsOpen) close();
    },
    [close],
  );

  let content: React.ReactElement;
  if (scoreMatchId && scoreMatch?.status !== "ready") {
    content = (
      <>
        <BottomSheet.Header>
          <h2 className="bs-text-head text-left text-pkpk-main-font">
            점수 입력
          </h2>
        </BottomSheet.Header>
        <BottomSheet.Body>
          {scoreMatch?.status === "error" ? (
            <p className="text-sm font-medium text-error" role="alert">
              {scoreMatch.message}
            </p>
          ) : (
            <div role="status" aria-label="경기 불러오는 중">
              <SkeletonBlock className="h-40 w-full rounded-2xl" />
            </div>
          )}
        </BottomSheet.Body>
      </>
    );
  } else {
    content = (
      <RecordMatchDrawerBody
        key={`${sheetKey}:${scoreMatchId ?? "new"}`}
        editMatch={scoreMatch?.status === "ready" ? scoreMatch.match : undefined}
        isOnline={isOnline}
        onCancel={close}
        onRecorded={notifyDataChanged}
        onDone={close}
      />
    );
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      isActive={tabKey === selectedTab}
      onOpenChange={handleOpenChange}
      ariaLabel="Record match"
      layer={GLOBAL_LAYER.recordMatch}
      isFixedHeight
    >
      {content}
    </BottomSheet>
  );
}
