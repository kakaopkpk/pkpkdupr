import React, { useCallback, useEffect, useState } from "react";
import { DEFAULT_MATCH_LOCATION } from "@pkpkdupr/shared/session";
import BottomSheet from "@/components/BottomSheet";
import type { MatchInfo } from "@/types/match";
import SkeletonBlock from "@/components/SkeletonBlock";
import { SheetTitle } from "@/components/ui/SheetTitle";
import {
  GLOBAL_LAYER,
  type RecordMatchSheetRequest,
} from "@/context/AppNavigationContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { apiFetch } from "@/lib/api";
import RecordMatchFlow, {
  SCORE_STEP_DEPTH_ID,
  type RecordMatchFlowInitial,
} from "./RecordMatchFlow";
import {
  EMPTY_SCORE,
  EMPTY_SLOTS,
  slotsFromTeams,
} from "./recordMatch.utils";

export interface RecordMatchSheetProps {
  request: RecordMatchSheetRequest | null;
  tabKey: TabKey;
  onClose: () => void;
}

const DEPTH_ID = "global-record-match-sheet";

// sheetKey는 이 상태를 받은 요청. 요청이 바뀐 직후 한 렌더 동안 남는 이전 결과를 거르는 데 쓴다
type ScoreMatchState = { sheetKey: number } & (
  | { status: "loading" }
  | { status: "ready"; match: MatchInfo }
  | { status: "error"; message: string }
);

const buildScoreInitial = (match: MatchInfo): RecordMatchFlowInitial => ({
  step: "score",
  slots: slotsFromTeams([
    match.teams[0].players.map((player) => player.id),
    match.teams[1].players.map((player) => player.id),
  ]),
  score: match.scores?.[0] ?? EMPTY_SCORE,
  location: match.location,
  editMatch: match,
});

/**
 * 전역 경기 기록 시트. "new"는 플레이어 선택(presetTeams가 있으면 자리를 채워)부터,
 * "score"는 경기를 받아 점수 입력부터 시작한다.
 */
export default function RecordMatchSheet({
  request,
  tabKey,
  onClose,
}: RecordMatchSheetProps): React.ReactElement {
  const { liveSession } = useLiveSession();
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
  const currentScoreMatch =
    scoreMatchId && scoreMatch?.sheetKey === sheetKey ? scoreMatch : null;

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
    setScoreMatch({ sheetKey, status: "loading" });
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
        if (!isCancelled) setScoreMatch({ sheetKey, status: "ready", match });
      } catch (err) {
        if (!isCancelled) {
          setScoreMatch({
            sheetKey,
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
    const closeSheet = () => {
      if (!closeDepth(tabKey, DEPTH_ID)) onClose();
    };
    // 점수 단계 깊이가 위에 있으면 그것부터 닫아야 시트 깊이의 브라우저 기록이 남지 않는다
    if (!closeDepth(tabKey, SCORE_STEP_DEPTH_ID, closeSheet)) closeSheet();
  }, [closeDepth, onClose, tabKey]);

  const handleOpenChange = useCallback(
    (nextIsOpen: boolean) => {
      if (!nextIsOpen) close();
    },
    [close],
  );

  let content: React.ReactElement;
  if (scoreMatchId && currentScoreMatch?.status !== "ready") {
    content = (
      <>
        <BottomSheet.Header>
          <SheetTitle title="경기 기록" />
        </BottomSheet.Header>
        <BottomSheet.Body>
          {currentScoreMatch?.status === "error" ? (
            <p className="px-1 text-pk-13 font-bold text-pk-down" role="alert">
              {currentScoreMatch.message}
            </p>
          ) : (
            <div role="status" aria-label="경기 불러오는 중">
              <SkeletonBlock className="h-40 w-full rounded-pk-lg" />
            </div>
          )}
        </BottomSheet.Body>
      </>
    );
  } else {
    const initial: RecordMatchFlowInitial =
      currentScoreMatch?.status === "ready"
        ? buildScoreInitial(currentScoreMatch.match)
        : {
            step: "pick",
            slots:
              displayedRequest?.kind === "new" && displayedRequest.presetTeams
                ? slotsFromTeams(displayedRequest.presetTeams)
                : EMPTY_SLOTS,
            score: EMPTY_SCORE,
            location: liveSession?.location || DEFAULT_MATCH_LOCATION,
            editMatch: null,
          };
    content = (
      <RecordMatchFlow
        key={`${sheetKey}:${scoreMatchId ?? "new"}`}
        initial={initial}
        isOpen={isOpen}
        tabKey={tabKey}
        onClose={close}
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
