import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import type { MatchInfo } from "@/types/match";
import { apiFetch } from "@/lib/api";
import {
  fetchUpcomingMatchSessions,
  type MatchSessionDetailInfo,
  type UpcomingMatchSessionsInfo,
} from "@/lib/matchSessions";
import { fetchPlayerMatches } from "@/lib/playerProfile";
import {
  fetchSessionHistory,
  fetchSessionReport,
  type MatchSessionHistoryInfo,
} from "@/lib/rankings";

const RECENT_MATCH_COUNT = 3;
// 진행 중 경기가 섞여 있어도 완료 경기 3개를 채우도록 넉넉히 받는다
const RECENT_MATCH_FETCH_LIMIT = 10;

export interface LastSessionMe {
  session: MatchSessionHistoryInfo;
  report: SessionPlayerReport;
}

export interface LastSessionMatches {
  session: MatchSessionHistoryInfo;
  matches: MatchInfo[];
}

export interface PreSessionData {
  upcoming: UpcomingMatchSessionsInfo;
  /** 오늘 세션 전: 내가 뛴 마지막 세션의 내 리포트. 없으면 null */
  lastSessionMe: LastSessionMe | null;
  /** 오늘 세션 전: 내 최근 완료 경기 */
  recentMatches: MatchInfo[];
  /** 미래 세션만 있는 날: 마지막 세션과 그 완료 경기(최신순) */
  lastSession: LastSessionMatches | null;
}

/** 시작 시각 최신순 정렬 비교 함수 */
export const byLatestStart = (a: MatchInfo, b: MatchInfo) =>
  new Date(b.matchStartsAt).getTime() - new Date(a.matchStartsAt).getTime();

const takeRecentCompleted = (matches: MatchInfo[]) =>
  matches
    .filter((match) => match.status === "completed")
    .sort(byLatestStart)
    .slice(0, RECENT_MATCH_COUNT);

const fetchSessionMatches = async (sessionId: string) => {
  const res = await apiFetch(
    `/api/match-sessions/${encodeURIComponent(sessionId)}/matches`,
  );
  if (!res.ok) throw new Error("세션 경기를 불러오지 못했어요.");
  return (await res.json()) as MatchInfo[];
};

const loadLastSessionMe = async (
  playerId: string,
): Promise<LastSessionMe | null> => {
  const [session] = await fetchSessionHistory({ playerId, limit: 1 });
  if (!session) return null;
  const report = await fetchSessionReport(session.id);
  const myReport = report.players.find((entry) => entry.player.id === playerId);
  return myReport ? { session, report: myReport } : null;
};

const loadRecentMatches = async (playerId: string) => {
  const { matches } = await fetchPlayerMatches({
    playerId,
    limit: RECENT_MATCH_FETCH_LIMIT,
  });
  return takeRecentCompleted(matches);
};

const loadLastSession = async (): Promise<LastSessionMatches | null> => {
  const [session] = await fetchSessionHistory({ limit: 1 });
  if (!session) return null;
  const matches = await fetchSessionMatches(session.id);
  return { session, matches: takeRecentCompleted(matches) };
};

/** 보조 섹션은 실패해도 화면 전체를 오류로 만들지 않고 숨긴다 */
const orFallback = <T>(promise: Promise<T>, fallback: T) =>
  promise.catch(() => fallback);

const loadPreSessionData = async (
  playerId: string | undefined,
): Promise<PreSessionData> => {
  const upcoming = await fetchUpcomingMatchSessions();
  const nextSession: MatchSessionDetailInfo | undefined = upcoming.sessions[0];

  if (nextSession?.isToday) {
    const [lastSessionMe, recentMatches] = await Promise.all([
      playerId
        ? orFallback(loadLastSessionMe(playerId), null)
        : Promise.resolve(null),
      playerId
        ? orFallback(loadRecentMatches(playerId), [] as MatchInfo[])
        : Promise.resolve([] as MatchInfo[]),
    ]);
    return { upcoming, lastSessionMe, recentMatches, lastSession: null };
  }

  const lastSession = await orFallback(loadLastSession(), null);
  return { upcoming, lastSessionMe: null, recentMatches: [], lastSession };
};

export interface PreSessionState {
  data: PreSessionData | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  /** 마지막으로 끝난 로드가 시작될 때의 dataVersion. 참여 변경 뒤 새 데이터 도착을 판단한다 */
  loadedVersion: number;
  reload: () => Promise<void>;
}

/**
 * 진행 중 세션이 없을 때의 홈 데이터(다음 세션·지난 세션).
 * enabled일 때만 받고, dataVersion이 바뀌면 보이는 내용을 둔 채 다시 받는다.
 */
export const usePreSessionData = ({
  enabled,
  playerId,
  dataVersion,
}: {
  enabled: boolean;
  playerId: string | undefined;
  dataVersion: number;
}): PreSessionState => {
  const [data, setData] = useState<PreSessionData | null>(null);
  const [status, setStatus] = useState<PreSessionState["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [loadedVersion, setLoadedVersion] = useState(-1);
  const requestIdRef = useRef(0);
  const dataVersionRef = useRef(dataVersion);
  dataVersionRef.current = dataVersion;

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const version = dataVersionRef.current;
    try {
      const nextData = await loadPreSessionData(playerId);
      if (requestIdRef.current !== requestId) return;
      setData(nextData);
      setStatus("ready");
      setError(null);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(
        err instanceof Error && err.message
          ? err.message
          : "다가오는 세션을 불러오지 못했어요.",
      );
      setStatus("error");
    } finally {
      if (requestIdRef.current === requestId) setLoadedVersion(version);
    }
  }, [playerId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [dataVersion, enabled, load]);

  return { data, status, error, loadedVersion, reload: load };
};
