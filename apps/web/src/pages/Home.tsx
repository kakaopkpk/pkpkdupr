import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecommendedCourt } from "@pkpkdupr/shared/matchmaking";
import type { MatchInfo } from "@/components/Match";
import HomeSkeleton from "@/components/home/HomeSkeleton";
import LastSessionMeCard from "@/components/home/LastSessionMeCard";
import MyLiveMatchCard from "@/components/home/MyLiveMatchCard";
import NextSessionCard, {
  type ParticipationAction,
} from "@/components/home/NextSessionCard";
import RecommendationSection, {
  getCourtKey,
} from "@/components/home/RecommendationSection";
import { usePreSessionData } from "@/components/home/usePreSessionData";
import { useSessionRecommendations } from "@/components/home/useSessionRecommendations";
import ParticipantsSheet from "@/components/session/ParticipantsSheet";
import { getErrorMessage, isNetworkError } from "@/components/session/saveError";
import { LivePill } from "@/components/ui/Badges";
import { Card } from "@/components/ui/Card";
import { TabHeader } from "@/components/ui/Headers";
import { LiveMatchRow, MatchRow } from "@/components/ui/MatchRow";
import { SectionLabel, TextLink } from "@/components/ui/Section";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { formatKstLongDate, formatKstShortDate } from "@/lib/format";
import {
  addMatchSessionParticipant,
  isSessionParticipant,
  type MatchSessionDetailInfo,
  removeMatchSessionParticipant,
  startSessionMatch,
} from "@/lib/matchSessions";

const MINUTE_MS = 60_000;
const EMPTY_IDS: readonly string[] = [];

/** 경과 분·남은 시간 표시를 위해 1분마다 다시 그린다 */
const useMinuteClock = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return now;
};

const byLatestStart = (a: MatchInfo, b: MatchInfo) =>
  new Date(b.matchStartsAt).getTime() - new Date(a.matchStartsAt).getTime();

const getMatchPlayerIds = (match: MatchInfo) =>
  match.teams.flatMap((team) => team.players.map((player) => player.id));

const EmptyText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Card className="py-4">
    <p className="text-pk-13 text-pk-sub">{children}</p>
  </Card>
);

const Spacer: React.FC = () => <div className="h-1.5" />;

/** 참여자 시트 대상. 닫힌 뒤에도 닫힘 애니메이션 동안 마지막 세션을 그린다 */
interface ParticipantsTarget {
  session: MatchSessionDetailInfo;
  lockedPlayerIds: readonly string[];
}

/** 진행 중 경기 시작 요청 상태 */
interface StartState {
  startingKey: string | null;
  error: { key: string; message: string } | null;
  /** 시작에 성공해 새 추천이 오기 전까지 숨길 추천 행 */
  startedKeys: ReadonlySet<string>;
}

const INITIAL_START_STATE: StartState = {
  startingKey: null,
  error: null,
  startedKeys: new Set(),
};

/**
 * 홈 탭. 셸의 진행 중 세션이 있으면 진행 화면(참여자 Main / 미참여자 MainGuest),
 * 없으면 다가오는 첫 세션 카드와 지난 세션 요약을 보인다.
 */
const Home: React.FC = () => {
  const { player } = useAuth();
  const playerId = player?.id;
  const live = useLiveSession();
  const {
    openRecordMatch,
    openMatchDetail,
    openSessionReport,
    notifyDataChanged,
    dataVersion,
  } = useAppNavigation();
  const { registerPullToRefresh } = useTabNavigation();
  const { showSaveFailure } = useSystemNotice();
  const now = useMinuteClock();

  const liveSession = live.liveSession;
  const isLiveResolved = live.status !== "loading" || liveSession !== null;
  const isPreSession = isLiveResolved && !liveSession;
  const isLiveParticipant = !!liveSession && live.isParticipant;

  const preSession = usePreSessionData({
    enabled: isPreSession,
    playerId,
    dataVersion,
  });
  const recommendations = useSessionRecommendations(
    isLiveParticipant && liveSession ? liveSession.id : null,
    dataVersion,
  );

  // ── 참여자 시트 ─────────────────────────────────────
  const [participantsTarget, setParticipantsTarget] =
    useState<ParticipantsTarget | null>(null);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);

  const openParticipants = (
    session: MatchSessionDetailInfo,
    lockedPlayerIds: readonly string[],
  ) => {
    setParticipantsTarget({ session, lockedPlayerIds });
    setIsParticipantsOpen(true);
  };
  const closeParticipants = useCallback(() => setIsParticipantsOpen(false), []);

  // ── 다음 세션 참여·취소 ─────────────────────────────
  const nextSession = preSession.data?.upcoming.sessions[0] ?? null;
  const isJoinedNext = !!nextSession && isSessionParticipant(nextSession, playerId);
  const [participation, setParticipation] = useState<{
    action: ParticipationAction;
    /** 성공 뒤 이 dataVersion 이상으로 새로 받은 데이터가 와야 버튼을 푼다. 요청 중이면 null */
    awaitVersion: number | null;
  } | null>(null);
  const [participationError, setParticipationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!participation) return;
    // 진행 중 화면으로 바뀌면 다음 세션 카드가 사라지므로 기다리지 않는다
    if (
      !isPreSession ||
      (participation.awaitVersion !== null &&
        preSession.loadedVersion >= participation.awaitVersion)
    ) {
      setParticipation(null);
    }
  }, [isPreSession, participation, preSession.loadedVersion]);

  // 다른 세션으로 바뀌면 이전 세션의 오류 문구를 지운다
  useEffect(() => {
    setParticipationError(null);
  }, [nextSession?.id]);

  const changeParticipation = async (action: ParticipationAction) => {
    if (!nextSession || !playerId || participation) return;

    const sessionId = nextSession.id;
    const run = async () => {
      if (action === "join") {
        await addMatchSessionParticipant(sessionId, playerId);
      } else {
        await removeMatchSessionParticipant(sessionId, playerId);
      }
      notifyDataChanged();
    };

    setParticipation({ action, awaitVersion: null });
    setParticipationError(null);
    try {
      await run();
      // notifyDataChanged가 dataVersion을 1 올리고 그 값으로 다시 받는다
      setParticipation({ action, awaitVersion: dataVersion + 1 });
    } catch (err) {
      setParticipation(null);
      if (isNetworkError(err)) {
        showSaveFailure({ onRetry: run });
      } else {
        setParticipationError(
          getErrorMessage(
            err,
            action === "join"
              ? "참여하지 못했어요."
              : "참여를 취소하지 못했어요.",
          ),
        );
      }
    }
  };

  // ── 진행 중 세션 ────────────────────────────────────
  const inProgressMatches = live.inProgressMatches;
  const myInProgressMatch = live.myInProgressMatch;
  const busyPlayerIds = useMemo(
    () => inProgressMatches.flatMap(getMatchPlayerIds),
    [inProgressMatches],
  );
  const completedMatches = useMemo(
    () =>
      live.matches
        .filter((match) => match.status === "completed")
        .sort(byLatestStart),
    [live.matches],
  );
  const waitingCount = useMemo(() => {
    if (!liveSession) return 0;
    const busy = new Set(busyPlayerIds);
    return liveSession.participants.filter((member) => !busy.has(member.id))
      .length;
  }, [busyPlayerIds, liveSession]);

  const [startState, setStartState] = useState<StartState>(INITIAL_START_STATE);

  // 새 추천이 오면 숨겨 둔 시작 완료 행을 비운다
  useEffect(() => {
    setStartState((state) =>
      state.startedKeys.size === 0
        ? state
        : { ...state, startedKeys: new Set() },
    );
  }, [recommendations.recommendation]);

  const startRecommendedMatch = async (court: RecommendedCourt) => {
    if (!liveSession || startState.startingKey) return;

    const key = getCourtKey(court);
    const sessionId = liveSession.id;
    const run = async () => {
      await startSessionMatch(sessionId, {
        teams: [
          {
            name: "Team A",
            playerIds: court.teams[0].players.map((member) => member.id),
          },
          {
            name: "Team B",
            playerIds: court.teams[1].players.map((member) => member.id),
          },
        ],
      });
      notifyDataChanged();
    };

    setStartState((state) => ({ ...state, startingKey: key, error: null }));
    try {
      await run();
      setStartState((state) => ({
        ...state,
        startingKey: null,
        startedKeys: new Set([...state.startedKeys, key]),
      }));
    } catch (err) {
      setStartState((state) => ({
        ...state,
        startingKey: null,
        error: isNetworkError(err)
          ? null
          : { key, message: getErrorMessage(err, "경기를 시작하지 못했어요.") },
      }));
      if (isNetworkError(err)) showSaveFailure({ onRetry: run });
    }
  };

  const visibleRecommendations = useMemo(() => {
    const { recommendation } = recommendations;
    if (!recommendation || startState.startedKeys.size === 0) {
      return recommendations;
    }
    return {
      ...recommendations,
      recommendation: {
        ...recommendation,
        courts: recommendation.courts.filter(
          (court) => !startState.startedKeys.has(getCourtKey(court)),
        ),
      },
    };
  }, [recommendations, startState.startedKeys]);

  // ── 당겨서 새로고침 ─────────────────────────────────
  // 진행 중 세션은 셸이 함께 다시 읽으므로 홈 자체 데이터만 다시 받는다
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  refreshRef.current = async () => {
    if (isPreSession) {
      await preSession.reload();
    } else if (isLiveParticipant) {
      await recommendations.reload();
    }
  };
  useEffect(
    () => registerPullToRefresh("home", () => refreshRef.current()),
    [registerPullToRefresh],
  );

  // ── 그리기 ─────────────────────────────────────────
  const todayLabel = formatKstLongDate(now);

  const renderLive = () => {
    const otherInProgress = isLiveParticipant
      ? inProgressMatches.filter((match) => match.id !== myInProgressMatch?.id)
      : inProgressMatches;

    return (
      <>
        <SectionLabel>진행 중 {inProgressMatches.length}</SectionLabel>
        {isLiveParticipant && myInProgressMatch ? (
          <MyLiveMatchCard
            match={myInProgressMatch}
            now={now}
            onEnterScore={() =>
              openRecordMatch({ kind: "score", matchId: myInProgressMatch.id })
            }
          />
        ) : null}
        {otherInProgress.length > 0 ? (
          <Card>
            {otherInProgress.map((match) => (
              <LiveMatchRow
                key={match.id}
                match={match}
                now={now}
                onPress={() => openMatchDetail(match.id)}
              />
            ))}
          </Card>
        ) : inProgressMatches.length === 0 ? (
          <EmptyText>진행 중인 경기가 없어요</EmptyText>
        ) : null}
        {isLiveParticipant ? (
          <>
            <Spacer />
            <RecommendationSection
              state={visibleRecommendations}
              waitingCount={waitingCount}
              startingKey={startState.startingKey}
              startError={startState.error}
              onStart={(court) => void startRecommendedMatch(court)}
            />
          </>
        ) : null}
        <Spacer />
        <SectionLabel>오늘 기록 {completedMatches.length}</SectionLabel>
        {completedMatches.length > 0 ? (
          <Card>
            {completedMatches.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                currentPlayerId={playerId}
                onPress={() => openMatchDetail(match.id)}
              />
            ))}
          </Card>
        ) : (
          <EmptyText>아직 기록된 경기가 없어요</EmptyText>
        )}
        {/* 미참여자의 참여하기는 셸의 알림 바가 맡는다. 그 바에 가리지 않게 여백을 둔다 */}
        {!isLiveParticipant ? <div className="h-16" /> : null}
      </>
    );
  };

  const renderPreSession = () => {
    const { data, status, error } = preSession;
    if (!data) {
      if (status === "error") {
        return (
          <p
            role="alert"
            className="px-1 py-6 text-center text-pk-13 font-medium text-pk-down"
          >
            {error ?? "다가오는 세션을 불러오지 못했어요."}
          </p>
        );
      }
      return <HomeSkeleton />;
    }

    const { upcoming, lastSessionMe, recentMatches, lastSession } = data;
    const isToday = !!nextSession?.isToday;

    return (
      <>
        {nextSession ? (
          <NextSessionCard
            session={nextSession}
            todayKey={upcoming.dateKey}
            now={now}
            isJoined={isJoinedNext}
            pendingAction={participation?.action ?? null}
            error={participationError}
            onJoin={() => void changeParticipation("join")}
            onLeave={() => void changeParticipation("leave")}
            onOpenParticipants={() => openParticipants(nextSession, EMPTY_IDS)}
          />
        ) : (
          <EmptyText>다가오는 세션이 없어요</EmptyText>
        )}
        {isToday && lastSessionMe ? (
          <>
            <Spacer />
            <SectionLabel>
              지난 세션의 나 · {formatKstShortDate(lastSessionMe.session.date)}
            </SectionLabel>
            <LastSessionMeCard report={lastSessionMe.report} />
          </>
        ) : null}
        {isToday && recentMatches.length > 0 ? (
          <>
            <Spacer />
            <SectionLabel>최근 기록</SectionLabel>
            <Card>
              {recentMatches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  currentPlayerId={playerId}
                  timeLabel="weekday-time"
                  onPress={() => openMatchDetail(match.id)}
                />
              ))}
            </Card>
          </>
        ) : null}
        {!isToday && lastSession ? (
          <>
            <Spacer />
            <SectionLabel
              right={
                <TextLink
                  onPress={() => openSessionReport(lastSession.session.id)}
                >
                  리포트 ›
                </TextLink>
              }
            >
              지난 세션 · {formatKstShortDate(lastSession.session.date)}
            </SectionLabel>
            {lastSession.matches.length > 0 ? (
              <Card>
                {lastSession.matches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    currentPlayerId={playerId}
                    timeLabel="weekday-time"
                    onPress={() => openMatchDetail(match.id)}
                  />
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </>
    );
  };

  const header = liveSession ? (
    <TabHeader
      title="홈"
      right={
        <span className="mt-1.5">
          <LivePill />
        </span>
      }
      sub={
        <>
          <p className="truncate text-pk-15 font-bold text-pk-ink">
            {liveSession.name} · {liveSession.location}
          </p>
          <p className="tabular-nums">
            <button
              type="button"
              onClick={() => openParticipants(liveSession, busyPlayerIds)}
              className="font-bold text-pk-primary"
            >
              {liveSession.participants.length}명 참여 ›
            </button>
            {` · ${completedMatches.length}경기 · 진행 ${inProgressMatches.length}`}
          </p>
        </>
      }
    />
  ) : (
    <TabHeader title="홈" sub={todayLabel} />
  );

  return (
    <>
      {header}
      <div className="flex flex-col gap-2.5 px-4 pb-6">
        {liveSession ? renderLive() : null}
        {isPreSession ? renderPreSession() : null}
        {!isLiveResolved ? <HomeSkeleton /> : null}
      </div>
      {participantsTarget ? (
        <ParticipantsSheet
          isOpen={isParticipantsOpen}
          tabKey="home"
          session={participantsTarget.session}
          lockedPlayerIds={participantsTarget.lockedPlayerIds}
          onClose={closeParticipants}
          onChanged={notifyDataChanged}
        />
      ) : null}
    </>
  );
};

export default Home;
