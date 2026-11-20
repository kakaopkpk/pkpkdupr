import { getMatchRecordedAt, type Match, type Team } from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { toKstDateKey } from "@pkpkdupr/shared/session";

export const DELETED_PLAYER_LABEL = "(지운 회원)";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 스냅샷 팀 표시. 아이디가 비면 지운 회원이다 */
export const formatTeam = (team: Team | undefined): string =>
  team?.players.length
    ? team.players.map((player) => player.username || DELETED_PLAYER_LABEL).join(" · ")
    : DELETED_PLAYER_LABEL;

export const formatScore = (match: Match): string => {
  const score = match.scores?.[0];
  return score ? `${score.scoreA} : ${score.scoreB}` : "점수 없음(진행 중)";
};

// API JSON의 날짜는 문자열로 오므로 표시·비교 전에 Date로 바꾼다
export const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);

const toNullableDate = (value: Date | string | null): Date | null =>
  value === null ? null : toDate(value);

/** 경기 응답의 날짜 필드를 Date로 바꾼다 */
export const normalizeMatch = (match: Match): Match => ({
  ...match,
  matchStartsAt: toDate(match.matchStartsAt),
  createdAt: toDate(match.createdAt),
  updatedAt: toDate(match.updatedAt),
  completedAt: toNullableDate(match.completedAt),
  resultSubmittedAt: toNullableDate(match.resultSubmittedAt),
  session: match.session
    ? { ...match.session, date: toDate(match.session.date) }
    : undefined,
});

/** 기록 시각(완료 경기는 점수 입력 시각, getMatchRecordedAt) 내림차순, 같으면 id 내림차순 */
export const compareMatchesLatestFirst = (a: Match, b: Match): number =>
  toDate(getMatchRecordedAt(b)).getTime() -
    toDate(getMatchRecordedAt(a)).getTime() ||
  b.id.localeCompare(a.id);

export type PlayerLookup = ReadonlyMap<string, { username: string }>;

/** 회원 목록과 경기 팀 선수로 id → 아이디를 찾는 표 */
export const buildPlayerLookup = (
  players: readonly AdminPlayer[],
  matches: readonly Match[] = [],
): PlayerLookup => {
  const lookup = new Map<string, { username: string }>();
  for (const match of matches) {
    for (const team of match.teams) {
      for (const player of team.players) lookup.set(player.id, player);
    }
  }
  for (const player of players) lookup.set(player.id, player);
  return lookup;
};

export const lookupUsername = (
  lookup: PlayerLookup,
  playerId: string | null | undefined,
): string =>
  (playerId && lookup.get(playerId)?.username) || DELETED_PLAYER_LABEL;

/** datetime-local 입력값 "YYYY-MM-DDTHH:mm"(KST) */
export const toKstDateTimeInputValue = (date: Date | string): string =>
  new Date(toDate(date).getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);

/** datetime-local 입력값(KST)을 Date로. 형식이 틀리면 null */
export const parseKstDateTimeInputValue = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const matchKstDateKey = (match: Match): string =>
  toKstDateKey(toDate(match.matchStartsAt));
