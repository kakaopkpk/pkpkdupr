import type {
  ScheduleMonthResponse,
  ScheduleSession,
} from "@pkpkdupr/shared/schedule";
import { toKstDateKey } from "@pkpkdupr/shared/session";
import { apiFetch } from "@/lib/api";
import { RequestError } from "@/lib/rankings";
import {
  getRecordItemDate,
  type RecordItemInfo,
  type RecordMatchItemInfo,
  type RecordSessionItemInfo,
} from "@/lib/records";
import type { MatchInfo } from "@/types/match";

/** JSON 응답 형태(날짜는 문자열) */
export type ScheduleSessionInfo = Omit<ScheduleSession, "date"> & {
  date: string;
};

export type ScheduleMonthInfo = Omit<
  ScheduleMonthResponse,
  "sessions" | "records"
> & {
  sessions: ScheduleSessionInfo[];
  records: RecordItemInfo[];
};

/** 그 달(KST, "YYYY-MM")의 세션과 기록 줄 */
export const fetchScheduleMonth = async (
  month: string,
): Promise<ScheduleMonthInfo> => {
  const res = await apiFetch(
    `/api/schedule?${new URLSearchParams({ month }).toString()}`,
  );
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new RequestError(
      errorData.error || "일정을 불러오지 못했어요.",
      res.status,
    );
  }
  return (await res.json()) as ScheduleMonthInfo;
};

/** 달력 날짜 아래 표시 */
export type ScheduleDayMark =
  /** 세션이 있는 날: 참여 인원(그날 세션 참여자 합, 중복 제외), 내가 참여했는지 */
  | { kind: "session"; participantCount: number; isMine: boolean }
  /** 세션 없이 경기 기록만 있는 날: 내가 뛴 경기가 있는지 */
  | { kind: "match"; isMine: boolean };

const isMatchPlayer = (match: MatchInfo, playerId: string | undefined) =>
  !!playerId &&
  match.teams.some((team) =>
    team.players.some((player) => player.id === playerId),
  );

/** 날짜 키별 달력 표시. 세션이 있는 날은 경기 기록이 있어도 세션 표시다 */
export const buildScheduleDayMarks = (
  data: Pick<ScheduleMonthInfo, "sessions" | "records">,
  playerId: string | undefined,
): Map<string, ScheduleDayMark> => {
  const marks = new Map<string, ScheduleDayMark>();
  const participantsByDate = new Map<string, Set<string>>();
  for (const session of data.sessions) {
    const ids = participantsByDate.get(session.dateKey) ?? new Set<string>();
    session.participants.forEach((participant) => ids.add(participant.id));
    participantsByDate.set(session.dateKey, ids);
  }
  for (const [dateKey, ids] of participantsByDate) {
    marks.set(dateKey, {
      kind: "session",
      participantCount: ids.size,
      isMine: !!playerId && ids.has(playerId),
    });
  }
  for (const item of data.records) {
    if (item.kind !== "match") continue;
    const dateKey = toKstDateKey(new Date(item.match.matchStartsAt));
    const current = marks.get(dateKey);
    if (current?.kind === "session") continue;
    marks.set(dateKey, {
      kind: "match",
      isMine: !!current?.isMine || isMatchPlayer(item.match, playerId),
    });
  }
  return marks;
};

/** 고른 날 카드 한 장 */
export type ScheduleDayEntry =
  /** 오늘 진행 중 세션 */
  | { kind: "live"; session: ScheduleSessionInfo }
  /** 아직 끝나지 않은 세션(참여·참여 취소 가능) */
  | { kind: "upcoming"; session: ScheduleSessionInfo }
  /** 끝난 세션(세션 카드와 내 기록 띠) */
  | { kind: "record-session"; item: RecordSessionItemInfo }
  /** 세션 없는 경기 */
  | { kind: "record-match"; item: RecordMatchItemInfo };

/**
 * 고른 날의 카드. 세션 카드(정기 먼저)를 먼저, 세션 없는 경기(최신순)를 뒤에 둔다.
 * 끝나지 않은 세션은 진행 중(liveSessionId)이면 live, 아니면 upcoming이고,
 * 끝난 세션은 기록 줄이 있을 때만 record-session이다(완료 경기 없이 끝난 세션은 정리 대기라 뺀다).
 */
export const getScheduleDayEntries = (
  data: Pick<ScheduleMonthInfo, "sessions" | "records">,
  dateKey: string,
  liveSessionId: string | null,
): ScheduleDayEntry[] => {
  const recordsOfDay = data.records.filter(
    (item) => toKstDateKey(new Date(getRecordItemDate(item))) === dateKey,
  );
  const sessionRecords = new Map(
    recordsOfDay.flatMap((item) =>
      item.kind === "session" ? [[item.session.id, item] as const] : [],
    ),
  );

  const entries: ScheduleDayEntry[] = [];
  const shownSessionIds = new Set<string>();
  for (const session of data.sessions) {
    if (session.dateKey !== dateKey) continue;
    if (!session.isEnded) {
      entries.push({
        kind: session.id === liveSessionId ? "live" : "upcoming",
        session,
      });
      shownSessionIds.add(session.id);
      continue;
    }
    const record = sessionRecords.get(session.id);
    if (record) {
      entries.push({ kind: "record-session", item: record });
      shownSessionIds.add(session.id);
    }
  }
  for (const item of recordsOfDay) {
    if (item.kind === "session") {
      // 세션 목록과 기록 줄의 시점이 어긋나도 기록은 보인다
      if (!shownSessionIds.has(item.session.id)) {
        entries.push({ kind: "record-session", item });
      }
    }
  }
  for (const item of recordsOfDay) {
    if (item.kind === "match") entries.push({ kind: "record-match", item });
  }
  return entries;
};
