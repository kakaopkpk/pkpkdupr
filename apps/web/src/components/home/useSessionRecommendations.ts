import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MATCHMAKING_DEFAULT_COURTS,
  MATCHMAKING_PLAYERS_PER_COURT,
  type MatchSessionRecommendationResponse,
  type RecommendedCourt,
} from "@pkpkdupr/shared/matchmaking";
import { useDataVersion } from "@/context/DataSyncContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import {
  fetchSessionRecommendations,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import type { MatchInfo } from "@/types/match";

const RECOMMENDATION_DATA_KINDS = ["sessions", "matches"] as const;

/** 진행 중 경기에서 선수 id만 보는 모양. 시작했지만 진행 중 경기 목록에 아직 없는 코트도 이 모양으로 넣는다 */
type PlayerTeams = { teams: readonly { players: readonly { id: string }[] }[] };

/** 시작에 성공한 추천 코트와 그때 보던 진행 중 경기 목록 */
interface PendingStartedCourt {
  court: PlayerTeams;
  inProgressAtStart: readonly PlayerTeams[];
}

/** 추천 코트 키. 선수 id를 팀 순서대로 이은 값이다 */
export const getCourtKey = (court: RecommendedCourt) =>
  court.teams
    .flatMap((team) => team.players.map((player) => player.id))
    .join(":");

const getPlayerSetKey = (match: PlayerTeams) =>
  match.teams
    .flatMap((team) => team.players.map((player) => player.id))
    .sort()
    .join(":");

/**
 * 추천 요청 코트 수. 기본 코트 수에서 이 세션의 진행 중 경기 수를 뺀 값이고 0보다 작지 않다.
 * 다른 세션·세션 없는 진행 중 경기는 세지 않는다
 */
export const getRequestedCourtCount = (
  sessionId: string | null,
  inProgressMatches: readonly Pick<MatchInfo, "session">[],
): number => {
  if (!sessionId) return 0;
  const sessionMatchCount = inProgressMatches.filter(
    (match) => match.session?.id === sessionId,
  ).length;
  return Math.max(0, MATCHMAKING_DEFAULT_COURTS - sessionMatchCount);
};

/** 추천에서 그 코트(같은 선수 구성)만 뺀다. 쉬는 선수·후보 수·다시 추천 횟수는 그대로다 */
export const removeRecommendedCourt = (
  recommendation: MatchSessionRecommendationResponse,
  court: RecommendedCourt,
): MatchSessionRecommendationResponse => {
  const key = getCourtKey(court);
  return {
    ...recommendation,
    courts: recommendation.courts.filter((item) => getCourtKey(item) !== key),
  };
};

/**
 * 추천 코트에 든 선수 중 지금 진행 중 경기에 있거나 세션 참여자에서 빠진 선수 id(정렬).
 * 추천이 다른 세션 것이면 비교하지 않고 빈 배열이다
 */
export const getStaleRecommendedPlayerIds = (
  recommendation: MatchSessionRecommendationResponse | null,
  session: Pick<MatchSessionDetailInfo, "id" | "participants"> | null,
  inProgressMatches: readonly PlayerTeams[],
): string[] => {
  if (!recommendation || !session || recommendation.sessionId !== session.id) {
    return [];
  }
  const busyPlayerIds = new Set(
    inProgressMatches.flatMap((match) =>
      match.teams.flatMap((team) => team.players.map((player) => player.id)),
    ),
  );
  const participantIds = new Set(
    session.participants.map((participant) => participant.id),
  );
  return recommendation.courts
    .flatMap((court) => court.teams.flatMap((team) => team.players))
    .map((player) => player.id)
    .filter((id) => busyPlayerIds.has(id) || !participantIds.has(id))
    .sort();
};

/**
 * 대기 인원(세션 참여자 중 진행 중 경기에 들지 않은 사람)으로 지금 보이는 추천보다 코트를 더 채울 수 있으면
 * 채울 수 있는 코트 수(min(요청 코트 수, floor(대기 인원 / 4))), 아니면 0.
 * 추천이 없거나 다른 세션 것이면 0이다
 */
export const getExpandableCourtCount = (
  recommendation: Pick<
    MatchSessionRecommendationResponse,
    "sessionId" | "courts"
  > | null,
  session: Pick<MatchSessionDetailInfo, "id" | "participants"> | null,
  inProgressMatches: readonly PlayerTeams[],
  requestedCourts: number,
): number => {
  if (!recommendation || !session || recommendation.sessionId !== session.id) {
    return 0;
  }
  const busyPlayerIds = new Set(
    inProgressMatches.flatMap((match) =>
      match.teams.flatMap((team) => team.players.map((player) => player.id)),
    ),
  );
  const waitingCount = session.participants.filter(
    (participant) => !busyPlayerIds.has(participant.id),
  ).length;
  const fillableCourts = Math.min(
    requestedCourts,
    Math.floor(waitingCount / MATCHMAKING_PLAYERS_PER_COURT),
  );
  return fillableCourts > recommendation.courts.length ? fillableCourts : 0;
};

export interface SessionRecommendationsState {
  recommendation: MatchSessionRecommendationResponse | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** 다시 추천을 받는 중. 그동안 보던 추천을 그대로 둔다 */
  isRerolling: boolean;
  /** 지금 요청 코트 수(getRequestedCourtCount). 0이면 추천을 받지 않는다 */
  requestedCourts: number;
  /** 다시 추천 횟수(reroll)를 하나 올려 받는다. 순환은 서버가 정한다 */
  recommendAgain: () => void;
  /** 지금 다시 추천 횟수(reroll) 그대로 다시 받는다(당겨서 새로고침) */
  reload: () => Promise<void>;
  /**
   * 추천 코트로 경기를 시작해 성공하면 부른다. 그 코트만 추천에서 빼고 다시 받지 않는다.
   * 바로 뒤에 오는 내 경기 변경 무효화 한 번으로도 다시 받지 않는다
   */
  removeStartedCourt: (court: RecommendedCourt) => void;
}

/**
 * 진행 중 세션의 복식 추천. sessionId가 null이면 받지 않는다.
 * 코트 수는 getRequestedCourtCount(기본 코트 수 − 이 세션 진행 중 경기 수)이고, 0이면 받지 않다가 1 이상이 되면 받는다.
 * 세션이 바뀌거나 내 세션·경기 변경(참여자 변경·추천 코트가 아닌 경로의 경기 시작 등) 무효화가 오면 첫 추천(reroll 0)부터 다시 받는다.
 * 추천 코트로 시작하면(removeStartedCourt) 그 코트만 빼고 다시 받지 않는다.
 * 추천이 바뀌면 보던 매칭이 흔들리므로 TTL·남의 변경으로는 다시 받지 않는다(localOnly).
 * 예외로 추천 코트의 선수가 진행 중 경기(useLiveSession().inProgressMatches)에 들어가거나 세션 참여자에서 빠지면
 * 지금 다시 추천 횟수(reroll) 그대로 다시 받는다.
 * 또 대기 인원으로 채울 수 있는 코트 수(getExpandableCourtCount)가 보이는 추천 코트 수보다 많아지면 지금 다시 추천 횟수(reroll) 그대로 다시 받는다.
 * 코트가 늘지 않는 변경(남의 경기 완료 등)으로는 보던 추천을 바꾸지 않는다.
 */
export const useSessionRecommendations = (
  sessionId: string | null,
): SessionRecommendationsState => {
  const dataVersion = useDataVersion(RECOMMENDATION_DATA_KINDS, {
    localOnly: true,
  });
  const [recommendation, setRecommendation] =
    useState<MatchSessionRecommendationResponse | null>(null);
  const [status, setStatus] =
    useState<SessionRecommendationsState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isRerolling, setIsRerolling] = useState(false);
  const requestIdRef = useRef(0);
  const loadedSessionIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  /**
   * 마지막으로 받은 다시 추천 횟수. 다시 추천은 이 값 + 1을 요청하므로,
   * 받는 중에 또 누르거나 요청이 실패해도 횟수가 건너뛰지 않는다(늦은 응답은 requestId로 버린다).
   */
  const shownRerollRef = useRef(0);
  const { liveSession, inProgressMatches } = useLiveSession();

  /**
   * 시작에 성공했지만 진행 중 경기 목록이 아직 그 뒤로 갱신되지 않은 코트. 그동안 그 선수를 경기 중으로,
   * 그 코트를 이 세션 진행 중 경기로 쳐서 stale·코트 늘리기 판정이 다시 받지 않게 한다.
   * 목록이 한 번이라도 갱신되면(시작 뒤 요청이라 그 경기가 있거나, 그새 끝나 없거나) 더 치지 않는다
   */
  const [pendingStartedCourts, setPendingStartedCourts] = useState<
    readonly PendingStartedCourt[]
  >([]);
  const unseenStartedCourts = useMemo(
    () =>
      pendingStartedCourts
        .filter((pending) => pending.inProgressAtStart === inProgressMatches)
        .map((pending) => pending.court),
    [inProgressMatches, pendingStartedCourts],
  );
  useEffect(() => {
    setPendingStartedCourts((courts) => (courts.length === 0 ? courts : []));
  }, [sessionId]);
  /**
   * 시작 때 받는 중이던 추천 요청과 그 뒤 시작한 코트의 선수 구성 키. 그 응답은 시작 전 상태로 만들었으므로
   * 시작한 코트를 빼고 반영한다(시작한 선수가 다른 코트에 들었으면 stale 판정이 다시 받는다)
   */
  const startedDuringRequestRef = useRef<{
    requestId: number;
    playerSetKeys: string[];
  } | null>(null);

  const busyMatches = useMemo<readonly PlayerTeams[]>(
    () =>
      unseenStartedCourts.length === 0
        ? inProgressMatches
        : [...inProgressMatches, ...unseenStartedCourts],
    [inProgressMatches, unseenStartedCourts],
  );
  const requestedCourts = Math.max(
    0,
    getRequestedCourtCount(sessionId, inProgressMatches) -
      unseenStartedCourts.length,
  );
  // load·removeStartedCourt가 이 값들이 바뀔 때마다 다시 만들어지지 않도록 ref로 읽는다
  const requestedCourtsRef = useRef(requestedCourts);
  const inProgressMatchesRef = useRef(inProgressMatches);
  useLayoutEffect(() => {
    requestedCourtsRef.current = requestedCourts;
    inProgressMatchesRef.current = inProgressMatches;
  }, [inProgressMatches, requestedCourts]);

  const load = useCallback(
    async (reroll: number) => {
      const requestId = ++requestIdRef.current;
      if (!sessionId) {
        loadedSessionIdRef.current = null;
        isLoadingRef.current = false;
        setIsRerolling(false);
        setRecommendation(null);
        setStatus("idle");
        setError(null);
        return;
      }

      // 코트가 모두 경기 중이면 받지 않는다. 받는 중이던 요청은 requestId로 버린다
      const courts = requestedCourtsRef.current;
      if (courts === 0) {
        if (loadedSessionIdRef.current !== sessionId) {
          loadedSessionIdRef.current = sessionId;
          setRecommendation(null);
        }
        isLoadingRef.current = false;
        setIsRerolling(false);
        setStatus("ready");
        setError(null);
        return;
      }
      isLoadingRef.current = true;

      // 다른 세션이면 이전 추천을 지우고 스켈레톤부터 보인다
      if (loadedSessionIdRef.current !== sessionId) {
        loadedSessionIdRef.current = sessionId;
        setRecommendation(null);
        setStatus("loading");
      }
      try {
        const data = await fetchSessionRecommendations(
          sessionId,
          courts,
          reroll,
        );
        if (requestIdRef.current !== requestId) return;
        isLoadingRef.current = false;
        setIsRerolling(false);
        shownRerollRef.current = data.reroll;
        const startedDuringRequest = startedDuringRequestRef.current;
        if (startedDuringRequest?.requestId === requestId) {
          const startedKeys = new Set(startedDuringRequest.playerSetKeys);
          setRecommendation({
            ...data,
            courts: data.courts.filter(
              (court) => !startedKeys.has(getPlayerSetKey(court)),
            ),
          });
        } else {
          setRecommendation(data);
        }
        setStatus("ready");
        setError(null);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        isLoadingRef.current = false;
        setIsRerolling(false);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "추천 매칭을 불러오지 못했어요.",
        );
        setStatus("error");
      }
    },
    [sessionId],
  );

  // 추천 코트 시작 직후 오는 내 경기 변경 무효화 한 번은 건너뛴다. 세션이 바뀌면(load가 바뀜) 건너뛰지 않는다
  const skipNextDataVersionRef = useRef(false);
  const handledLoadRef = useRef<typeof load | null>(null);
  useEffect(() => {
    const isSameSession = handledLoadRef.current === load;
    handledLoadRef.current = load;
    const shouldSkip = isSameSession && skipNextDataVersionRef.current;
    skipNextDataVersionRef.current = false;
    if (shouldSkip) return;
    shownRerollRef.current = 0;
    void load(0);
  }, [load, dataVersion]);

  const removeStartedCourt = useCallback((court: RecommendedCourt) => {
    skipNextDataVersionRef.current = true;
    const requestId = requestIdRef.current;
    const playerSetKey = getPlayerSetKey(court);
    const startedDuringRequest = startedDuringRequestRef.current;
    startedDuringRequestRef.current = {
      requestId,
      playerSetKeys:
        startedDuringRequest?.requestId === requestId
          ? [...startedDuringRequest.playerSetKeys, playerSetKey]
          : [playerSetKey],
    };
    setRecommendation((current) =>
      current ? removeRecommendedCourt(current, court) : current,
    );
    const inProgressAtStart = inProgressMatchesRef.current;
    // 목록이 갱신돼 더 치지 않는 코트는 이참에 버린다
    setPendingStartedCourts((courts) => [
      ...courts.filter(
        (pending) => pending.inProgressAtStart === inProgressAtStart,
      ),
      { court, inProgressAtStart },
    ]);
  }, []);

  // 코트가 모두 경기 중이다가 빈 코트가 생기면 받는다
  const previousRequestedCourtsRef = useRef(requestedCourts);
  useEffect(() => {
    const previous = previousRequestedCourtsRef.current;
    previousRequestedCourtsRef.current = requestedCourts;
    // 세션이 바뀌어 이미 받는 중이면 겹쳐 받지 않는다
    if (previous === 0 && requestedCourts > 0 && !isLoadingRef.current) {
      void load(shownRerollRef.current);
    }
  }, [load, requestedCourts]);

  const staleKey = useMemo(
    () =>
      getStaleRecommendedPlayerIds(
        recommendation,
        liveSession,
        busyMatches,
      ).join(","),
    [busyMatches, liveSession, recommendation],
  );
  // 같은 선수 조합이 이어서 stale인 동안은 한 번만 다시 받는다. 서버가 아직 그 선수를 추천하면(진행 중 경기 목록이 늦음 등) 되풀이하지 않는다.
  // stale이 풀리면 잊어서, 나중에 같은 조합이 다시 stale이 되면 또 받는다
  const handledStaleKeyRef = useRef("");
  useEffect(() => {
    if (!staleKey) {
      handledStaleKeyRef.current = "";
      return;
    }
    // 받는 중이면 건너뛰고, 응답으로 recommendation이 바뀌면 이 effect가 다시 판정한다
    if (isLoadingRef.current) return;
    if (handledStaleKeyRef.current === staleKey) return;
    handledStaleKeyRef.current = staleKey;
    void load(shownRerollRef.current);
  }, [load, recommendation, staleKey]);

  const expandableCourts = useMemo(
    () =>
      getExpandableCourtCount(
        recommendation,
        liveSession,
        busyMatches,
        requestedCourts,
      ),
    [busyMatches, liveSession, recommendation, requestedCourts],
  );
  // 같은 코트 수로는 한 번만 다시 받는다. 서버가 그만큼 채우지 못해도(진행 중 경기 목록이 늦음 등) 되풀이하지 않는다.
  // 추천이 있는데 늘어날 코트가 없어지면 잊어서, 나중에 다시 늘 수 있게 되면 또 받는다.
  // 추천을 비운 동안(세션 바뀜)은 잊지 않아, 응답이 같은 코트 수에 못 미쳐도 또 받지 않는다
  const handledExpandableCourtsRef = useRef(0);
  useEffect(() => {
    if (!expandableCourts) {
      if (recommendation) handledExpandableCourtsRef.current = 0;
      return;
    }
    // 받는 중이면 건너뛰고, 응답으로 recommendation이 바뀌면 이 effect가 다시 판정한다
    if (isLoadingRef.current) return;
    if (handledExpandableCourtsRef.current === expandableCourts) return;
    handledExpandableCourtsRef.current = expandableCourts;
    void load(shownRerollRef.current);
  }, [expandableCourts, load, recommendation]);

  // 보던 추천을 비우지 않고 새 추천이 오면 바꿔 끼워, 스켈레톤으로 카드 높이가 흔들리지 않게 한다
  const recommendAgain = useCallback(() => {
    setIsRerolling(true);
    void load(shownRerollRef.current + 1);
  }, [load]);

  const reload = useCallback(() => load(shownRerollRef.current), [load]);

  return {
    recommendation,
    status,
    error,
    isRerolling,
    requestedCourts,
    recommendAgain,
    reload,
    removeStartedCourt,
  };
};
