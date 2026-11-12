import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type {
  MatchSessionHistoryItem,
  MatchSessionHistoryResponse,
  MatchSessionReport,
  RankingResponse,
} from "@pkpkdupr/shared/ranking";
import { apiFetch } from "@/lib/api";

/** JSON 응답 형태(날짜는 문자열) */
export type MatchSessionHistoryInfo = Omit<MatchSessionHistoryItem, "date"> & {
  date: string;
};

export type MatchSessionReportInfo = Omit<MatchSessionReport, "session"> & {
  session: MatchSessionHistoryInfo;
};

const requestJson = async <T>(
  path: string,
  fallbackMessage: string,
): Promise<T> => {
  const res = await apiFetch(path);
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorData.error || fallbackMessage);
  }

  return (await res.json()) as T;
};

export const fetchRankings = (category: MatchTopLevelType) =>
  requestJson<RankingResponse>(
    `/api/rankings?category=${encodeURIComponent(category)}`,
    "랭킹을 불러오지 못했어요.",
  );

export const fetchSessionHistory = async (
  options: { limit?: number; playerId?: string } = {},
): Promise<MatchSessionHistoryInfo[]> => {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.playerId) params.set("playerId", options.playerId);
  const query = params.toString();
  const response = await requestJson<
    Omit<MatchSessionHistoryResponse, "sessions"> & {
      sessions: MatchSessionHistoryInfo[];
    }
  >(
    `/api/session-reports${query ? `?${query}` : ""}`,
    "세션 기록을 불러오지 못했어요.",
  );
  return response.sessions;
};

export const fetchSessionReport = (sessionId: string) =>
  requestJson<MatchSessionReportInfo>(
    `/api/session-reports/${encodeURIComponent(sessionId)}`,
    "세션 리포트를 불러오지 못했어요.",
  );
