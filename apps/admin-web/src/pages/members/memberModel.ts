import type {
  AdminPlayer,
  PlayerCreationLog,
  PlayerStatusChangeLog,
} from "@pkpkdupr/shared/player";
import type { RankingResponse } from "@pkpkdupr/shared/ranking";
import { isClientError } from "../../api/client";
import type { MemberKindFilter } from "../../lib/adminRoutes";
import { formatKstDateTime, formatKstMonthDay } from "../../lib/format";

export type MemberKind = Exclude<MemberKindFilter, "all">;
export type Gender = "M" | "F";
export type SortKey = "rating" | "matches" | "lastMatch";
export type SortDirection = "asc" | "desc";

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { key: "rating", direction: "desc" };

export const GENDER_LABEL: Record<Gender, string> = { M: "남", F: "여" };

export const KIND_LABEL: Record<MemberKind, string> = {
  member: "정회원",
  guest: "게스트",
  inactive: "비활성",
};

export const USERNAME_HINT =
  "영문·숫자·점(.)·밑줄(_)·하이픈(-)으로 64자까지. 대소문자는 구분하지 않아요. 회원이 로그인할 때 써요.";

/** 게스트를 먼저 가른다. 그래서 세그먼트 개수의 합이 전체와 같다 */
export const getMemberKind = (player: AdminPlayer): MemberKind => {
  if (player.isGuest) return "guest";
  if (player.status === "inactive") return "inactive";
  return "member";
};

export const isAwaitingFirstPasswordChange = (player: AdminPlayer): boolean =>
  player.isFirstLogin && player.hasLoginAccount && player.status === "active";

export const getAccountLabel = (player: AdminPlayer): string => {
  if (player.status === "inactive") return "로그인 막힘";
  if (!player.hasLoginAccount) return "계정 없음";
  if (player.isFirstLogin) return "첫 비밀번호 변경 전";
  return "로그인 가능";
};

export interface MemberFilters {
  query: string;
  kind: MemberKindFilter;
  firstLoginOnly: boolean;
}

export const filterMembers = (
  players: AdminPlayer[],
  { query, kind, firstLoginOnly }: MemberFilters,
): AdminPlayer[] => {
  const keyword = query.trim().toLowerCase();
  return players.filter(
    (player) =>
      (!keyword || player.username.toLowerCase().includes(keyword)) &&
      (kind === "all" || getMemberKind(player) === kind) &&
      (!firstLoginOnly || isAwaitingFirstPasswordChange(player)),
  );
};

export const countByKind = (
  players: AdminPlayer[],
): Record<MemberKindFilter, number> => {
  const counts = { all: players.length, member: 0, guest: 0, inactive: 0 };
  for (const player of players) counts[getMemberKind(player)] += 1;
  return counts;
};

const toTime = (value: Date | string | null) =>
  value === null ? null : new Date(value).getTime();

const sortValue = (player: AdminPlayer, key: SortKey): number | null => {
  switch (key) {
    case "rating":
      return player.duprRating?.doubles ?? null;
    case "matches":
      return player.matchCount;
    case "lastMatch":
      return toTime(player.lastMatchStartsAt);
  }
};

/** 값이 없는 회원("–")은 방향과 상관없이 맨 아래, 같으면 아이디 순이다 */
export const sortMembers = (
  players: AdminPlayer[],
  { key, direction }: SortState,
): AdminPlayer[] =>
  [...players].sort((a, b) => {
    const aValue = sortValue(a, key);
    const bValue = sortValue(b, key);
    if (aValue === null || bValue === null) {
      if (aValue !== bValue) return aValue === null ? 1 : -1;
    } else if (aValue !== bValue) {
      return direction === "asc" ? aValue - bValue : bValue - aValue;
    }
    return a.username.localeCompare(b.username);
  });

/** 같은 머리를 누르면 방향을 뒤집고, 다른 머리면 내림차순부터 */
export const toggleSort = (current: SortState, key: SortKey): SortState =>
  current.key === key
    ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
    : { key, direction: "desc" };

export interface RankInfo {
  doubles: Map<string, number>;
  singles: Map<string, number>;
}

export const toRankMap = (ranking: RankingResponse | null): Map<string, number> =>
  new Map(
    ranking?.entries.map((entry): [string, number] => [entry.player.id, entry.rank]) ?? [],
  );

/** 가장 이른 생성 기록. 없으면 null */
export const getCreationLog = (
  logs: PlayerCreationLog[] | undefined,
): PlayerCreationLog | null => {
  if (!logs || logs.length === 0) return null;
  return logs.reduce((earliest, log) =>
    new Date(log.createdAt).getTime() < new Date(earliest.createdAt).getTime()
      ? log
      : earliest,
  );
};

const describeCreation = (log: PlayerCreationLog): string => {
  switch (log.creationSource) {
    case "admin_register":
      return `${log.createdByUsername}가 회원 추가`;
    case "invite":
      return `${log.createdByUsername} 초대로 가입`;
    case "self_register":
      return "직접 가입";
    case "bootstrap":
      return "초기 관리자로 생성";
  }
};

/** 패널 부제의 추가 정보: "11/10 brad.ley가 추가" */
export const formatCreationSummary = (log: PlayerCreationLog): string =>
  log.creationSource === "admin_register"
    ? `${formatKstMonthDay(log.createdAt)} ${log.createdByUsername}가 추가`
    : `${formatKstMonthDay(log.createdAt)} ${describeCreation(log)}`;

export interface HistoryLine {
  id: string;
  at: number;
  text: string;
}

const STATUS_LABEL = { active: "활성", inactive: "비활성" } as const;

/** 생성·상태 변경 기록을 최신순으로 */
export const buildHistoryLines = (
  creationLogs: PlayerCreationLog[] | undefined,
  statusLogs: PlayerStatusChangeLog[] | undefined,
): HistoryLine[] =>
  [
    ...(creationLogs ?? []).map((log) => ({
      id: `creation-${log.id}`,
      at: new Date(log.createdAt).getTime(),
      text: `${formatKstDateTime(log.createdAt)} · ${describeCreation(log)}`,
    })),
    ...(statusLogs ?? []).map((log) => ({
      id: `status-${log.id}`,
      at: new Date(log.changedAt).getTime(),
      text: `${formatKstDateTime(log.changedAt)} · ${log.changedByUsername}가 ${STATUS_LABEL[log.nextStatus]}으로 바꿈`,
    })),
  ].sort((a, b) => b.at - a.at);

/** 게스트 추가 정보: "11/9 월요 정기운동에서 colin.34가 추가". 아무것도 모르면 null */
export const formatGuestAddedSummary = (player: AdminPlayer): string | null => {
  const info = player.guestAddedInfo;
  if (!info) return null;
  const sessionPart = info.sessionName
    ? `${info.sessionDate ? `${formatKstMonthDay(info.sessionDate)} ` : ""}${info.sessionName}에서`
    : null;
  const addedByPart = info.addedByUsername ? `${info.addedByUsername}가 추가` : null;
  if (!sessionPart && !addedByPart) return null;
  return [sessionPart, addedByPart ?? "추가"].filter(Boolean).join(" ");
};

const FALLBACK_ERROR_MESSAGE = "처리하지 못했어요. 다시 시도해 주세요.";

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : FALLBACK_ERROR_MESSAGE;

/** 4xx는 화면 안 문구로, 네트워크·5xx는 토스트로 보인다 */
export const reportActionError = (
  error: unknown,
  setInlineError: (message: string) => void,
  showToast: (message: string) => void,
): void => {
  if (isClientError(error)) setInlineError(error.message);
  else showToast(getErrorMessage(error));
};

/**
 * 확인 대화상자용. 4xx는 다시 던져 대화상자 안에 보이고, 네트워크·5xx는 토스트로 띄운 뒤 대화상자를 닫는다.
 */
export const runConfirmedAction = async (
  action: () => Promise<void>,
  showToast: (message: string) => void,
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    if (isClientError(error)) throw error;
    showToast(getErrorMessage(error));
  }
};

export interface IssuedCredential {
  playerId: string;
  username: string;
  kind: "created" | "reset";
}
