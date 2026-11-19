import type {
  AdminCreateBracketMatchRequest,
  ManagedMatchSession,
  Match,
} from "@pkpkdupr/shared/match";
import type { MatchSessionReport } from "@pkpkdupr/shared/ranking";
import type {
  AdminAddRegularSessionSkipRequest,
  AdminCreateMatchSessionRequest,
  AdminRegularSessionSkip,
  AdminRegularSessionSkipsResponse,
  AdminRevertRegularSessionSkipResponse,
  AdminUpdateMatchSessionRequest,
  MatchSessionDetail,
  TodayMatchSessionsResponse,
  UpcomingMatchSessionsResponse,
} from "@pkpkdupr/shared/session";
import type { AdminUpdateTournamentPlacementsRequest } from "@pkpkdupr/shared/tournament";
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

export const createSession = (body: AdminCreateMatchSessionRequest) =>
  apiJson<ManagedMatchSession>("/api/admin/match-sessions", {
    method: "POST",
    body,
  });

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

/** 세션 경기(대진 예정 경기 포함) */
export const fetchSessionMatches = (sessionId: string) =>
  apiJson<Match[]>(`/api/match-sessions/${sessionPath(sessionId)}/matches`);

/** 대회 세션에 점수 없는 대진 예정 경기 하나를 만든다 */
export const createBracketMatch = (
  sessionId: string,
  body: AdminCreateBracketMatchRequest,
) =>
  apiJson<Match>(
    `/api/admin/match-sessions/${sessionPath(sessionId)}/bracket-matches`,
    { method: "POST", body },
  );

/** 대회 최종 순위를 통째로 바꾼다 */
export const updateTournamentPlacements = (
  sessionId: string,
  body: AdminUpdateTournamentPlacementsRequest,
) =>
  apiJson<MatchSessionDetail>(
    `/api/admin/match-sessions/${sessionPath(sessionId)}/placements`,
    { method: "PUT", body },
  );

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
