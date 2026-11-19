import type {
  AdminMatchDeletionLog,
  AdminMatchEditLog,
  Match,
} from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import {
  REGULAR_SESSION_LOOKAHEAD_DAYS,
  WEEKDAY_LABELS,
  addKstDays,
  getKstWeekday,
  isInProgressMatchExpired,
  kstDateKeyToDate,
  toKstDateKey,
  type AdminRegularSessionSkip,
  type MatchSessionDetail,
} from "@pkpkdupr/shared/session";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 홈에 알리는 회원 삭제·수정 기간 */
export const RECENT_NOTICE_DAYS = 7;

/** JSON 응답의 날짜는 문자열로 오므로 Date로 바꿔 쓴다 */
const toTime = (value: Date | string) => new Date(value).getTime();

const isActiveMember = (player: AdminPlayer) =>
  player.status === "active" && !player.isGuest;

const isActiveGuest = (player: AdminPlayer) =>
  player.status === "active" && player.isGuest;

export interface PlayerSummary {
  activeMemberCount: number;
  /** 경기 많은 순 */
  activeGuests: AdminPlayer[];
  /** 첫 비밀번호 변경 전 활성 정회원 */
  firstLoginMembers: AdminPlayer[];
}

export const summarizePlayers = (players: AdminPlayer[]): PlayerSummary => ({
  activeMemberCount: players.filter(isActiveMember).length,
  activeGuests: players
    .filter(isActiveGuest)
    .sort((a, b) => b.matchCount - a.matchCount),
  firstLoginMembers: players.filter(
    (player) =>
      isActiveMember(player) && player.isFirstLogin && player.hasLoginAccount,
  ),
});

export interface MatchSummary {
  weekCompletedCount: number;
  weekRatingExcludedCount: number;
  inProgressCount: number;
}

/** 이번 주 월요일 00:00 KST */
const startOfKstWeek = (now: Date): Date => {
  const todayKey = toKstDateKey(now);
  const daysSinceMonday = (getKstWeekday(todayKey) + 6) % 7;
  return kstDateKeyToDate(addKstDays(todayKey, -daysSinceMonday));
};

export const summarizeMatches = (
  matches: Match[],
  now: Date = new Date(),
): MatchSummary => {
  const weekStart = startOfKstWeek(now).getTime();
  const nowTime = now.getTime();
  const weekCompleted = matches.filter((match) => {
    if (match.status !== "completed") return false;
    const startsAt = toTime(match.matchStartsAt);
    return startsAt >= weekStart && startsAt <= nowTime;
  });
  return {
    weekCompletedCount: weekCompleted.length,
    weekRatingExcludedCount: weekCompleted.filter(
      (match) => match.ratingExcluded,
    ).length,
    // 서버 진행 중 조건과 같게 시작 시각이 아직 오지 않은 관리자 예정 경기는 뺀다
    inProgressCount: matches.filter(
      (match) =>
        match.status === "created" &&
        toTime(match.matchStartsAt) <= nowTime &&
        !isInProgressMatchExpired(new Date(match.matchStartsAt), now),
    ).length,
  };
};

export interface DeletionSummary {
  count: number;
  hasCompleted: boolean;
}

/** 최근 RECENT_NOTICE_DAYS일 회원이 지운 경기. 관리자가 지운 것은 세지 않는다 */
export const summarizeMemberDeletions = (
  logs: AdminMatchDeletionLog[],
  now: Date = new Date(),
): DeletionSummary => {
  const since = now.getTime() - RECENT_NOTICE_DAYS * DAY_MS;
  const recent = logs.filter(
    (log) => !log.deletedByAdmin && toTime(log.deletedAt) >= since,
  );
  return {
    count: recent.length,
    hasCompleted: recent.some((log) => log.match.status === "completed"),
  };
};

/** 최근 RECENT_NOTICE_DAYS일 회원이 고친 경기 수(같은 경기를 여러 번 고쳐도 하나). 관리자가 고친 것은 세지 않는다 */
export const countMemberEditedMatches = (
  logs: AdminMatchEditLog[],
  now: Date = new Date(),
): number => {
  const since = now.getTime() - RECENT_NOTICE_DAYS * DAY_MS;
  return new Set(
    logs
      .filter((log) => !log.editedByAdmin && toTime(log.editedAt) >= since)
      .map((log) => log.matchId),
  ).size;
};

/** 오늘부터 REGULAR_SESSION_LOOKAHEAD_DAYS일 안의 쉬는 날(날짜 오름차순) */
export const upcomingSkips = (
  skips: AdminRegularSessionSkip[],
  now: Date = new Date(),
): AdminRegularSessionSkip[] => {
  const todayKey = toKstDateKey(now);
  const endKey = addKstDays(todayKey, REGULAR_SESSION_LOOKAHEAD_DAYS);
  return skips
    .filter((skip) => skip.dateKey >= todayKey && skip.dateKey < endKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
};

const parseDateKey = (dateKey: string) => {
  const [, month, day] = dateKey.split("-").map(Number);
  return { month, day, weekday: WEEKDAY_LABELS[getKstWeekday(dateKey)] };
};

/** "11/19 목" */
export const formatDateKeyShort = (dateKey: string): string => {
  const { month, day, weekday } = parseDateKey(dateKey);
  return `${month}/${day} ${weekday}`;
};

/** 날짜 블록용 { month: "11월", day: "19", weekday: "목" } */
export const dateKeyBlock = (dateKey: string) => {
  const { month, day, weekday } = parseDateKey(dateKey);
  return { month: `${month}월`, day: String(day), weekday };
};

/** "12/3 목 정기운동 취소됨" | "10/5 월 공휴일" */
export const formatSkip = (skip: AdminRegularSessionSkip): string =>
  `${formatDateKeyShort(skip.dateKey)} ${skip.reason === "canceled" ? "정기운동 취소됨" : "공휴일"}`;

/** "18:00~22:00 · 장소", 시각이 없으면 장소만 */
export const formatSessionTimePlace = (session: MatchSessionDetail): string =>
  session.startTime && session.endTime
    ? `${session.startTime}~${session.endTime} · ${session.location}`
    : session.location;

/** sessionsPath의 month("YYYY-MM") */
export const sessionMonth = (session: MatchSessionDetail): string =>
  session.dateKey.slice(0, 7);
