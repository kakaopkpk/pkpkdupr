import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMatchRecordEditable } from "@pkpkdupr/shared/match";
import type { MatchInfo } from "@/components/Match";
import RightDrawer from "@/components/RightDrawer";
import { PkButton } from "@/components/ui/Button";
import { DetailHeader } from "@/components/ui/Headers";
import {
  GLOBAL_LAYER,
  useAppNavigation,
} from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePlayers } from "@/hooks/usePlayers";
import { apiFetch } from "@/lib/api";
import {
  CompletedMatchDetail,
  LiveMatchDetail,
  MatchDetailSkeleton,
} from "./MatchDetailViews";

export interface MatchDetailDrawerProps {
  matchId: string | null;
  tabKey: TabKey;
  onClose: () => void;
}

const DEPTH_ID = "global-match-detail";

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

/** 전역 경기 상세. 진행 중이면 점수 입력, 완료면 결과·평점 변화를 보인다 */
export default function MatchDetailDrawer({
  matchId,
  tabKey,
  onClose,
}: MatchDetailDrawerProps): React.ReactElement {
  const { isAuthenticated } = useAuth();
  const { openRecordMatch, openSessionReport, dataVersion } =
    useAppNavigation();
  const {
    registerScrollContainer,
    requestCloseTopDepth,
    restoreScrollTop,
    selectedTab,
  } = useTabNavigation();
  const { players } = usePlayers();
  const isOnline = useOnlineStatus();
  // 닫히는 애니메이션 동안 마지막 경기를 계속 보여 준다
  const [displayedMatchId, setDisplayedMatchId] = useState(matchId);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const requestIdRef = useRef(0);
  const isOpen = useLayerDepth({
    isOpen: !!matchId,
    tabKey,
    depthId: DEPTH_ID,
    kind: "match-detail",
    onClose,
    saveScroll: true,
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
                message:
                  err instanceof Error && err.message
                    ? err.message
                    : "경기를 불러오지 못했어요.",
              },
        );
      }
    },
    [isAuthenticated],
  );

  // 새 경기를 열면 처음부터 받는다
  useEffect(() => {
    if (!matchId) return;
    setDisplayedMatchId(matchId);
    void loadMatch(matchId, false);
  }, [loadMatch, matchId]);

  // 점수 입력·수정 뒤(dataVersion 변경) 같은 경기를 다시 받는다. 진행 중이던 경기는 완료 화면으로 바뀐다
  const lastDataVersionRef = useRef(dataVersion);
  useEffect(() => {
    if (lastDataVersionRef.current === dataVersion) return;
    lastDataVersionRef.current = dataVersion;
    if (matchId) void loadMatch(matchId, true);
  }, [dataVersion, loadMatch, matchId]);

  const handleScrollContainerChange = useCallback(
    (element: HTMLDivElement | null) => {
      registerScrollContainer(tabKey, DEPTH_ID, element);
    },
    [registerScrollContainer, tabKey],
  );

  const handleExited = useCallback(() => {
    requestIdRef.current += 1;
    setDisplayedMatchId(null);
    setLoadState({ kind: "loading" });
    restoreScrollTop(tabKey);
  }, [restoreScrollTop, tabKey]);

  const handlePullToRefresh = useCallback(
    () =>
      displayedMatchId
        ? loadMatch(displayedMatchId, true)
        : Promise.resolve(),
    [displayedMatchId, loadMatch],
  );

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
      <div className="flex flex-col items-center gap-4 px-4 pt-16">
        <p role="alert" className="text-center text-pk-15 text-pk-sub">
          {isOnline ? loadState.message : "온라인 연결이 필요해요."}
        </p>
        {isOnline && displayedMatchId ? (
          <PkButton
            variant="soft"
            size="sm"
            onClick={() => void loadMatch(displayedMatchId, false)}
          >
            다시 시도
          </PkButton>
        ) : null}
      </div>
    );
  } else {
    const { match } = loadState;
    if (match.status === "created") {
      content = (
        <LiveMatchDetail
          match={match}
          creatorUsername={getUsername(match, match.creatorPlayerId)}
          onOpenSession={openSessionReport}
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
          canEdit={canEdit}
          onOpenSession={openSessionReport}
          onEdit={() => openRecordMatch({ kind: "score", matchId: match.id })}
          onPlayAgain={() =>
            openRecordMatch({
              kind: "new",
              presetTeams: [
                match.teams[0].players.map((player) => player.id),
                match.teams[1].players.map((player) => player.id),
              ],
            })
          }
        />
      );
    }
  }

  if (!displayedMatchId) return <></>;

  return (
    <RightDrawer
      isOpen={isOpen}
      isActive={tabKey === selectedTab}
      ariaLabel="경기 상세"
      onExited={handleExited}
      onScrollContainerChange={handleScrollContainerChange}
      onPullToRefresh={handlePullToRefresh}
      layer={GLOBAL_LAYER.matchDetail}
    >
      <div className="flex min-h-full flex-col">
        <DetailHeader
          title="경기"
          onBack={() => requestCloseTopDepth(tabKey)}
        />
        {content}
      </div>
    </RightDrawer>
  );
}
