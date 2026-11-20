import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MATCHMAKING_DEFAULT_COURTS,
  MATCHMAKING_PLAYERS_PER_COURT,
  type MatchSessionRecommendationResponse,
} from "@pkpkdupr/shared/matchmaking";
import { useDataVersion } from "@/context/DataSyncContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import {
  fetchSessionRecommendations,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import type { MatchInfo } from "@/types/match";

const RECOMMENDATION_DATA_KINDS = ["sessions", "matches"] as const;

/**
 * 추천 코트에 든 선수 중 지금 진행 중 경기에 있거나 세션 참여자에서 빠진 선수 id(정렬).
 * 추천이 다른 세션 것이면 비교하지 않고 빈 배열이다
 */
export const getStaleRecommendedPlayerIds = (
  recommendation: MatchSessionRecommendationResponse | null,
  session: Pick<MatchSessionDetailInfo, "id" | "participants"> | null,
  inProgressMatches: readonly Pick<MatchInfo, "teams">[],
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
  inProgressMatches: readonly Pick<MatchInfo, "teams">[],
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
  /** 감점순 다음 후보를 받는다. 마지막 후보 다음은 서버가 1등으로 돌린다 */
  recommendAgain: () => void;
  /** 지금 순번 그대로 다시 받는다(당겨서 새로고침) */
  reload: () => Promise<void>;
}

/**
 * 진행 중 세션의 복식 추천. sessionId가 null이면 받지 않는다.
 * 코트 수는 API 기본값이고, 세션이 바뀌거나 내 세션·경기 변경(경기 시작·참여자 변경) 무효화가 오면 1등부터 다시 받는다.
 * 추천이 바뀌면 보던 매칭이 흔들리므로 TTL·남의 변경으로는 다시 받지 않는다(localOnly).
 * 예외로 추천 코트의 선수가 진행 중 경기(useLiveSession().inProgressMatches)에 들어가거나 세션 참여자에서 빠지면
 * 지금 순번 그대로 다시 받는다.
 * 또 대기 인원으로 채울 수 있는 코트 수(getExpandableCourtCount)가 보이는 추천 코트 수보다 많아지면 지금 순번 그대로 다시 받는다.
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
  const requestIdRef = useRef(0);
  const loadedSessionIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  /**
   * 마지막으로 받은 후보 순번. 다시 추천은 이 다음 순번을 요청하므로,
   * 받는 중에 또 누르거나 요청이 실패해도 순번이 건너뛰지 않는다(늦은 응답은 requestId로 버린다).
   */
  const shownRankRef = useRef(0);
  const { liveSession, inProgressMatches } = useLiveSession();

  const load = useCallback(
    async (rank: number) => {
      const requestId = ++requestIdRef.current;
      if (!sessionId) {
        loadedSessionIdRef.current = null;
        isLoadingRef.current = false;
        setRecommendation(null);
        setStatus("idle");
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
          MATCHMAKING_DEFAULT_COURTS,
          rank,
        );
        if (requestIdRef.current !== requestId) return;
        isLoadingRef.current = false;
        shownRankRef.current = data.rank;
        setRecommendation(data);
        setStatus("ready");
        setError(null);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        isLoadingRef.current = false;
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

  useEffect(() => {
    shownRankRef.current = 0;
    void load(0);
  }, [load, dataVersion]);

  const staleKey = useMemo(
    () =>
      getStaleRecommendedPlayerIds(
        recommendation,
        liveSession,
        inProgressMatches,
      ).join(","),
    [inProgressMatches, liveSession, recommendation],
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
    void load(shownRankRef.current);
  }, [load, recommendation, staleKey]);

  const expandableCourts = useMemo(
    () =>
      getExpandableCourtCount(
        recommendation,
        liveSession,
        inProgressMatches,
        MATCHMAKING_DEFAULT_COURTS,
      ),
    [inProgressMatches, liveSession, recommendation],
  );
  // 같은 코트 수로는 한 번만 다시 받는다. 서버가 그만큼 채우지 못해도(진행 중 경기 목록이 늦음 등) 되풀이하지 않는다.
  // 추천이 있는데 늘어날 코트가 없어지면 잊어서, 나중에 다시 늘 수 있게 되면 또 받는다.
  // 추천을 비운 동안(다시 추천·세션 바뀜)은 잊지 않아, 응답이 같은 코트 수에 못 미쳐도 또 받지 않는다
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
    void load(shownRankRef.current);
  }, [expandableCourts, load, recommendation]);

  const recommendAgain = useCallback(() => {
    setStatus("loading");
    setRecommendation(null);
    void load(shownRankRef.current + 1);
  }, [load]);

  const reload = useCallback(() => load(shownRankRef.current), [load]);

  return { recommendation, status, error, recommendAgain, reload };
};
