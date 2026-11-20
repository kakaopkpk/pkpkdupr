import { useCallback, useEffect, useRef, useState } from "react";
import { getMatchRecordedAt } from "@pkpkdupr/shared/match";
import type { MatchInfo } from "@/types/match";
import { getUserErrorMessage } from "@/lib/errors";
import {
  fetchUpcomingMatchSessions,
  type UpcomingMatchSessionsInfo,
} from "@/lib/matchSessions";

export interface PreSessionData {
  upcoming: UpcomingMatchSessionsInfo;
}

/** 기록 시각(완료 경기는 점수 입력 시각) 최신순 정렬 비교 함수 */
export const byLatestRecorded = (a: MatchInfo, b: MatchInfo) =>
  new Date(getMatchRecordedAt(b)).getTime() -
  new Date(getMatchRecordedAt(a)).getTime();

const loadPreSessionData = async (): Promise<PreSessionData> => ({
  upcoming: await fetchUpcomingMatchSessions(),
});

export interface PreSessionState {
  data: PreSessionData | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  /** 마지막으로 끝난 로드가 시작될 때의 dataVersion. 참여 변경 뒤 새 데이터 도착을 판단한다 */
  loadedVersion: number;
  reload: () => Promise<void>;
}

/**
 * 진행 중 세션이 없을 때의 홈 다음 세션 데이터. 소식 피드는 useNewsFeed가 따로 받는다.
 * enabled일 때만 받고, dataVersion이나 오늘 날짜 키(KST)가 바뀌면 보이는 내용을 둔 채 다시 받는다.
 * 날짜 키가 바뀌면 서버가 고르는 다음 세션도 달라지므로 앱을 켜 둔 채 자정을 넘기면 한 번 다시 받는다.
 */
export const usePreSessionData = ({
  enabled,
  dataVersion,
  todayKey,
}: {
  enabled: boolean;
  dataVersion: number;
  todayKey: string;
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
      setError(getUserErrorMessage(err, "다가오는 세션을 불러오지 못했어요"));
      setStatus("error");
    } finally {
      if (requestIdRef.current === requestId) setLoadedVersion(version);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [dataVersion, enabled, load, todayKey]);

  return { data, status, error, loadedVersion, reload: load };
};
