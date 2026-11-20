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
  canOpenRegularSession,
  getEmptySessionExpiresAt,
  getRegularSessionEndAt,
  getSessionEndsAt,
  isSessionCompletable,
  kstDateKeyTimeToDate,
  kstDateKeyToDate,
  REGULAR_SESSION_START_HOUR,
  toKstDateKey,
} from "@pkpkdupr/shared/session";
import type { MatchInfo } from "@/types/match";
import { apiFetch } from "@/lib/api";
import { fetchInProgressMatches } from "@/lib/matches";
import {
  fetchTodayMatchSessions,
  isSessionParticipant,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";

export interface LiveSessionState {
  status: "loading" | "ready" | "error";
  /**
   * 진행 중 세션. GET /api/match-sessions/today의 세션 중
   * getLiveSessionStartsAt ≤ 지금 < getSessionEndsAt인 첫 세션(정기 우선). 없으면 null
   */
  liveSession: MatchSessionDetailInfo | null;
  /**
   * 경기 기록 시트가 새 경기를 붙이는 세션. liveSession이 있으면 그 세션이고, 없으면 끝을 빈 세션 만료 시각으로 잡아
   * 종료 시각이 지난 회원·대회 세션도 그날 자정까지 기록이 그 세션에 붙는다
   */
  recordingSession: MatchSessionDetailInfo | null;
  /**
   * 지금 회원이 완료할 수 있는 오늘 정기 세션(`isSessionCompletable`, 종료 21:00 ≤ 지금 < 자동 완료 22:00, 완료 전). 없으면 null.
   * 셸이 이 세션으로 하단 세션 완료 바를 띄운다
   */
  completableSession: MatchSessionDetailInfo | null;
  isParticipant: boolean;
  /** liveSession의 모든 경기(GET /api/match-sessions/:id/matches) */
  matches: MatchInfo[];
  /** 세션과 상관없는 모든 진행 중 경기(GET /api/matches/in-progress) */
  inProgressMatches: MatchInfo[];
  /** inProgressMatches 중 내가 든 경기. 세션 밖 경기일 수 있다 */
  myInProgressMatch: MatchInfo | null;
  reload: () => Promise<void>;
}

const LiveSessionContext = createContext<LiveSessionState | null>(null);

/**
 * 세션이 LIVE가 되는 시각. 대회 세션은 시작 시각(startTime이 있으면 그날 그 시각, 없으면 date)이고,
 * 정기·회원 세션은 세션 시각(date)이다
 */
export const getLiveSessionStartsAt = (
  session: Pick<MatchSessionDetailInfo, "kind" | "date" | "startTime">,
): Date => {
  const sessionDate = new Date(session.date);
  if (session.kind !== "tournament" || !session.startTime) return sessionDate;
  return kstDateKeyTimeToDate(toKstDateKey(sessionDate), session.startTime);
};

/** 시작 시각 ≤ now < getEndsAt인 첫 세션(정기 우선) */
const pickSessionBetween = (
  sessions: MatchSessionDetailInfo[],
  now: Date,
  getEndsAt: typeof getSessionEndsAt,
): MatchSessionDetailInfo | null => {
  const candidates = sessions.filter(
    (session) =>
      getLiveSessionStartsAt(session).getTime() <= now.getTime() &&
      now.getTime() <
        getEndsAt(session.kind, new Date(session.date), session).getTime(),
  );

  return (
    candidates.find((session) => session.kind === "regular") ??
    candidates[0] ??
    null
  );
};

export const pickLiveSession = (
  sessions: MatchSessionDetailInfo[],
  now: Date = new Date(),
): MatchSessionDetailInfo | null =>
  pickSessionBetween(sessions, now, getSessionEndsAt);

/** 진행 중 세션이 있으면 그 세션, 없으면 종료 시각이 지났어도 만료 전인 세션 */
export const pickRecordingSession = (
  sessions: MatchSessionDetailInfo[],
  now: Date = new Date(),
): MatchSessionDetailInfo | null =>
  pickLiveSession(sessions, now) ??
  pickSessionBetween(sessions, now, getEmptySessionExpiresAt);

/** 지금 완료할 수 있는 첫 세션 */
export const pickCompletableSession = (
  sessions: MatchSessionDetailInfo[],
  now: Date = new Date(),
): MatchSessionDetailInfo | null =>
  sessions.find((session) =>
    isSessionCompletable({ ...session, date: new Date(session.date) }, now),
  ) ?? null;

/**
 * 진행 중·기록·완료 가능 세션이 바뀔 수 있는 다음 시각. 오늘 세션들의 시작·종료·만료 시각과 정기 세션 종료 시각(21:00),
 * 오늘 정기 회차 시작(18:00),
 * 다음 날 KST 0시 중 now보다 늦은 가장 이른 시각이다.
 * 0시를 넣어 날짜가 바뀌면 새 날의 오늘 세션을 다시 읽고 그날 경계를 다시 잡는다.
 */
export const getNextLiveSessionBoundary = (
  sessions: MatchSessionDetailInfo[],
  now: Date = new Date(),
): Date => {
  const todayKey = toKstDateKey(now);
  const candidates = sessions.flatMap((session) => {
    const sessionDate = new Date(session.date);
    return [
      getLiveSessionStartsAt(session),
      getSessionEndsAt(session.kind, sessionDate, session),
      getEmptySessionExpiresAt(session.kind, sessionDate, session),
      // 정기 세션은 종료 시각부터 완료할 수 있다
      ...(session.kind === "regular" ? [getRegularSessionEndAt(sessionDate)] : []),
    ];
  });
  // 24시는 다음 날 0시다
  candidates.push(kstDateKeyToDate(todayKey, 24));

  // 정기 회차는 다가오는 세션 조회(홈 세션 전 화면) 때 서버가 만들어서, 오늘 세션 응답에 아직 없을 수 있다
  if (canOpenRegularSession(now)) {
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
// 경계 시각 재조회가 실패했을 때 한 번 더 읽는 시점(첫 재조회 뒤)
const BOUNDARY_RETRY_DELAY_MS = 30_000;

const fetchSessionMatches = async (sessionId: string) => {
  const res = await apiFetch(
    `/api/match-sessions/${encodeURIComponent(sessionId)}/matches`,
  );
  if (!res.ok) throw new Error("세션 경기를 불러오지 못했어요.");
  return (await res.json()) as MatchInfo[];
};

/**
 * 셸이 진행 중 세션 상태를 만든다. 첫 로드, 앱이 다시 보일 때, 다음 세션 시작·종료·만료 시각에 스스로 다시 읽고,
 * 그 밖의 갱신(데이터 변경·당겨서 새로고침)은 셸이 reload를 부른다. 주기 폴링은 하지 않는다.
 */
export const useLiveSessionState = (
  playerId: string | undefined,
): LiveSessionState => {
  const [status, setStatus] = useState<LiveSessionState["status"]>("loading");
  const [liveSession, setLiveSession] =
    useState<MatchSessionDetailInfo | null>(null);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [inProgressMatches, setInProgressMatches] = useState<MatchInfo[]>([]);
  /** 마지막으로 받은 오늘 세션. 다음 경계 시각 계산용 */
  const [todaySessions, setTodaySessions] = useState<MatchSessionDetailInfo[]>(
    [],
  );
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!playerId) {
      setLiveSession(null);
      setMatches([]);
      setInProgressMatches([]);
      setTodaySessions([]);
      setStatus("ready");
      return;
    }

    // 진행 중 경기 조회가 실패해도 세션은 반영하고, 진행 중 경기는 이전 값을 둔다
    const inProgressRequest = fetchInProgressMatches().catch(() => null);
    try {
      const today = await fetchTodayMatchSessions();
      const nextLiveSession = pickLiveSession(today.sessions);
      // 세션 경기와 진행 중 경기를 같은 때 받아 둘의 시점 차이를 줄인다
      const [nextMatches, nextInProgressMatches] = await Promise.all([
        nextLiveSession ? fetchSessionMatches(nextLiveSession.id) : [],
        inProgressRequest,
      ]);
      if (requestIdRef.current !== requestId) return;

      setLiveSession(nextLiveSession);
      setMatches(nextMatches);
      if (nextInProgressMatches) setInProgressMatches(nextInProgressMatches);
      setTodaySessions(today.sessions);
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

  // 다음 경계 시각 하나만 예약한다. 다시 읽기에 성공하면 todaySessions가 새 배열로 바뀌어
  // 재시도 타이머를 지우고 그다음 경계를 예약한다. 실패하면 재시도 타이머가 한 번 더 읽는다.
  // 숨은 상태면 건너뛴다(다시 보일 때 visibilitychange가 읽는다)
  useEffect(() => {
    if (!playerId) return;
    const boundary = getNextLiveSessionBoundary(todaySessions);
    const delay = boundary.getTime() - Date.now() + BOUNDARY_RELOAD_DELAY_MS;
    const reloadIfVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };

    const timeoutId = window.setTimeout(reloadIfVisible, delay);
    const retryTimeoutId = window.setTimeout(
      reloadIfVisible,
      delay + BOUNDARY_RETRY_DELAY_MS,
    );
    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(retryTimeoutId);
    };
  }, [playerId, reload, todaySessions]);

  return useMemo(() => {
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
      recordingSession: liveSession ?? pickRecordingSession(todaySessions),
      // todaySessions는 완료 가능 구간의 시작(21:00)·끝(22:00) 경계마다 다시 받아 새 배열이 된다
      completableSession: pickCompletableSession(todaySessions),
      isParticipant: !!liveSession && isSessionParticipant(liveSession, playerId),
      matches,
      inProgressMatches,
      myInProgressMatch,
      reload,
    };
  }, [
    inProgressMatches,
    liveSession,
    matches,
    playerId,
    reload,
    status,
    todaySessions,
  ]);
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
