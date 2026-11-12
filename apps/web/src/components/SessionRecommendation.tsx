import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@heroui/react";
import { IoRefresh } from "react-icons/io5";
import {
  MATCHMAKING_DEFAULT_COURTS,
  MATCHMAKING_MAX_COURTS,
  MATCHMAKING_MIN_COURTS,
  MATCHMAKING_PLAYERS_PER_COURT,
  type MatchSessionRecommendationResponse,
  type RecommendationPlayer,
  type RecommendedCourt,
  type RecommendedTeam,
} from "@pkpkdupr/shared/matchmaking";
import Avatar from "@/components/Avatar";
import DetailPageHeader from "@/components/DetailPageHeader";
import SkeletonBlock from "@/components/SkeletonBlock";
import TabPanelStatus from "@/components/TabPanelStatus";
import {
  fetchSessionRecommendations,
  startSessionMatch,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import { formatRating } from "@/utils/dupr";

/** 기기 설정이라 로그아웃해도 지우지 않는다(USER_CACHE_KEYS에 넣지 않음) */
const RECOMMENDATION_COURTS_STORAGE_KEY =
  "pkpkdupr:recommendation-courts";

const COURT_OPTIONS = Array.from(
  { length: MATCHMAKING_MAX_COURTS - MATCHMAKING_MIN_COURTS + 1 },
  (_, index) => MATCHMAKING_MIN_COURTS + index,
);

const sectionTitleClassName =
  "px-1 text-[clamp(1rem,4.5cqw,1.25rem)] font-semibold tracking-wide text-pkpk-sub-title";
const tagClassName =
  "inline-flex min-h-6 items-center rounded-full px-2 py-0.5 text-[clamp(0.625rem,2.8vw,0.75rem)] font-semibold leading-tight";

const readStoredCourts = () => {
  try {
    const value = Number(localStorage.getItem(RECOMMENDATION_COURTS_STORAGE_KEY));
    return Number.isInteger(value) &&
      value >= MATCHMAKING_MIN_COURTS &&
      value <= MATCHMAKING_MAX_COURTS
      ? value
      : MATCHMAKING_DEFAULT_COURTS;
  } catch {
    return MATCHMAKING_DEFAULT_COURTS;
  }
};

const writeStoredCourts = (courts: number) => {
  try {
    localStorage.setItem(RECOMMENDATION_COURTS_STORAGE_KEY, String(courts));
  } catch {
    // 저장소를 못 써도 이번 화면의 선택은 유지한다
  }
};

const SEED_RANGE = 2 ** 31;
const SKELETON_COURT_COUNT = 2;

const createSeed = () => Math.floor(Math.random() * SEED_RANGE);

const getCourtName = (courtIndex: number) => `코트 ${courtIndex + 1}`;

type CourtStartState =
  | { status: "starting" }
  | { status: "started" }
  | { status: "failed"; message: string };

interface SessionRecommendationProps {
  session: MatchSessionDetailInfo;
  currentPlayerId?: string;
  isOnline: boolean;
  /** 경기를 시작한 뒤 피드·세션 상세·오늘 세션을 다시 읽는다 */
  onMatchStarted?: () => Promise<void>;
}

const RecommendationSkeleton: React.FC = () => (
  <div
    className="flex flex-col gap-3"
    role="status"
    aria-label="추천 매칭 로딩 중"
  >
    {Array.from({ length: SKELETON_COURT_COUNT }, (_, index) => (
      <Card key={index} className="rounded-3xl bg-white p-3">
        <SkeletonBlock className="h-4 w-16" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <SkeletonBlock className="h-20" />
          <SkeletonBlock className="h-20" />
        </div>
        <SkeletonBlock className="mt-3 h-10 w-full rounded-2xl" />
      </Card>
    ))}
  </div>
);

const RecommendationPlayerRow: React.FC<{
  player: RecommendationPlayer;
  isMe: boolean;
}> = ({ player, isMe }) => (
  <div className="flex min-w-0 items-center gap-2">
    <Avatar
      size="xs"
      avatarUrl={player.avatarUrl}
      name={player.username}
      className="h-8 w-8 shrink-0 bg-white"
    />
    <div className="flex min-w-0 flex-col">
      <span
        className={`truncate text-sm text-pkpk-main-font ${
          isMe ? "font-bold" : "font-medium"
        }`}
      >
        {player.username}
      </span>
      <span className="text-xs font-semibold tabular-nums text-pkpk-dupr-font">
        {formatRating(player.doublesRating)}
      </span>
    </div>
  </div>
);

const RecommendationTeam: React.FC<{
  team: RecommendedTeam;
  label: string;
  currentPlayerId?: string;
}> = ({ team, label, currentPlayerId }) => (
  <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-pkpk-primary-bg/5 p-2">
    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
      <span className="text-pkpk-sub-font">{label}</span>
      <span className="tabular-nums text-pkpk-dupr-font">
        평균 {formatRating(team.averageRating)}
      </span>
    </div>
    {team.players.map((player) => (
      <RecommendationPlayerRow
        key={player.id}
        player={player}
        isMe={player.id === currentPlayerId}
      />
    ))}
  </div>
);

interface RecommendationCourtCardProps {
  court: RecommendedCourt;
  courtIndex: number;
  currentPlayerId?: string;
  startState?: CourtStartState;
  isStartDisabled: boolean;
  onStart: () => void;
}

const RecommendationCourtCard: React.FC<RecommendationCourtCardProps> = ({
  court,
  courtIndex,
  currentPlayerId,
  startState,
  isStartDisabled,
  onStart,
}) => {
  const nameById = new Map(
    court.teams
      .flatMap((team) => team.players)
      .map((player) => [player.id, player.username]),
  );
  const getName = (playerId: string) => nameById.get(playerId) ?? "?";
  const repeatTags = [
    ...court.repeatedPartnerPairs.map(
      ([a, b]) => `오늘 같은 팀: ${getName(a)}·${getName(b)}`,
    ),
    ...court.repeatedOpponentPairs.map(
      ([a, b]) => `오늘 맞대결: ${getName(a)} vs ${getName(b)}`,
    ),
  ];
  const isStarted = startState?.status === "started";
  const isStarting = startState?.status === "starting";

  return (
    <Card className="w-full rounded-3xl border border-pkpk-sub-bg bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="mr-1 text-base font-semibold text-pkpk-main-font">
          {getCourtName(courtIndex)}
        </p>
        {repeatTags.map((tag) => (
          <span key={tag} className={`${tagClassName} bg-amber-100 text-amber-700`}>
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <RecommendationTeam
          team={court.teams[0]}
          label="Team A"
          currentPlayerId={currentPlayerId}
        />
        <span className="text-xs font-bold text-pkpk-sub-font">vs</span>
        <RecommendationTeam
          team={court.teams[1]}
          label="Team B"
          currentPlayerId={currentPlayerId}
        />
      </div>
      <Button
        size="sm"
        className={`app-action-button mt-3 w-full rounded-2xl font-semibold ${
          isStarted
            ? "bg-emerald-50 text-emerald-700"
            : "bg-[#409eff] text-white"
        } disabled:bg-slate-200 disabled:text-slate-400`}
        isDisabled={isStarted || isStarting || isStartDisabled}
        onPress={onStart}
      >
        {isStarted ? "시작됨" : isStarting ? "시작하는 중…" : "이 경기 시작"}
      </Button>
      {startState?.status === "failed" ? (
        <p className="mt-2 px-1 text-xs font-medium text-error" role="alert">
          {startState.message}
        </p>
      ) : null}
    </Card>
  );
};

const SessionRecommendation: React.FC<SessionRecommendationProps> = ({
  session,
  currentPlayerId,
  isOnline,
  onMatchStarted,
}) => {
  const [courts, setCourts] = useState(readStoredCourts);
  // 화면을 열 때와 "다시 추천"마다 새 seed를 쓴다
  const [seed, setSeed] = useState(createSeed);
  const [recommendation, setRecommendation] =
    useState<MatchSessionRecommendationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 추천 결과의 코트 순서 기준. 새 추천을 받으면 비운다
  const [startStates, setStartStates] = useState<
    Record<number, CourtStartState>
  >({});
  const latestRequestIdRef = useRef(0);

  const loadRecommendation = useCallback(async () => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    setIsLoading(true);
    setError(null);
    setRecommendation(null);
    setStartStates({});
    try {
      const data = await fetchSessionRecommendations(session.id, courts, seed);
      if (latestRequestIdRef.current !== requestId) return;
      setRecommendation(data);
    } catch (err) {
      if (latestRequestIdRef.current !== requestId) return;
      setError(
        err instanceof Error ? err.message : "추천 매칭을 불러오지 못했어요.",
      );
    } finally {
      if (latestRequestIdRef.current === requestId) setIsLoading(false);
    }
  }, [courts, seed, session.id]);

  useEffect(() => {
    void loadRecommendation();
  }, [loadRecommendation]);

  const changeCourts = (nextCourts: number) => {
    if (nextCourts === courts) return;

    writeStoredCourts(nextCourts);
    setCourts(nextCourts);
  };

  const recommendAgain = () => {
    if (!isOnline) return;
    setSeed(createSeed());
  };

  const startCourt = async (court: RecommendedCourt, courtIndex: number) => {
    if (!isOnline) return;

    // 응답 전에 추천이 바뀌면 코트 인덱스가 다른 대진을 가리키므로 결과를 반영하지 않는다
    const requestId = latestRequestIdRef.current;
    const updateStartState = (state: CourtStartState) => {
      if (latestRequestIdRef.current !== requestId) return;
      setStartStates((states) => ({ ...states, [courtIndex]: state }));
    };

    setStartStates((states) => ({
      ...states,
      [courtIndex]: { status: "starting" },
    }));
    try {
      await startSessionMatch(session.id, {
        teams: [
          {
            name: "Team A",
            playerIds: court.teams[0].players.map((player) => player.id),
          },
          {
            name: "Team B",
            playerIds: court.teams[1].players.map((player) => player.id),
          },
        ],
        courtName: getCourtName(courtIndex),
      });
      updateStartState({ status: "started" });
      // 시작은 이미 성공했으므로 목록 갱신 실패는 이 화면에 오류로 띄우지 않는다
      void onMatchStarted?.().catch(() => {});
    } catch (err) {
      updateStartState({
        status: "failed",
        message:
          err instanceof Error ? err.message : "경기를 시작하지 못했어요.",
      });
    }
  };

  // 시작 요청 중에 추천을 바꾸면 이미 시작된 대진을 다시 시작할 수 있으므로 막는다
  const isAnyCourtStarting = Object.values(startStates).some(
    (state) => state.status === "starting",
  );

  let content: React.ReactNode;
  if (isLoading && !recommendation) {
    content = <RecommendationSkeleton />;
  } else if (error) {
    content = (
      <div className="flex flex-col gap-3">
        <TabPanelStatus message={error} tone="error" />
        <Button
          type="button"
          className="app-action-button w-full rounded-2xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          isDisabled={!isOnline}
          onPress={() => void loadRecommendation()}
        >
          다시 시도
        </Button>
      </div>
    );
  } else if (recommendation) {
    content = (
      <>
        {recommendation.courts.length === 0 ? (
          <p className="rounded-2xl bg-white px-3 py-4 text-center text-sm font-medium text-pkpk-sub-font">
            {`추천하려면 경기에 나갈 수 있는 참여자가 ${MATCHMAKING_PLAYERS_PER_COURT}명 이상 필요해요.`}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {recommendation.courts.map((court, courtIndex) => (
              <RecommendationCourtCard
                key={court.teams
                  .flatMap((team) => team.players.map((player) => player.id))
                  .join(":")}
                court={court}
                courtIndex={courtIndex}
                currentPlayerId={currentPlayerId}
                startState={startStates[courtIndex]}
                isStartDisabled={!isOnline}
                onStart={() => void startCourt(court, courtIndex)}
              />
            ))}
          </div>
        )}
        <section>
          <p className={sectionTitleClassName}>
            쉬는 사람 {recommendation.restingPlayers.length}명
          </p>
          <Card className="mt-1.5 rounded-xl border border-pkpk-sub-bg/30 bg-white/95 p-3">
            {recommendation.restingPlayers.length === 0 ? (
              <p className="text-sm text-pkpk-sub-font">이번에는 모두 경기해요.</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {recommendation.restingPlayers.map((player) => (
                  <RecommendationPlayerRow
                    key={player.id}
                    player={player}
                    isMe={player.id === currentPlayerId}
                  />
                ))}
              </div>
            )}
          </Card>
        </section>
      </>
    );
  }

  return (
    <div className="min-h-full">
      <DetailPageHeader title="추천 매칭" tabKey="home" />
      <div className="p-2">
        <div className="mx-auto flex w-full flex-col gap-3">
          <div className="px-1">
            <p className="text-lg font-semibold text-pkpk-main-font">
              추천 매칭
            </p>
            <p className="truncate text-xs font-medium text-pkpk-sub-font">
              {session.name} · {session.location} · 복식
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="코트 수"
              className="flex flex-1 gap-1 rounded-2xl bg-white p-1"
            >
              {COURT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={option === courts}
                  className={`h-9 flex-1 rounded-xl text-sm font-semibold transition-colors ${
                    option === courts
                      ? "bg-pkpk-primary-bg text-white"
                      : "text-pkpk-sub-font hover:bg-pkpk-primary-bg/10"
                  } disabled:opacity-40`}
                  disabled={!isOnline || isAnyCourtStarting}
                  onClick={() => changeCourts(option)}
                >
                  {option}코트
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="app-action-button shrink-0 rounded-2xl font-semibold text-pkpk-primary-bg"
              isDisabled={!isOnline || isLoading || isAnyCourtStarting}
              onPress={recommendAgain}
            >
              <IoRefresh aria-hidden="true" className="size-4" />
              다시 추천
            </Button>
          </div>
          {!isOnline ? (
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-pkpk-sub-font">
              오프라인에서는 추천을 다시 받거나 경기를 시작할 수 없어요.
            </p>
          ) : null}
          {content}
        </div>
      </div>
    </div>
  );
};

export default SessionRecommendation;
