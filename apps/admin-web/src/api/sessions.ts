import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import type { MatchSessionReport } from "@pkpkdupr/shared/ranking";
import type {
  AdminAddRegularSessionSkipRequest,
  AdminRegularSessionSkip,
  AdminRegularSessionSkipsResponse,
  AdminRevertRegularSessionSkipResponse,
  AdminUpdateMatchSessionRequest,
  CreateMatchSessionRequest,
  MatchSessionDetail,
  TodayMatchSessionsResponse,
  UpcomingMatchSessionsResponse,
} from "@pkpkdupr/shared/session";
import { apiJson } from "./client";

const sessionPath = (sessionId: string) => encodeURIComponent(sessionId);

export const fetchAdminSessions = () =>
  apiJson<ManagedMatchSession[]>("/api/admin/match-sessions");

export const fetchSessionDetail = (sessionId: string) =>
  apiJson<MatchSessionDetail>(`/api/match-sessions/${sessionPath(sessionId)}`);

export const fetchTodaySessions = () =>
  apiJson<TodayMatchSessionsResponse>("/api/match-sessions/today");

export const fetchUpcomingSessions = () =>
  apiJson<UpcomingMatchSessionsResponse>("/api/match-sessions/upcoming");

export const fetchSessionReport = (sessionId: string) =>
  apiJson<MatchSessionReport>(`/api/session-reports/${sessionPath(sessionId)}`);

export const createSession = (body: CreateMatchSessionRequest) =>
  apiJson<MatchSessionDetail>("/api/match-sessions", { method: "POST", body });

export const updateSession = (
  sessionId: string,
  body: AdminUpdateMatchSessionRequest,
) =>
  apiJson<ManagedMatchSession>(
    `/api/admin/match-sessions/${sessionPath(sessionId)}`,
    { method: "PATCH", body },
  );

export const deleteSessionAsAdmin = async (sessionId: string): Promise<void> => {
  await apiJson<void>(`/api/admin/match-sessions/${sessionPath(sessionId)}`, {
    method: "DELETE",
  });
};

export const addSessionParticipant = (sessionId: string, playerId: string) =>
  apiJson<MatchSessionDetail>(
    `/api/match-sessions/${sessionPath(sessionId)}/participants`,
    { method: "POST", body: { playerId } },
  );

export const removeSessionParticipant = (
  sessionId: string,
  playerId: string,
) =>
  apiJson<MatchSessionDetail>(
    `/api/match-sessions/${sessionPath(sessionId)}/participants/${encodeURIComponent(playerId)}`,
    { method: "DELETE" },
  );

/** 날짜 내림차순 */
export const fetchRegularSessionSkips = async (): Promise<
  AdminRegularSessionSkip[]
> => {
  const data = await apiJson<AdminRegularSessionSkipsResponse>(
    "/api/admin/regular-session-skips",
  );
  return data.skips;
};

export const addRegularSessionSkip = (dateKey: string) => {
  const body: AdminAddRegularSessionSkipRequest = { dateKey };
  return apiJson<AdminRegularSessionSkip>("/api/admin/regular-session-skips", {
    method: "POST",
    body,
  });
};

export const revertRegularSessionSkip = (dateKey: string) =>
  apiJson<AdminRevertRegularSessionSkipResponse>(
    `/api/admin/regular-session-skips/${encodeURIComponent(dateKey)}`,
    { method: "DELETE" },
  );
