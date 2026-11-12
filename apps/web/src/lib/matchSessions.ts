import type { MatchSessionRecommendationResponse } from "@pkpkdupr/shared/matchmaking";
import type {
  AddMatchSessionParticipantRequest,
  CreateMatchSessionRequest,
  MatchSessionDetail,
  StartSessionMatchRequest,
  TodayMatchSessionsResponse,
  UpcomingMatchSessionsResponse,
} from "@pkpkdupr/shared/session";
import { isRegularSessionTime } from "@pkpkdupr/shared/session";
import { apiFetch } from "@/lib/api";

/** JSON 응답 형태(날짜는 문자열) */
export type MatchSessionDetailInfo = Omit<MatchSessionDetail, "date"> & {
  date: string;
};

export type TodayMatchSessionsInfo = Omit<
  TodayMatchSessionsResponse,
  "sessions"
> & {
  sessions: MatchSessionDetailInfo[];
};

export type UpcomingMatchSessionsInfo = Omit<
  UpcomingMatchSessionsResponse,
  "sessions"
> & {
  sessions: MatchSessionDetailInfo[];
};

const requestJson = async <T>(
  path: string,
  fallbackMessage: string,
  init?: RequestInit,
): Promise<T> => {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorData.error || fallbackMessage);
  }

  return (await res.json().catch(() => null)) as T;
};

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const sessionPath = (sessionId: string) =>
  `/api/match-sessions/${encodeURIComponent(sessionId)}`;

export const fetchTodayMatchSessions = () =>
  requestJson<TodayMatchSessionsInfo>(
    "/api/match-sessions/today",
    "오늘 세션을 불러오지 못했어요.",
  );

/** 만료 전인 오늘·미래 세션. 조회할 때 서버가 다음 정기 회차를 미리 만든다 */
export const fetchUpcomingMatchSessions = () =>
  requestJson<UpcomingMatchSessionsInfo>(
    "/api/match-sessions/upcoming",
    "다가오는 세션을 불러오지 못했어요.",
  );

export const fetchMatchSession = (sessionId: string) =>
  requestJson<MatchSessionDetailInfo>(
    sessionPath(sessionId),
    "세션 정보를 불러오지 못했어요.",
  );

/** 오늘 정기 세션을 연다. 이미 있으면 서버가 기존 세션을 돌려준다 */
export const openTodayRegularSession = () =>
  requestJson<MatchSessionDetailInfo>(
    "/api/match-sessions/regular/today",
    "정기 세션을 열지 못했어요.",
    jsonInit("POST"),
  );

/** body.dateKey를 생략하면 오늘 세션을 만든다 */
export const createMatchSession = (body: CreateMatchSessionRequest) =>
  requestJson<MatchSessionDetailInfo>(
    "/api/match-sessions",
    "세션을 만들지 못했어요.",
    jsonInit("POST", body),
  );

export const addMatchSessionParticipant = async (
  sessionId: string,
  playerId: string,
) => {
  const body: AddMatchSessionParticipantRequest = { playerId };
  await requestJson<unknown>(
    `${sessionPath(sessionId)}/participants`,
    "참여자를 추가하지 못했어요.",
    jsonInit("POST", body),
  );
};

export const removeMatchSessionParticipant = async (
  sessionId: string,
  playerId: string,
) => {
  await requestJson<unknown>(
    `${sessionPath(sessionId)}/participants/${encodeURIComponent(playerId)}`,
    "참여를 취소하지 못했어요.",
    jsonInit("DELETE"),
  );
};

export const fetchSessionRecommendations = (
  sessionId: string,
  courts: number,
  seed: number,
) => {
  const searchParams = new URLSearchParams({
    courts: String(courts),
    seed: String(seed),
  });
  return requestJson<MatchSessionRecommendationResponse>(
    `${sessionPath(sessionId)}/recommendations?${searchParams.toString()}`,
    "추천 매칭을 불러오지 못했어요.",
  );
};

/** 점수 없는 진행 중 경기를 시작한다 */
export const startSessionMatch = async (
  sessionId: string,
  body: StartSessionMatchRequest,
) => {
  await requestJson<unknown>(
    `${sessionPath(sessionId)}/matches`,
    "경기를 시작하지 못했어요.",
    jsonInit("POST", body),
  );
};

export const isSessionParticipant = (
  session: Pick<MatchSessionDetailInfo, "participants">,
  playerId: string | undefined,
) =>
  !!playerId &&
  session.participants.some((participant) => participant.id === playerId);

/**
 * 경기 기록 멤버 목록에서 먼저 보여 줄 오늘 세션 멤버 id(나 제외).
 * 내가 참여한 오늘 세션만 본다. 정기 세션은 월·목 18~22시(KST) 동안만, 회원 세션은 그날 하루 적용한다.
 */
export const getPrioritySessionMemberIds = (
  sessions: Pick<
    MatchSessionDetailInfo,
    "kind" | "isToday" | "participants"
  >[],
  playerId: string | undefined,
  now: Date = new Date(),
): Set<string> =>
  new Set(
    sessions
      .filter(
        (session) =>
          session.isToday &&
          isSessionParticipant(session, playerId) &&
          (session.kind !== "regular" || isRegularSessionTime(now)),
      )
      .flatMap((session) =>
        session.participants
          .map((participant) => participant.id)
          .filter((id) => id !== playerId),
      ),
  );
