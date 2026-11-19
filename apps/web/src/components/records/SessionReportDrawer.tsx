import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getEmptySessionExpiresAt, toKstDateKey } from "@pkpkdupr/shared/session";
import { getMatchPlayerIds, type MatchInfo } from "@/types/match";
import PushScreen from "@/components/PushScreen";
import LastSessionMeCard from "@/components/home/LastSessionMeCard";
import {
  getPlayerSessionAchievements,
  MyNewAchievementsCard,
} from "@/components/home/LastSessionSummary";
import { RecordSessionCard } from "@/components/records/RecordCards";
import SessionRatingChangesScreen from "@/components/records/SessionRatingChangesScreen";
import {
  SessionPlayerRatingRow,
  SessionReportSkeleton,
  TopRiserCard,
} from "@/components/records/SessionReportParts";
import { UpcomingSessionCard } from "@/components/schedule/ScheduleCards";
import ParticipantsSheet from "@/components/session/ParticipantsSheet";
import { SessionBlueCard } from "@/components/session/SessionBlueCard";
import {
  formatSessionDateTimePlace,
  getSessionMetaLabel,
} from "@/components/session/sessionTimeLabel";
import { useSessionParticipation } from "@/components/session/useSessionParticipation";
import { TournamentBracketSection } from "@/components/tournament/TournamentBracketSection";
import { TournamentRankCard } from "@/components/tournament/TournamentRankCard";
import { Card } from "@/components/ui/Card";
import { MatchRow } from "@/components/ui/MatchRow";
import { PreviewSection, Section } from "@/components/ui/Section";
import { StateMessage } from "@/components/ui/StateMessage";
import {
  SegmentedControl,
  SegmentSwitchFade,
} from "@/components/ui/SegmentedControl";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { getUserErrorMessage } from "@/lib/errors";
import {
  fetchMatchSession,
  fetchSessionMatches,
  isSessionParticipant,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import {
  fetchSessionReport,
  type MatchSessionReportInfo,
  RequestError,
} from "@/lib/rankings";

type MatchFilter = "all" | "mine";

const MATCH_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "mine", label: "내 경기" },
] as const;

const EMPTY_IDS: readonly string[] = [];
const LOAD_ERROR_MESSAGE = "세션을 불러오지 못했어요.";

type LoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      session: MatchSessionDetailInfo;
      matches: MatchInfo[];
      /** 끝난 세션의 리포트. 끝나기 전이거나 완료 경기가 없으면(404) null */
      report: MatchSessionReportInfo | null;
      /** 불러올 때 세션이 끝났는지(getEmptySessionExpiresAt <= 지금). 끝난 세션만 리포트를 읽는다 */
      isEnded: boolean;
    }
  | { kind: "error"; message: string };

const isPlayerInMatch = (match: MatchInfo, playerId: string) =>
  match.teams.some((team) =>
    team.players.some((player) => player.id === playerId),
  );

const getSessionExpiresAt = (session: MatchSessionDetailInfo) =>
  getEmptySessionExpiresAt(session.kind, new Date(session.date), session).getTime();

/** 끝난 세션의 리포트. 완료 경기가 없으면 서버가 404라 리포트 없이 그린다 */
const fetchEndedSessionReport = async (sessionId: string) => {
  try {
    return await fetchSessionReport(sessionId);
  } catch (err) {
    if (err instanceof RequestError && err.status === 404) return null;
    throw err;
  }
};

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
 * 전역 세션 상세 화면. 다가오는·진행 중·끝난 세션 모두 열리고, 머리는 세션 카드다.
 * - 끝나기 전: 일정 탭 블루 카드(D-day 또는 LIVE, 참여자 시트, 참여 버튼) → 대회면 "대진", 아니면 "경기"
 * - 끝난 대회: 순위 카드 → 리포트(세션 지배자·내 평점·내 새 업적·평점 변화) → "대진"
 * - 끝난 일반 세션: 일정 탭 지난 세션 카드(누를 수 없음) → 리포트 → "경기".
 *   리포트가 없으면(완료 경기 없이 끝남) 버튼 없는 블루 카드
 * 리포트 카드는 데이터가 있는 것만 보인다.
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
  const live = useLiveSession();
  const { openMatchDetail, openMemberProfile, notifyDataChanged, dataVersion } =
    useAppNavigation();
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  const now = useMinuteClock();
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  // 마지막으로 끝난 로드가 시작될 때의 dataVersion. 참여 변경 뒤 버튼을 풀 때 쓴다
  const [loadedVersion, setLoadedVersion] = useState(-1);
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [isListFading, setIsListFading] = useState(false);
  const [isPlayersRequested, setIsPlayersRequested] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const requestIdRef = useRef(0);
  // 비동기 요청이 시작될 때 최신 dataVersion을 읽기 위한 ref
  const dataVersionRef = useRef(dataVersion);
  dataVersionRef.current = dataVersion;

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
      const version = dataVersionRef.current;
      if (!keepVisible) setLoadState({ kind: "loading" });

      try {
        const [session, matches] = await Promise.all([
          fetchMatchSession(targetSessionId),
          fetchSessionMatches(targetSessionId),
        ]);
        const isEnded = getSessionExpiresAt(session) <= Date.now();
        const report = isEnded
          ? await fetchEndedSessionReport(targetSessionId)
          : null;
        if (requestIdRef.current !== requestId) return;
        setLoadState({ kind: "ready", session, matches, report, isEnded });
        setLoadedVersion(version);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setLoadedVersion(version);
        // 다시 받다 실패하면 보이던 내용을 그대로 둔다
        setLoadState((current) =>
          keepVisible && current.kind === "ready"
            ? current
            : {
                kind: "error",
                message: getUserErrorMessage(err, LOAD_ERROR_MESSAGE),
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

  // 보는 동안 세션이 끝나면 리포트까지 다시 받는다
  const readySession = loadState.kind === "ready" ? loadState.session : null;
  const isLoadedBeforeEnd = loadState.kind === "ready" && !loadState.isEnded;
  const hasEndedSinceLoad =
    isLoadedBeforeEnd &&
    !!readySession &&
    getSessionExpiresAt(readySession) <= now.getTime();
  useEffect(() => {
    if (hasEndedSinceLoad) void loadSession(sessionId, true);
  }, [hasEndedSinceLoad, loadSession, sessionId]);

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
  const closeParticipants = useCallback(() => setIsParticipantsOpen(false), []);

  const participation = useSessionParticipation({ playerId, loadedVersion });

  const isLive = live.liveSession?.id === sessionId;
  // 진행 중 경기에 든 선수는 참여자 시트에서 뺄 수 없다
  const busyPlayerIds = useMemo(
    () =>
      isLive ? live.inProgressMatches.flatMap(getMatchPlayerIds) : EMPTY_IDS,
    [isLive, live.inProgressMatches],
  );

  const changeMatchFilter = (nextFilter: MatchFilter) => {
    setMatchFilter(nextFilter);
    setIsListFading(true);
  };

  const report = loadState.kind === "ready" ? loadState.report : null;
  const matches = loadState.kind === "ready" ? loadState.matches : null;

  const myReport = useMemo(
    () =>
      report && playerId
        ? (report.players.find(
            (entry) => entry.player.id === playerId && entry.matchCount > 0,
          ) ?? null)
        : null,
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

  const renderHeaderCard = (
    session: MatchSessionDetailInfo,
    isEnded: boolean,
  ) => {
    if (!isEnded) {
      return (
        <UpcomingSessionCard
          session={session}
          todayKey={toKstDateKey(now)}
          isLive={isLive}
          meta={getSessionMetaLabel(session, toKstDateKey(now))}
          isJoined={isSessionParticipant(session, playerId)}
          pendingAction={participation.getPendingAction(session.id)}
          error={participation.getError(session.id)}
          onJoin={() => void participation.change(session.id, "join")}
          onLeave={() => void participation.change(session.id, "leave")}
          onOpenParticipants={() => setIsParticipantsOpen(true)}
        />
      );
    }
    if (session.kind === "tournament") {
      return <TournamentRankCard session={session} mine={myReport} />;
    }
    if (report) {
      // 일정 탭과 달리 바깥 날짜 제목이 없어 날짜를 앞에 붙인다
      return <RecordSessionCard session={report.session} mine={myReport} showDate />;
    }
    return (
      <SessionBlueCard
        session={session}
        dDayLabel="종료"
        meta={formatSessionDateTimePlace(session)}
        participantsLabel={`${session.participants.length}명 참여`}
      />
    );
  };

  const renderReport = (sessionReport: MatchSessionReportInfo) => {
    const { players, topRiser } = sessionReport;
    return (
      <>
        {topRiser ? <TopRiserCard report={topRiser} /> : null}
        {myReport ? <LastSessionMeCard report={myReport} /> : null}
        {playerId && myAchievements.length > 0 ? (
          <MyNewAchievementsCard
            playerId={playerId}
            achievements={myAchievements}
          />
        ) : null}
        {players.length > 0 ? (
          <PreviewSection
            title="평점 변화"
            items={players}
            renderPreview={(preview) => (
              <Card>
                {preview.map((entry) => (
                  <SessionPlayerRatingRow
                    key={entry.player.id}
                    report={entry}
                    ratingLabel="after"
                    onPress={() => openMemberProfile(entry.player.id)}
                  />
                ))}
              </Card>
            )}
            onViewAll={() => setIsPlayersRequested(true)}
          />
        ) : null}
      </>
    );
  };

  const renderMatchSection = () => (
    <Section
      title="경기"
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
    </Section>
  );

  const renderBody = () => {
    if (loadState.kind === "loading") return <SessionReportSkeleton />;
    if (loadState.kind === "error") {
      return (
        <StateMessage
          kind="error"
          size="panel"
          message={loadState.message}
          onRetry={() => void loadSession(sessionId, false)}
        />
      );
    }

    const { session, isEnded } = loadState;
    return (
      <>
        {renderHeaderCard(session, isEnded)}
        {report ? renderReport(report) : null}
        {session.kind === "tournament" ? (
          <TournamentBracketSection
            matches={loadState.matches}
            currentPlayerId={playerId}
          />
        ) : (
          renderMatchSection()
        )}
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
      {readySession ? (
        <ParticipantsSheet
          isOpen={isParticipantsOpen && isRequested}
          tabKey={tabKey}
          session={readySession}
          lockedPlayerIds={busyPlayerIds}
          onClose={closeParticipants}
          onChanged={notifyDataChanged}
        />
      ) : null}
    </>
  );
}
