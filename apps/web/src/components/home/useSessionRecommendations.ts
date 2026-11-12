import { useCallback, useEffect, useRef, useState } from "react";
import {
  MATCHMAKING_DEFAULT_COURTS,
  type MatchSessionRecommendationResponse,
} from "@pkpkdupr/shared/matchmaking";
import { fetchSessionRecommendations } from "@/lib/matchSessions";

const SEED_RANGE = 2 ** 31;

const createSeed = () => Math.floor(Math.random() * SEED_RANGE);

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
 * 코트 수는 API 기본값이고, dataVersion이 바뀌면(경기 시작·참여자 변경) 같은 seed로 다시 받는다.
 */
export const useSessionRecommendations = (
  sessionId: string | null,
  dataVersion: number,
): SessionRecommendationsState => {
  const [seed, setSeed] = useState(createSeed);
  const [recommendation, setRecommendation] =
    useState<MatchSessionRecommendationResponse | null>(null);
  const [status, setStatus] =
    useState<SessionRecommendationsState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadedSessionIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
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
        seed,
      );
      if (requestIdRef.current !== requestId) return;
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
  }, [seed, sessionId]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const recommendAgain = useCallback(() => {
    setStatus("loading");
    setRecommendation(null);
    setSeed(createSeed());
  }, []);

  return { recommendation, status, error, recommendAgain, reload: load };
};
