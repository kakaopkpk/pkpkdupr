import type {
  InProgressMatchesResponse,
  RecordMatchTeamRequest,
  StartMatchRequest,
} from "@pkpkdupr/shared/match";
import type { MatchInfo } from "@/types/match";
import { apiFetch } from "@/lib/api";

/** JSON 응답 형태(날짜는 문자열) */
export type InProgressMatchesInfo = Omit<InProgressMatchesResponse, "matches"> & {
  matches: MatchInfo[];
};

const readErrorMessage = async (res: Response, fallbackMessage: string) => {
  const errorData = (await res.json().catch(() => ({}))) as { error?: string };
  return errorData.error || fallbackMessage;
};

const TEAM_NAMES = ["Team A", "Team B"] as const;

/** 선수 id 두 팀을 요청용 팀 구성으로 바꾼다 */
export const toTeamRequests = (
  teams: readonly [readonly string[], readonly string[]],
): [RecordMatchTeamRequest, RecordMatchTeamRequest] => [
  { name: TEAM_NAMES[0], playerIds: [...teams[0]] },
  { name: TEAM_NAMES[1], playerIds: [...teams[1]] },
];

/** 경기의 두 팀 선수 id */
export const getMatchTeamPlayerIds = (
  match: Pick<MatchInfo, "teams">,
): [string[], string[]] => [
  match.teams[0].players.map((player) => player.id),
  match.teams[1].players.map((player) => player.id),
];

/**
 * 세션과 상관없이 점수 없는 진행 중 경기를 시작한다.
 * 선수 중 누구든 이미 다른 진행 중 경기에 있으면 서버가 409로 거절한다.
 */
export const startMatch = async (body: StartMatchRequest): Promise<MatchInfo> => {
  const res = await apiFetch("/api/matches/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "경기를 시작하지 못했어요."),
    );
  }
  return (await res.json()) as MatchInfo;
};

/** 세션 밖 경기까지 포함한 모든 진행 중 경기 */
export const fetchInProgressMatches = async (): Promise<MatchInfo[]> => {
  const res = await apiFetch("/api/matches/in-progress");
  if (!res.ok) {
    throw new Error(
      await readErrorMessage(res, "진행 중 경기를 불러오지 못했어요."),
    );
  }
  return ((await res.json()) as InProgressMatchesInfo).matches;
};

/**
 * 경기를 지운다. expectedUpdatedAt(마지막으로 본 updatedAt)이 서버 값과 다르면 409다.
 * 이미 지워진 경기(404)도 지운 것으로 본다.
 */
export const deleteMatch = async (
  matchId: string,
  expectedUpdatedAt?: string,
): Promise<void> => {
  const query = expectedUpdatedAt
    ? `?${new URLSearchParams({ expectedUpdatedAt }).toString()}`
    : "";
  const res = await apiFetch(
    `/api/matches/${encodeURIComponent(matchId)}${query}`,
    { method: "DELETE" },
  );
  if (res.ok || res.status === 404) return;
  throw new Error(
    await readErrorMessage(res, "경기를 지우지 못했어요."),
  );
};
