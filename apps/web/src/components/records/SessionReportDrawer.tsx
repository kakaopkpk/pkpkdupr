import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MatchInfo } from "@/types/match";
import PushScreen from "@/components/PushScreen";
import TabPanelStatus from "@/components/TabPanelStatus";
import LastSessionMeCard from "@/components/home/LastSessionMeCard";
import {
  getPlayerSessionAchievements,
  MyNewAchievementsCard,
} from "@/components/home/LastSessionFeed";
import SessionRatingChangesScreen from "@/components/records/SessionRatingChangesScreen";
import {
  SessionPlayerRatingRow,
  SessionReportSkeleton,
  SessionSummary,
  TopRiserCard,
} from "@/components/records/SessionReportParts";
import { Card } from "@/components/ui/Card";
import { MatchRow } from "@/components/ui/MatchRow";
import { SectionLabel, TextLink } from "@/components/ui/Section";
import { StateMessage } from "@/components/ui/StateMessage";
import {
  SegmentedControl,
  SegmentSwitchFade,
} from "@/components/ui/SegmentedControl";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { fetchMatchSession, fetchSessionMatches } from "@/lib/matchSessions";
import {
  fetchSessionReport,
  type MatchSessionReportInfo,
} from "@/lib/rankings";

type MatchFilter = "all" | "mine";

const MATCH_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "mine", label: "내 경기" },
] as const;

/** 세션 상세에서 미리 보이는 평점 변화 줄 수. 넘으면 "전체 보기"로 전체 화면을 연다 */
const RATING_PREVIEW_COUNT = 3;

type LoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      report: MatchSessionReportInfo;
      matches: MatchInfo[];
      /** 세션 상세 조회로 얻은 종료 시각. 그 조회가 실패했거나 시각 없는 세션이면 null */
      endTime: string | null;
    }
  | { kind: "error"; message: string };

const isPlayerInMatch = (match: MatchInfo, playerId: string) =>
  match.teams.some((team) =>
    team.players.some((player) => player.id === playerId),
  );

export interface SessionReportDrawerProps {
  sessionId: string;
  /** 열어 달라는 요청. false가 되면 닫히는 움직임 뒤 onExited를 부른다 */
  isOpen: boolean;
  tabKey: TabKey;
  /** 화면 스택에서 이 화면을 구분하는 깊이 id */
  depthId: string;
  onClose: () => void;
  onExited: () => void;
}

/**
 * 전역 세션 상세 화면.
 * 세션 요약 → 세션 지배자 → 내 변동 → 내 새 업적 → 평점 변화(3명) → 경기 순으로, 데이터가 있는 카드만 보인다.
 */
export default function SessionReportDrawer({
  sessionId,
  isOpen: isRequested,
  tabKey,
  depthId,
  onClose,
  onExited,
}: SessionReportDrawerProps): React.ReactElement {
  const { player } = useAuth();
  const playerId = player?.id;
  const { openMatchDetail, openMemberProfile, dataVersion } =
    useAppNavigation();
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [isListFading, setIsListFading] = useState(false);
  const [isPlayersRequested, setIsPlayersRequested] = useState(false);
  const requestIdRef = useRef(0);

  const isOpen = useLayerDepth({
    isOpen: isRequested,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });

  /** keepVisible이면 보이던 내용을 둔 채 다시 받는다(재조회·당겨서 새로고침) */
  const loadSession = useCallback(
    async (
      targetSessionId: string,
      keepVisible: boolean,
      { throwOnError = false }: { throwOnError?: boolean } = {},
    ) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      if (!keepVisible) setLoadState({ kind: "loading" });

      try {
        const [report, matches, sessionDetail] = await Promise.all([
          fetchSessionReport(targetSessionId),
          fetchSessionMatches(targetSessionId),
          // 메타 줄 종료 시각만을 위한 조회라, 실패해도 화면은 시작 시각만으로 띄운다
          fetchMatchSession(targetSessionId).catch(() => null),
        ]);
        if (requestIdRef.current === requestId) {
          setLoadState({
            kind: "ready",
            report,
            matches,
            endTime: sessionDetail?.endTime ?? null,
          });
        }
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        // 다시 받다 실패하면 보이던 내용을 그대로 둔다
        setLoadState((current) =>
          keepVisible && current.kind === "ready"
            ? current
            : {
                kind: "error",
                message:
                  err instanceof Error && err.message
                    ? err.message
                    : "세션 리포트를 불러오지 못했어요.",
              },
        );
        if (throwOnError) throw err;
      }
    },
    [],
  );

  useEffect(() => {
    void loadSession(sessionId, false);
  }, [loadSession, sessionId]);

  const lastDataVersionRef = useRef(dataVersion);
  useEffect(() => {
    if (lastDataVersionRef.current === dataVersion) return;
    lastDataVersionRef.current = dataVersion;
    void loadSession(sessionId, true);
  }, [dataVersion, loadSession, sessionId]);

  const handlePullToRefresh = useCallback(
    () => loadSession(sessionId, true, { throwOnError: true }),
    [loadSession, sessionId],
  );

  const handleExited = useCallback(() => {
    requestIdRef.current += 1;
    restoreScrollTop(tabKey);
    onExited();
  }, [onExited, restoreScrollTop, tabKey]);

  const close = useCallback(() => {
    if (!closeDepth(tabKey, depthId)) onClose();
  }, [closeDepth, depthId, onClose, tabKey]);

  const closePlayers = useCallback(() => setIsPlayersRequested(false), []);

  const changeMatchFilter = (nextFilter: MatchFilter) => {
    setMatchFilter(nextFilter);
    setIsListFading(true);
  };

  const report = loadState.kind === "ready" ? loadState.report : null;
  const matches = loadState.kind === "ready" ? loadState.matches : null;

  const myReport = useMemo(
    () =>
      report && playerId
        ? report.players.find(
            (entry) => entry.player.id === playerId && entry.matchCount > 0,
          )
        : undefined,
    [playerId, report],
  );
  const myAchievements = useMemo(
    () => (report ? getPlayerSessionAchievements(report, playerId) : []),
    [playerId, report],
  );

  const visibleMatches = useMemo(
    () =>
      (matches ?? [])
        .filter((match) => match.status === "completed")
        .filter(
          (match) =>
            matchFilter === "all" ||
            (!!playerId && isPlayerInMatch(match, playerId)),
        )
        .sort(
          (a, b) =>
            new Date(b.matchStartsAt).getTime() -
            new Date(a.matchStartsAt).getTime(),
        ),
    [matchFilter, matches, playerId],
  );

  const renderBody = () => {
    if (loadState.kind === "loading") return <SessionReportSkeleton />;
    if (loadState.kind === "error") {
      return <TabPanelStatus message={loadState.message} tone="error" />;
    }

    const { players, topRiser, session } = loadState.report;

    return (
      <>
        <SessionSummary session={session} endTime={loadState.endTime} />
        {topRiser ? <TopRiserCard report={topRiser} /> : null}
        {myReport ? <LastSessionMeCard report={myReport} /> : null}
        {playerId && myAchievements.length > 0 ? (
          <MyNewAchievementsCard
            playerId={playerId}
            achievements={myAchievements}
          />
        ) : null}
        {players.length > 0 ? (
          <section className="flex flex-col gap-2.5 pt-1">
            <SectionLabel
              right={
                players.length > RATING_PREVIEW_COUNT ? (
                  <TextLink onPress={() => setIsPlayersRequested(true)} chevron>
                    전체 보기
                  </TextLink>
                ) : undefined
              }
            >
              평점 변화 · {players.length}
            </SectionLabel>
            <Card>
              {players.slice(0, RATING_PREVIEW_COUNT).map((entry) => (
                <SessionPlayerRatingRow
                  key={entry.player.id}
                  report={entry}
                  ratingLabel="after"
                  onPress={() => openMemberProfile(entry.player.id)}
                />
              ))}
            </Card>
          </section>
        ) : null}
        <section className="flex flex-col gap-2.5 pt-1">
          <SectionLabel
            right={
              <SegmentedControl
                options={MATCH_FILTER_OPTIONS}
                value={matchFilter}
                onChange={changeMatchFilter}
                ariaLabel="경기 보기"
                size="sm"
              />
            }
          >
            경기 {visibleMatches.length}
          </SectionLabel>
          <SegmentSwitchFade
            isPlaying={isListFading}
            onFinish={() => setIsListFading(false)}
          >
            {visibleMatches.length > 0 ? (
              <Card>
                {visibleMatches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    currentPlayerId={playerId}
                    onPress={() => openMatchDetail(match.id)}
                  />
                ))}
              </Card>
            ) : (
              <Card>
                <StateMessage kind="empty" message="아직 경기가 없어요" />
              </Card>
            )}
          </SegmentSwitchFade>
        </section>
      </>
    );
  };

  return (
    <>
      <PushScreen
        isOpen={isOpen}
        isActive={tabKey === selectedTab}
        ariaLabel="세션"
        title="세션"
        onBack={close}
        onExited={handleExited}
        onPullToRefresh={handlePullToRefresh}
      >
        <div className="flex flex-col gap-2.5 px-4 pb-8">{renderBody()}</div>
      </PushScreen>
      <SessionRatingChangesScreen
        isOpen={isPlayersRequested && isRequested && !!report}
        tabKey={tabKey}
        players={report?.players ?? []}
        depthId={`${depthId}:players`}
        onClose={closePlayers}
      />
    </>
  );
}
