import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MATCHMAKING_DEFAULT_COURTS,
  type MatchSessionRecommendationResponse,
} from "@pkpkdupr/shared/matchmaking";
import { useDataVersion } from "@/context/DataSyncContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import {
  fetchSessionRecommendations,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import type { MatchInfo } from "@/types/match";

const SEED_RANGE = 2 ** 31;
const RECOMMENDATION_DATA_KINDS = ["sessions", "matches"] as const;

const createSeed = () => Math.floor(Math.random() * SEED_RANGE);

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

export interface SessionRecommendationsState {
  recommendation: MatchSessionRecommendationResponse | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** 새 seed로 다시 추천한다 */
  recommendAgain: () => void;
  /** 같은 seed로 다시 받는다(당겨서 새로고침) */
  reload: () => Promise<void>;
}

/**
 * 진행 중 세션의 복식 추천. sessionId가 null이면 받지 않는다.
 * 코트 수는 API 기본값이고, 내 세션·경기 변경(경기 시작·참여자 변경) 무효화에만 같은 seed로 다시 받는다.
 * 추천이 바뀌면 보던 매칭이 흔들리므로 TTL·남의 변경으로는 다시 받지 않는다(localOnly).
 * 예외로 추천 코트의 선수가 진행 중 경기(useLiveSession().inProgressMatches)에 들어가거나 세션 참여자에서 빠지면
 * 같은 seed로 다시 받는다.
 */
export const useSessionRecommendations = (
  sessionId: string | null,
): SessionRecommendationsState => {
  const dataVersion = useDataVersion(RECOMMENDATION_DATA_KINDS, {
    localOnly: true,
  });
  const [seed, setSeed] = useState(createSeed);
  const [recommendation, setRecommendation] =
    useState<MatchSessionRecommendationResponse | null>(null);
  const [status, setStatus] =
    useState<SessionRecommendationsState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadedSessionIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const { liveSession, inProgressMatches } = useLiveSession();

  const load = useCallback(async () => {
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
        seed,
      );
      if (requestIdRef.current !== requestId) return;
      isLoadingRef.current = false;
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
  }, [seed, sessionId]);

  useEffect(() => {
    void load();
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
    void load();
  }, [load, recommendation, staleKey]);

  const recommendAgain = useCallback(() => {
    setStatus("loading");
    setRecommendation(null);
    setSeed(createSeed());
  }, []);

  return { recommendation, status, error, recommendAgain, reload: load };
};
