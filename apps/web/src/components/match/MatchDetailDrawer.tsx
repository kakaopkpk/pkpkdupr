import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isMatchRecordDeletable,
  isMatchRecordEditable,
} from "@pkpkdupr/shared/match";
import {
  isMatchSessionToday,
  isWithinRematchWindow,
  type MatchInfo,
} from "@/types/match";
import PushScreen from "@/components/PushScreen";
import { getErrorMessage } from "@/components/record/recordMatch.utils";
import { StateMessage } from "@/components/ui/StateMessage";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import {
  useDataVersion,
  useInvalidateData,
} from "@/context/DataSyncContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePlayers } from "@/hooks/usePlayers";
import { useStartedMatchToast } from "@/hooks/useStartedMatchToast";
import { apiFetch } from "@/lib/api";
import { getUserErrorMessage, isNetworkError } from "@/lib/errors";
import {
  deleteMatch,
  getMatchTeamPlayerIds,
  startMatch,
  startScheduledMatch,
  toTeamRequests,
} from "@/lib/matches";
import DeleteMatchSheet from "./DeleteMatchSheet";
import {
  CompletedMatchActions,
  CompletedMatchDetail,
  DeleteMatchHeaderButton,
  LiveMatchActions,
  LiveMatchDetail,
  MatchDetailSkeleton,
  ScheduledMatchActions,
} from "./MatchDetailViews";

const MATCH_DETAIL_DATA_KINDS = ["matches", "ratings", "achievements"] as const;

export interface MatchDetailDrawerProps {
  matchId: string;
  /** 열어 달라는 요청. false가 되면 닫히는 움직임 뒤 onExited를 부른다 */
  isOpen: boolean;
  tabKey: TabKey;
  /** 화면 스택에서 이 화면을 구분하는 깊이 id */
  depthId: string;
  onClose: () => void;
  onExited: () => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; match: MatchInfo }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

class MatchNotFoundError extends Error {}

const fetchMatch = async (matchId: string): Promise<MatchInfo> => {
  const res = await apiFetch(`/api/matches/${encodeURIComponent(matchId)}`);
  if (res.status === 404) throw new MatchNotFoundError();
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorData.error || "경기를 불러오지 못했어요.");
  }
  return (await res.json()) as MatchInfo;
};

/** 전역 경기 상세 화면. 진행 중이면 점수 입력, 완료면 결과·평점 변화를 보인다 */
export default function MatchDetailDrawer({
  matchId,
  isOpen: isRequested,
  tabKey,
  depthId,
  onClose,
  onExited,
}: MatchDetailDrawerProps): React.ReactElement {
  const { isAuthenticated } = useAuth();
  const {
    openAchievementDetail,
    openMemberProfile,
    openRecordMatch,
    openSessionReport,
    selectTab,
  } = useAppNavigation();
  const invalidateData = useInvalidateData();
  // 데이터는 PushScreen 본문 밖에서 받으므로 보임은 PushScreen이 알려 준 값을 쓴다
  const [isScreenVisible, setIsScreenVisible] = useState(false);
  const dataVersion = useDataVersion(MATCH_DETAIL_DATA_KINDS, {
    isScreenVisible,
  });
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  const { showSaveFailure, showToast } = useSystemNotice();
  const showStartedMatchToast = useStartedMatchToast();
  const { players } = usePlayers();
  const isOnline = useOnlineStatus();
  // 자정·세션 종료 시각을 지나면 "경기 시작" 노출이 따라 바뀐다
  const now = useMinuteClock();
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const requestIdRef = useRef(0);
  const isOpen = useLayerDepth({
    isOpen: isRequested,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });
  const isActive = tabKey === selectedTab;

  // 한 판 더 요청 상태. 거절 문구는 하단 버튼 위에 보인다
  const [isStartingRematch, setIsStartingRematch] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);

  // 대진 예정 경기 시작 요청 상태. 거절 문구는 하단 버튼 위에 보인다
  const [isStartingScheduled, setIsStartingScheduled] = useState(false);
  const [scheduledStartError, setScheduledStartError] = useState<string | null>(
    null,
  );

  // 삭제 확인 시트. 지운 뒤에는 닫히는 동안 다시 받지 않는다(이미 없는 경기라 404다)
  const deleteDepthId = `${depthId}:delete`;
  const [isDeleteRequested, setIsDeleteRequested] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isDeletedRef = useRef(false);
  const closeDeleteSheet = useCallback(() => setIsDeleteRequested(false), []);
  const isDeleteSheetOpen = useLayerDepth({
    isOpen: isDeleteRequested && isRequested,
    tabKey,
    depthId: deleteDepthId,
    kind: "bottom-sheet",
    onClose: closeDeleteSheet,
  });

  /** keepVisible이면 보이던 경기를 둔 채 다시 받는다(재조회·당겨서 새로고침) */
  const loadMatch = useCallback(
    async (targetMatchId: string, keepVisible: boolean) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      if (!keepVisible) setLoadState({ kind: "loading" });
      if (!isAuthenticated) return;

      try {
        const match = await fetchMatch(targetMatchId);
        if (requestIdRef.current === requestId) {
          setLoadState({ kind: "ready", match });
        }
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        // 만료로 정리된 진행 중 경기도 404다
        if (err instanceof MatchNotFoundError) {
          setLoadState({ kind: "not-found" });
          return;
        }
        // 다시 받다 실패하면 보이던 경기를 그대로 둔다
        setLoadState((current) =>
          keepVisible && current.kind === "ready"
            ? current
            : {
                kind: "error",
                message: getUserErrorMessage(
                  err,
                  "경기를 불러오지 못했어요",
                ),
              },
        );
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    void loadMatch(matchId, false);
  }, [loadMatch, matchId]);

  // 점수 입력·수정 등으로 데이터 버전이 바뀌면 같은 경기를 다시 받는다. 진행 중이던 경기는 완료 화면으로 바뀐다
  const lastDataVersionRef = useRef(dataVersion);
  useEffect(() => {
    if (lastDataVersionRef.current === dataVersion) return;
    lastDataVersionRef.current = dataVersion;
    if (isDeletedRef.current) return;
    void loadMatch(matchId, true);
  }, [dataVersion, loadMatch, matchId]);

  const handleExited = useCallback(() => {
    requestIdRef.current += 1;
    restoreScrollTop(tabKey);
    onExited();
  }, [onExited, restoreScrollTop, tabKey]);

  const handlePullToRefresh = useCallback(
    () => loadMatch(matchId, true),
    [loadMatch, matchId],
  );

  const close = useCallback(() => {
    if (!closeDepth(tabKey, depthId)) onClose();
  }, [closeDepth, depthId, onClose, tabKey]);

  /** 이 화면을 닫고, 브라우저 기록 정리가 끝난 뒤 afterClose를 실행한다 */
  const closeThen = (afterClose: () => void) => {
    if (!closeDepth(tabKey, depthId, afterClose)) {
      onClose();
      afterClose();
    }
  };

  /**
   * 저장 실패 알림의 다시 시도용. 서버 거절(4xx 등)이면 버튼 위 문구로 보이고,
   * 알림은 그대로 두도록 오류를 다시 던진다(RecordMatchFlow와 같은 처리).
   */
  const withRejectionMessage =
    (run: () => Promise<void>, onRejected: (err: unknown) => void) =>
    async () => {
      try {
        await run();
      } catch (err) {
        if (!isNetworkError(err)) onRejected(err);
        throw err;
      }
    };

  /** 같은 팀으로 진행 중 경기를 만들고, 이 화면을 닫고 홈 탭으로 가서 취소 토스트를 띄운다 */
  const playAgain = async (match: MatchInfo) => {
    if (isStartingRematch) return;
    const run = async () => {
      const startedMatch = await startMatch({
        teams: toTeamRequests(getMatchTeamPlayerIds(match)),
        sessionId: match.session?.id,
        location: match.location,
        rematchOfMatchId: match.id,
      });
      invalidateData(["matches"]);
      closeThen(() => {
        selectTab("home");
        showStartedMatchToast(startedMatch);
      });
    };

    setIsStartingRematch(true);
    setRematchError(null);
    try {
      await run();
    } catch (err) {
      if (isNetworkError(err)) {
        showSaveFailure({
          onRetry: withRejectionMessage(run, (retryError) =>
            setRematchError(
              getErrorMessage(retryError, "경기를 시작하지 못했어요."),
            ),
          ),
        });
      } else {
        setRematchError(getErrorMessage(err, "경기를 시작하지 못했어요."));
      }
    } finally {
      setIsStartingRematch(false);
    }
  };

  /** 대진 예정 경기를 진행 중으로 바꾸고 같은 화면을 진행 중 경기로 다시 그린다 */
  const startScheduled = async (match: MatchInfo) => {
    if (isStartingScheduled) return;
    const run = async () => {
      const startedMatch = await startScheduledMatch(match.id);
      // 시작 전에 보낸 재조회 응답(아직 예정)이 늦게 와서 덮어쓰지 않게 무효화한다
      requestIdRef.current += 1;
      setLoadState({ kind: "ready", match: startedMatch });
      invalidateData(["matches"]);
    };

    setIsStartingScheduled(true);
    setScheduledStartError(null);
    try {
      await run();
    } catch (err) {
      if (isNetworkError(err)) {
        showSaveFailure({
          onRetry: withRejectionMessage(run, (retryError) =>
            setScheduledStartError(
              getErrorMessage(retryError, "경기를 시작하지 못했어요."),
            ),
          ),
        });
      } else {
        setScheduledStartError(
          getErrorMessage(err, "경기를 시작하지 못했어요."),
        );
      }
    } finally {
      setIsStartingScheduled(false);
    }
  };

  const openDeleteSheet = () => {
    setDeleteError(null);
    setIsDeleteRequested(true);
  };

  const cancelDelete = () => {
    if (!closeDepth(tabKey, deleteDepthId)) closeDeleteSheet();
  };

  /**
   * 지우고 시트와 화면을 닫은 뒤 이전 화면에서 토스트를 띄운다.
   * 다른 회원이 먼저 지운 경기(404)도 지운 것으로 본다(deleteMatch가 처리).
   */
  const confirmDelete = async (match: MatchInfo) => {
    if (isDeleting) return;
    const finish = () => {
      isDeletedRef.current = true;
      const closeScreen = () =>
        closeThen(() => {
          showToast({ message: "경기를 지웠어요" });
          invalidateData(["matches", "ratings", "achievements"]);
        });
      if (!closeDepth(tabKey, deleteDepthId, closeScreen)) {
        closeDeleteSheet();
        closeScreen();
      }
    };
    const run = async () => {
      await deleteMatch(match.id, match.updatedAt);
      finish();
    };

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await run();
    } catch (err) {
      if (isNetworkError(err)) {
        showSaveFailure({
          onRetry: withRejectionMessage(run, (retryError) =>
            setDeleteError(
              getErrorMessage(retryError, "경기를 지우지 못했어요."),
            ),
          ),
        });
      } else {
        setDeleteError(getErrorMessage(err, "경기를 지우지 못했어요."));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const usernameById = useMemo(
    () => new Map(players.map((member) => [member.id, member.username])),
    [players],
  );
  const getUsername = (match: MatchInfo, playerId: string | null) => {
    if (!playerId) return null;
    const participant = match.teams
      .flatMap((team) => team.players)
      .find((player) => player.id === playerId);
    return participant?.username ?? usernameById.get(playerId) ?? null;
  };

  let content: React.ReactNode;
  // 탭바 자리의 하단 고정 바. 버튼이 없으면 바를 그리지 않는다
  let actions: React.ReactNode = null;
  const loadedMatch = loadState.kind === "ready" ? loadState.match : null;
  // 오프라인이거나 지울 수 없는 경기면 "삭제"를 숨긴다. 24시간 창과 삭제 조건은 isMatchRecordDeletable이
  // 렌더 시점 기준으로 판단하고, 열어 둔 사이 기한이 지나거나 다른 회원이 먼저 바꾼 경우는 서버가 거절한다
  const canDelete =
    isOnline &&
    !!loadedMatch &&
    loadedMatch.status !== "scheduled" &&
    isMatchRecordDeletable({
      ...loadedMatch,
      matchStartsAt: new Date(loadedMatch.matchStartsAt),
    });
  if (loadState.kind === "loading") {
    content = <MatchDetailSkeleton />;
  } else if (loadState.kind === "not-found") {
    content = (
      <p className="px-4 pt-16 text-center text-pk-15 text-pk-sub">
        경기를 찾을 수 없어요
      </p>
    );
  } else if (loadState.kind === "error") {
    content = (
      <StateMessage
        kind="error"
        size="panel"
        className="px-4"
        message={isOnline ? loadState.message : "인터넷에 연결되지 않았어요"}
        onRetry={() => void loadMatch(matchId, false)}
      />
    );
  } else {
    const { match } = loadState;
    if (match.status === "scheduled") {
      // 대진 예정 경기는 점수 입력·수정·삭제·한 판 더가 없고, 세션 날에만 "경기 시작"이 있다
      content = (
        <LiveMatchDetail
          match={match}
          creatorUsername={null}
          onOpenSession={openSessionReport}
          onOpenPlayer={openMemberProfile}
        />
      );
      if (isMatchSessionToday(match, now)) {
        actions = (
          <ScheduledMatchActions
            isBusy={isStartingScheduled}
            error={scheduledStartError}
            onStart={() => void startScheduled(match)}
          />
        );
      }
    } else if (match.status === "created") {
      content = (
        <LiveMatchDetail
          match={match}
          creatorUsername={getUsername(match, match.creatorPlayerId)}
          onOpenSession={openSessionReport}
          onOpenPlayer={openMemberProfile}
        />
      );
      actions = (
        <LiveMatchActions
          onEnterScore={() =>
            openRecordMatch({ kind: "score", matchId: match.id })
          }
        />
      );
    } else {
      // 기한이 지나는 순간을 따로 감시하지 않는다. 열어 둔 채 지나면 서버가 거절한다
      const canEdit =
        isOnline &&
        isMatchRecordEditable({
          ...match,
          matchStartsAt: new Date(match.matchStartsAt),
        });
      content = (
        <CompletedMatchDetail
          match={match}
          recorderUsername={getUsername(
            match,
            match.resultSubmittedByPlayerId ?? match.creatorPlayerId,
          )}
          onOpenSession={openSessionReport}
          onOpenPlayer={openMemberProfile}
          onOpenAchievement={(playerId, achievementId) =>
            openAchievementDetail({ playerId, achievementId, earned: true })
          }
        />
      );
      // 수정할 수 없으면 버튼만 빠진다(안내 문구 없음). 한 판 더는 기록 1시간 안에만 보인다
      if (canEdit) {
        actions = (
          <CompletedMatchActions
            isBusy={isStartingRematch}
            error={rematchError}
            onEdit={() => openRecordMatch({ kind: "score", matchId: match.id })}
            onPlayAgain={
              isWithinRematchWindow(match, now)
                ? () => void playAgain(match)
                : undefined
            }
          />
        );
      }
    }
  }

  return (
    <>
      <PushScreen
        isOpen={isOpen}
        isActive={isActive}
        onVisibleChange={setIsScreenVisible}
        ariaLabel="경기 상세"
        title="경기"
        onBack={close}
        headerRight={
          canDelete ? <DeleteMatchHeaderButton onPress={openDeleteSheet} /> : null
        }
        actions={actions}
        onExited={handleExited}
        onPullToRefresh={handlePullToRefresh}
      >
        {content}
      </PushScreen>
      <DeleteMatchSheet
        isOpen={isDeleteSheetOpen}
        isActive={isActive}
        match={loadedMatch}
        isDeleting={isDeleting}
        error={deleteError}
        onCancel={cancelDelete}
        onConfirm={() => {
          if (loadedMatch) void confirmDelete(loadedMatch);
        }}
      />
    </>
  );
}
