import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getEmptySessionExpiresAt,
  getNextRegularSessionDateKey,
  kstDateKeyToDate,
  REGULAR_SESSION_START_HOUR,
  toKstDateKey,
} from "@pkpkdupr/shared/session";
import type { MatchInfo } from "@/types/match";
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 진행 중 세션이 바뀔 수 있는 다음 시각. 오늘 세션들의 시작·만료 시각, 오늘 정기 회차 시작(18:00),
 * 다음 날 KST 0시 중 now보다 늦은 가장 이른 시각이다.
 * 0시를 넣어 날짜가 바뀌면 새 날의 오늘 세션을 다시 읽고 그날 경계를 다시 잡는다.
 */
export const getNextLiveSessionBoundary = (
  sessions: MatchSessionDetailInfo[],
  now: Date = new Date(),
): Date => {
  const todayKey = toKstDateKey(now);
  const candidates = sessions.flatMap((session) => {
    const startsAt = new Date(session.date);
    return [startsAt, getEmptySessionExpiresAt(session.kind, startsAt)];
  });
  candidates.push(new Date(kstDateKeyToDate(todayKey).getTime() + DAY_MS));

  // 정기 회차는 다가오는 세션 조회 때 서버가 만들어서, 오늘 세션 응답에 아직 없을 수 있다
  if (getNextRegularSessionDateKey(now) === todayKey) {
    candidates.push(kstDateKeyToDate(todayKey, REGULAR_SESSION_START_HOUR));
  }

  return new Date(
    Math.min(
      ...candidates
        .map((date) => date.getTime())
        .filter((time) => time > now.getTime()),
    ),
  );
};

// 경계 시각을 확실히 넘긴 뒤 다시 고르도록 조금 늦게 다시 읽는다
const BOUNDARY_RELOAD_DELAY_MS = 1_000;
// 경계 시각 재조회가 실패하면 이만큼 뒤 한 번 더 읽는다
const BOUNDARY_RETRY_DELAY_MS = 30_000;

const fetchSessionMatches = async (sessionId: string) => {
  const res = await apiFetch(
    `/api/match-sessions/${encodeURIComponent(sessionId)}/matches`,
  );
  if (!res.ok) throw new Error("세션 경기를 불러오지 못했어요.");
  return (await res.json()) as MatchInfo[];
};

/**
 * 셸이 진행 중 세션 상태를 만든다. 첫 로드, 앱이 다시 보일 때, 다음 세션 시작·만료 시각에 스스로 다시 읽고,
 * 그 밖의 갱신(데이터 변경·당겨서 새로고침)은 셸이 reload를 부른다. 주기 폴링은 하지 않는다.
 */
export const useLiveSessionState = (
  playerId: string | undefined,
): LiveSessionState => {
  const [status, setStatus] = useState<LiveSessionState["status"]>("loading");
  const [liveSession, setLiveSession] =
    useState<MatchSessionDetailInfo | null>(null);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  /** 마지막으로 받은 오늘 세션. 다음 경계 시각 계산용 */
  const [todaySessions, setTodaySessions] = useState<MatchSessionDetailInfo[]>(
    [],
  );
  const requestIdRef = useRef(0);

  /** 다시 읽는다. 받기에 실패하면 false, 성공했거나 더 최근 요청에 밀렸으면 true */
  const load = useCallback(async (): Promise<boolean> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!playerId) {
      setLiveSession(null);
      setMatches([]);
      setTodaySessions([]);
      setStatus("ready");
      return true;
    }

    try {
      const today = await fetchTodayMatchSessions();
      const nextLiveSession = pickLiveSession(today.sessions);
      const nextMatches = nextLiveSession
        ? await fetchSessionMatches(nextLiveSession.id)
        : [];
      if (requestIdRef.current !== requestId) return true;

      setLiveSession(nextLiveSession);
      setMatches(nextMatches);
      setTodaySessions(today.sessions);
      setStatus("ready");
      return true;
    } catch {
      if (requestIdRef.current !== requestId) return true;
      // 이전에 받은 세션은 그대로 두고 상태만 오류로 바꾼다
      setStatus("error");
      return false;
    }
  }, [playerId]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

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

  // 다음 경계 시각 하나만 예약한다. 다시 읽으면 todaySessions가 바뀌어 그다음 경계를 다시 예약한다.
  // 경계 재조회가 실패하면 한 번만 더 시도한다(그래도 실패하면 화면 복귀·데이터 변경 때 맞춰진다)
  useEffect(() => {
    if (!playerId) return;
    const boundary = getNextLiveSessionBoundary(todaySessions);
    let isCancelled = false;
    let retryTimeoutId: number | undefined;

    const timeoutId = window.setTimeout(async () => {
      const ok = await load();
      if (ok || isCancelled) return;
      retryTimeoutId = window.setTimeout(
        () => void load(),
        BOUNDARY_RETRY_DELAY_MS,
      );
    }, boundary.getTime() - Date.now() + BOUNDARY_RELOAD_DELAY_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
      window.clearTimeout(retryTimeoutId);
    };
  }, [load, playerId, todaySessions]);

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
