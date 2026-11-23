import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type {
  AchievementRankingResponse,
  MatchSessionHistoryItem,
  MatchSessionReport,
  RankingCategory,
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

/** requestJson이 던지는 HTTP 오류. 메시지는 서버 오류 문구이고 status로 응답 코드를 구분한다. */
export class RequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

export const requestJson = async <T>(
  path: string,
  fallbackMessage: string,
  init?: RequestInit,
): Promise<T> => {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new RequestError(errorData.error || fallbackMessage, res.status);
  }

  return (await res.json()) as T;
};

/** 평점 분류면 평점 순위, achievements면 업적 점수 순위 */
export function fetchRankings(
  category: MatchTopLevelType,
): Promise<RankingResponse>;
export function fetchRankings(
  category: "achievements",
): Promise<AchievementRankingResponse>;
export function fetchRankings(
  category: RankingCategory,
): Promise<RankingResponse | AchievementRankingResponse>;
export function fetchRankings(category: RankingCategory) {
  return requestJson<RankingResponse | AchievementRankingResponse>(
    `/api/rankings?category=${encodeURIComponent(category)}`,
    "랭킹을 불러오지 못했어요.",
  );
}

/** 업적 점수 순위 */
export const fetchAchievementRanking = () => fetchRankings("achievements");

export const fetchSessionReport = (sessionId: string) =>
  requestJson<MatchSessionReportInfo>(
    `/api/session-reports/${encodeURIComponent(sessionId)}`,
    "세션 리포트를 불러오지 못했어요.",
  );
