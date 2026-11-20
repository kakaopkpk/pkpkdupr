import { useCallback, useEffect, useRef, useState } from "react";
import {
  MATCHMAKING_DEFAULT_COURTS,
  type MatchSessionRecommendationResponse,
} from "@pkpkdupr/shared/matchmaking";
import { fetchSessionRecommendations } from "@/lib/matchSessions";

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
 * 코트 수는 API 기본값이고, 세션이나 dataVersion이 바뀌면(경기 시작·참여자 변경) 1등부터 다시 받는다.
 */
export const useSessionRecommendations = (
  sessionId: string | null,
  dataVersion: number,
): SessionRecommendationsState => {
  const [recommendation, setRecommendation] =
    useState<MatchSessionRecommendationResponse | null>(null);
  const [status, setStatus] =
    useState<SessionRecommendationsState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadedSessionIdRef = useRef<string | null>(null);
  /**
   * 마지막으로 받은 후보 순번. 다시 추천은 이 다음 순번을 요청하므로,
   * 받는 중에 또 누르거나 요청이 실패해도 순번이 건너뛰지 않는다(늦은 응답은 requestId로 버린다).
   */
  const shownRankRef = useRef(0);

  const load = useCallback(
    async (rank: number) => {
      const requestId = ++requestIdRef.current;
      if (!sessionId) {
        loadedSessionIdRef.current = null;
        setRecommendation(null);
        setStatus("idle");
        setError(null);
        return;
      }

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
        shownRankRef.current = data.rank;
        setRecommendation(data);
        setStatus("ready");
        setError(null);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
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

  const recommendAgain = useCallback(() => {
    setStatus("loading");
    setRecommendation(null);
    void load(shownRankRef.current + 1);
  }, [load]);

  const reload = useCallback(() => load(shownRankRef.current), [load]);

  return { recommendation, status, error, recommendAgain, reload };
};
