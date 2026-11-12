import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getEmptySessionExpiresAt } from "@pkpkdupr/shared/session";
import type { MatchInfo } from "@/components/Match";
import { apiFetch } from "@/lib/api";
import {
  fetchTodayMatchSessions,
  isSessionParticipant,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";

export interface LiveSessionState {
  status: "loading" | "ready" | "error";
  /**
   * 진행 중 세션. GET /api/match-sessions/today의 세션 중
   * date ≤ 지금 < getEmptySessionExpiresAt(kind, date)인 첫 세션(정기 우선). 없으면 null
   */
  liveSession: MatchSessionDetailInfo | null;
  isParticipant: boolean;
  /** liveSession의 모든 경기(GET /api/match-sessions/:id/matches) */
  matches: MatchInfo[];
  /** matches 중 status "created" */
  inProgressMatches: MatchInfo[];
  /** inProgressMatches 중 내가 든 경기 */
  myInProgressMatch: MatchInfo | null;
  reload: () => Promise<void>;
}

const LiveSessionContext = createContext<LiveSessionState | null>(null);

export const pickLiveSession = (
  sessions: MatchSessionDetailInfo[],
  now: Date = new Date(),
): MatchSessionDetailInfo | null => {
  const liveSessions = sessions.filter((session) => {
    const startsAt = new Date(session.date);
    return (
      startsAt.getTime() <= now.getTime() &&
      now.getTime() < getEmptySessionExpiresAt(session.kind, startsAt).getTime()
    );
  });

  return (
    liveSessions.find((session) => session.kind === "regular") ??
    liveSessions[0] ??
    null
  );
};

const fetchSessionMatches = async (sessionId: string) => {
  const res = await apiFetch(
    `/api/match-sessions/${encodeURIComponent(sessionId)}/matches`,
  );
  if (!res.ok) throw new Error("세션 경기를 불러오지 못했어요.");
  return (await res.json()) as MatchInfo[];
};

/**
 * 셸이 진행 중 세션 상태를 만든다. 첫 로드와 앱이 다시 보일 때 스스로 다시 읽고,
 * 그 밖의 갱신(데이터 변경·당겨서 새로고침)은 셸이 reload를 부른다. 주기 폴링은 하지 않는다.
 */
export const useLiveSessionState = (
  playerId: string | undefined,
): LiveSessionState => {
  const [status, setStatus] = useState<LiveSessionState["status"]>("loading");
  const [liveSession, setLiveSession] =
    useState<MatchSessionDetailInfo | null>(null);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!playerId) {
      setLiveSession(null);
      setMatches([]);
      setStatus("ready");
      return;
    }

    try {
      const today = await fetchTodayMatchSessions();
      const nextLiveSession = pickLiveSession(today.sessions);
      const nextMatches = nextLiveSession
        ? await fetchSessionMatches(nextLiveSession.id)
        : [];
      if (requestIdRef.current !== requestId) return;

      setLiveSession(nextLiveSession);
      setMatches(nextMatches);
      setStatus("ready");
    } catch {
      if (requestIdRef.current !== requestId) return;
      // 이전에 받은 세션은 그대로 두고 상태만 오류로 바꾼다
      setStatus("error");
    }
  }, [playerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void reload();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reload]);

  return useMemo(() => {
    const inProgressMatches = matches.filter(
      (match) => match.status === "created",
    );
    const myInProgressMatch = playerId
      ? (inProgressMatches.find((match) =>
          match.teams.some((team) =>
            team.players.some((teamPlayer) => teamPlayer.id === playerId),
          ),
        ) ?? null)
      : null;

    return {
      status,
      liveSession,
      isParticipant: !!liveSession && isSessionParticipant(liveSession, playerId),
      matches,
      inProgressMatches,
      myInProgressMatch,
      reload,
    };
  }, [liveSession, matches, playerId, reload, status]);
};

export const LiveSessionProvider: React.FC<{
  value: LiveSessionState;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <LiveSessionContext.Provider value={value}>
    {children}
  </LiveSessionContext.Provider>
);

export const useLiveSession = (): LiveSessionState => {
  const context = useContext(LiveSessionContext);

  if (!context) {
    throw new Error("useLiveSession must be used within LiveSessionProvider");
  }

  return context;
};
