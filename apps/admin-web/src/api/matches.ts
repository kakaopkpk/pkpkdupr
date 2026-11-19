import type {
  AdminBatchMatchRequest,
  AdminBatchMatchResponse,
  AdminMatchDeletionLog,
  AdminMatchDeletionLogsResponse,
  AdminMatchEditLog,
  AdminMatchEditLogsResponse,
  Match,
  RecordedMatchResponse,
  RecordMatchRequest,
} from "@pkpkdupr/shared/match";
import { apiJson } from "./client";

const matchPath = (matchId: string) => encodeURIComponent(matchId);

/** 전체 경기 */
export const fetchAdminMatches = () => apiJson<Match[]>("/api/admin/matches");

/** 관리자는 body에 sessionId·matchStartsAt을 담을 수 있다. */
export const updateMatch = (matchId: string, body: RecordMatchRequest) =>
  apiJson<RecordedMatchResponse>(`/api/matches/${matchPath(matchId)}`, {
    method: "PUT",
    body,
  });

/** 응답 본문(평점 재계산 요약)은 버린다. */
export const deleteMatchAsAdmin = async (matchId: string): Promise<void> => {
  await apiJson<unknown>(`/api/admin/matches/${matchPath(matchId)}`, {
    method: "DELETE",
  });
};

export const fetchMatchDeletionLogs = async (): Promise<
  AdminMatchDeletionLog[]
> => {
  const data = await apiJson<AdminMatchDeletionLogsResponse>(
    "/api/admin/match-deletion-logs",
  );
  return data.logs;
};

export const fetchMatchEditLogs = async (): Promise<AdminMatchEditLog[]> => {
  const data = await apiJson<AdminMatchEditLogsResponse>(
    "/api/admin/match-edit-logs",
  );
  return data.logs;
};

export const linkMatchesToSession = async (
  matchIds: string[],
  sessionId: string,
): Promise<Match[]> => {
  const data = await apiJson<{ matches: Match[] }>(
    "/api/admin/matches/bulk-metadata",
    { method: "PATCH", body: { matchIds, sessionId } },
  );
  return data.matches;
};

export const createAdminMatches = (body: AdminBatchMatchRequest) =>
  apiJson<AdminBatchMatchResponse>("/api/admin/matches/batch", {
    method: "POST",
    body,
  });
