import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchInfo } from "@/types/match";
import {
  fetchUpcomingMatchSessions,
  type UpcomingMatchSessionsInfo,
} from "@/lib/matchSessions";
import {
  fetchSessionHistory,
  fetchSessionReport,
  type MatchSessionReportInfo,
} from "@/lib/rankings";

export interface PreSessionData {
  upcoming: UpcomingMatchSessionsInfo;
  /** 완료 경기가 있는 가장 최근 세션의 리포트. 없거나 받지 못하면 null */
  lastSessionReport: MatchSessionReportInfo | null;
}

/** 시작 시각 최신순 정렬 비교 함수 */
export const byLatestStart = (a: MatchInfo, b: MatchInfo) =>
  new Date(b.matchStartsAt).getTime() - new Date(a.matchStartsAt).getTime();

const loadLastSessionReport =
  async (): Promise<MatchSessionReportInfo | null> => {
    const [session] = await fetchSessionHistory({ limit: 1 });
    return session ? fetchSessionReport(session.id) : null;
  };

const loadPreSessionData = async (): Promise<PreSessionData> => {
  const [upcoming, lastSessionReport] = await Promise.all([
    fetchUpcomingMatchSessions(),
    // 지난 세션 피드는 보조 섹션이라 실패해도 화면 전체를 오류로 만들지 않고 숨긴다
    loadLastSessionReport().catch(() => null),
  ]);
  return { upcoming, lastSessionReport };
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
  dataVersion,
}: {
  enabled: boolean;
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
      const nextData = await loadPreSessionData();
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
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [dataVersion, enabled, load]);

  return { data, status, error, loadedVersion, reload: load };
};
