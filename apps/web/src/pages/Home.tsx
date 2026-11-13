import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecommendedCourt } from "@pkpkdupr/shared/matchmaking";
import type { MatchInfo } from "@/types/match";
import HomeSkeleton from "@/components/home/HomeSkeleton";
import LastSessionFeed from "@/components/home/LastSessionFeed";
import MyLiveMatchCard from "@/components/home/MyLiveMatchCard";
import NextSessionCard, {
  type ParticipationAction,
} from "@/components/home/NextSessionCard";
import RecommendationSection, {
  getCourtKey,
} from "@/components/home/RecommendationSection";
import {
  byLatestStart,
  usePreSessionData,
} from "@/components/home/usePreSessionData";
import { useSessionRecommendations } from "@/components/home/useSessionRecommendations";
import { useSessionTopRiser } from "@/components/home/useSessionTopRiser";
import { TopRiserCard } from "@/components/records/SessionReportParts";
import ParticipantsSheet from "@/components/session/ParticipantsSheet";
import { getErrorMessage, isNetworkError } from "@/components/session/saveError";
import { LivePill } from "@/components/ui/Badges";
import { Card } from "@/components/ui/Card";
import { LiveMatchRow, MatchRow } from "@/components/ui/MatchRow";
import { LinkChevron, SectionLabel } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
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

const getMatchPlayerIds = (match: MatchInfo) =>
  match.teams.flatMap((team) => team.players.map((player) => player.id));

const EmptyText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Card className="py-4">
    <p className="text-pk-13 text-pk-sub">{children}</p>
  </Card>
);

const Spacer: React.FC = () => <div className="h-1.5" />;

/** 누르면 경기 상세를 여는 경기 목록 카드 */
const MatchListCard: React.FC<{
  matches: MatchInfo[];
  currentPlayerId: string | undefined;
  onOpenMatch: (matchId: string) => void;
}> = ({ matches, currentPlayerId, onOpenMatch }) => (
  <Card>
    {matches.map((match) => (
      <MatchRow
        key={match.id}
        match={match}
        currentPlayerId={currentPlayerId}
        onPress={() => onOpenMatch(match.id)}
      />
    ))}
  </Card>
);

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
 * 없으면 다가오는 첫 세션 카드, 세션 밖 진행 중 경기, 지난 세션 피드를 보인다.
 */
const Home: React.FC = () => {
  const { player } = useAuth();
  const playerId = player?.id;
  const live = useLiveSession();
  const {
    openRecordMatch,
    openMatchDetail,
    notifyDataChanged,
    dataVersion,
  } = useAppNavigation();
  const { registerPullToRefresh } = useTabNavigation();
  const { showSaveFailure } = useSystemNotice();
  const now = useMinuteClock();
  // 비동기 요청이 끝난 시점에 최신 dataVersion을 읽기 위한 ref
  const dataVersionRef = useRef(dataVersion);
  dataVersionRef.current = dataVersion;

  const liveSession = live.liveSession;
  const isLiveResolved = live.status !== "loading" || liveSession !== null;
  const isPreSession = isLiveResolved && !liveSession;
  const isLiveParticipant = !!liveSession && live.isParticipant;

  const preSession = usePreSessionData({
    enabled: isPreSession,
    dataVersion,
  });
  const liveTopRiser = useSessionTopRiser(liveSession?.id ?? null, dataVersion);
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
      // notifyDataChanged가 dataVersion을 1 올리고 그 값으로 다시 받는다.
      // 요청 중 다른 곳에서 올린 버전도 반영하도록 호출 직전의 최신 값을 기준으로 삼는다
      const awaitVersion = dataVersionRef.current + 1;
      notifyDataChanged();
      return awaitVersion;
    };

    setParticipation({ action, awaitVersion: null });
    setParticipationError(null);
    try {
      const awaitVersion = await run();
      setParticipation({ action, awaitVersion });
    } catch (err) {
      setParticipation(null);
      if (isNetworkError(err)) {
        showSaveFailure({
          onRetry: async () => {
            await run();
          },
        });
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
  // 세션 밖 경기까지 포함한 진행 중 경기. 경기 중인 선수 판단(대기 인원·참여 취소 잠금)에 쓴다
  const inProgressMatches = live.inProgressMatches;
  const myInProgressMatch = live.myInProgressMatch;
  const sessionInProgressMatches = useMemo(
    () =>
      liveSession
        ? inProgressMatches.filter(
            (match) => match.session?.id === liveSession.id,
          )
        : [],
    [inProgressMatches, liveSession],
  );
  // 세션 머리의 진행 수. 세션 밖 내 경기도 진행 중 목록에 함께 보이므로 센다
  const liveInProgressCount =
    sessionInProgressMatches.length +
    (myInProgressMatch &&
    !sessionInProgressMatches.some((match) => match.id === myInProgressMatch.id)
      ? 1
      : 0);
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
  /** 진행 중 머리·내 경기 카드·남의 진행 중 경기 줄. 내 경기는 세션 밖 경기여도 맨 위에 온다 */
  const renderInProgress = (otherMatches: MatchInfo[]) => {
    const count = otherMatches.length + (myInProgressMatch ? 1 : 0);

    return (
      <>
        <SectionLabel>진행 중 {count}</SectionLabel>
        {myInProgressMatch ? (
          <MyLiveMatchCard
            match={myInProgressMatch}
            now={now}
            onEnterScore={() =>
              openRecordMatch({ kind: "score", matchId: myInProgressMatch.id })
            }
          />
        ) : null}
        {otherMatches.length > 0 ? (
          <Card>
            {otherMatches.map((match) => (
              <LiveMatchRow
                key={match.id}
                match={match}
                now={now}
                onPress={() => openMatchDetail(match.id)}
              />
            ))}
          </Card>
        ) : count === 0 ? (
          <EmptyText>진행 중인 경기가 없어요</EmptyText>
        ) : null}
      </>
    );
  };

  const renderLive = () => (
    <>
      {liveTopRiser ? (
        <>
          <TopRiserCard report={liveTopRiser} />
          <Spacer />
        </>
      ) : null}
      {renderInProgress(
        sessionInProgressMatches.filter(
          (match) => match.id !== myInProgressMatch?.id,
        ),
      )}
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
        <MatchListCard
          matches={completedMatches}
          currentPlayerId={playerId}
          onOpenMatch={openMatchDetail}
        />
      ) : (
        <EmptyText>아직 기록된 경기가 없어요</EmptyText>
      )}
      {/* 미참여자의 참여하기는 셸의 알림 바가 맡는다. 그 바에 가리지 않게 여백을 둔다 */}
      {!isLiveParticipant ? <div className="h-16" /> : null}
    </>
  );

  const renderPreSession = () => {
    const { data, status, error } = preSession;
    // 진행 중 경기는 다가오는 세션 조회와 따로 받으므로 그 조회가 실패해도 보인다
    const inProgressSection =
      inProgressMatches.length > 0 ? (
        <>
          <Spacer />
          {renderInProgress(
            inProgressMatches.filter(
              (match) => match.id !== myInProgressMatch?.id,
            ),
          )}
        </>
      ) : null;
    if (!data) {
      if (status === "error") {
        return (
          <>
            <p
              role="alert"
              className="px-1 py-6 text-center text-pk-13 font-medium text-pk-down"
            >
              {error ?? "다가오는 세션을 불러오지 못했어요."}
            </p>
            {inProgressSection}
          </>
        );
      }
      return <HomeSkeleton />;
    }

    const { upcoming, lastSessionReport } = data;

    return (
      <>
        {/* 다시 받기에 실패하면 이전 데이터를 둔 채 실패를 알린다 */}
        {status === "error" ? (
          <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
            {error ?? "다가오는 세션을 불러오지 못했어요."}
          </p>
        ) : null}
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
        {inProgressSection}
        {lastSessionReport ? (
          <>
            <Spacer />
            <LastSessionFeed report={lastSessionReport} playerId={playerId} />
          </>
        ) : null}
      </>
    );
  };

  // 세션 중에만 세션 머리를 둔다. 세션 없는 날·세션 전에는 탭 제목 없이 첫 카드부터 보인다
  const header = liveSession ? (
    <header className="flex flex-col gap-1 px-5 pt-4 pb-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-pk-17 font-extrabold text-pk-ink">
          {liveSession.name}
        </h1>
        <LivePill />
      </div>
      <p className="flex min-w-0 items-center text-pk-13 text-pk-sub tabular-nums">
        <button
          type="button"
          onClick={() => openParticipants(liveSession, busyPlayerIds)}
          className="inline-flex shrink-0 items-center gap-0.5 font-bold text-pk-primary"
        >
          {liveSession.participants.length}명 참여
          <LinkChevron />
        </button>
        {/* flex 항목의 앞 공백은 사라지므로 버튼과의 간격은 pl로 둔다 */}
        <span className="min-w-0 truncate pl-1">
          {[
            liveSession.location,
            `${completedMatches.length}경기`,
            `진행 ${liveInProgressCount}`,
          ]
            .filter(Boolean)
            .map((part) => `· ${part}`)
            .join(" ")}
        </span>
      </p>
    </header>
  ) : null;

  return (
    <>
      {header}
      <div className={cx("flex flex-col gap-2.5 px-4 pb-6", !header && "pt-4")}>
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
