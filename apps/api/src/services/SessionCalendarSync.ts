import {
  kstDateKeyToDate,
  REGULAR_SESSION_END_TIME,
  REGULAR_SESSION_START_TIME,
  toKstDateKey,
  type MatchSessionKind,
} from "@pkpkdupr/shared/session";
import {
  createGoogleCalendarClient,
  readGoogleCalendarConfig,
  type GoogleCalendarClient,
  type GoogleCalendarEvent,
  type GoogleCalendarEventTime,
} from "./GoogleCalendarClient";

/**
 * 세션을 동호회 구글 캘린더 일정으로 반영한다(서버 → 캘린더 단방향 쓰기).
 * 일정 id는 세션 id에서 결정적으로 만들어 DB 매핑 없이 같은 일정을 찾고,
 * 매번 DB의 현재 세션 상태로 일정을 통째로 덮어쓴다. 세션이 없으면 일정을 지운다.
 */

const CALENDAR_TIME_ZONE = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_ID_PREFIX = "pks";

/** 일정으로 옮길 세션 상태. 참여자는 활성 회원·게스트만 담는다 */
export interface CalendarSessionSnapshot {
  id: string;
  name: string;
  kind: MatchSessionKind;
  location: string;
  /** 세션 날짜(KST) YYYY-MM-DD */
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  participants: Array<{ username: string; isGuest: boolean }>;
}

/**
 * 구글 캘린더 일정 id. 허용 문자는 base32hex 소문자(a–v, 0–9)라
 * 세션 id의 UTF-8 바이트를 16진수(0–9, a–f)로 옮기고 접두사를 붙인다.
 */
export const toCalendarEventId = (sessionId: string): string =>
  EVENT_ID_PREFIX +
  Array.from(new TextEncoder().encode(sessionId), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const nextDateKey = (dateKey: string) =>
  toKstDateKey(new Date(kstDateKeyToDate(dateKey).getTime() + DAY_MS));

const toEventTimes = (
  session: CalendarSessionSnapshot,
): { start: GoogleCalendarEventTime; end: GoogleCalendarEventTime } => {
  const startTime =
    session.startTime ??
    (session.kind === "regular" ? REGULAR_SESSION_START_TIME : null);
  const endTime =
    session.endTime ??
    (session.kind === "regular" ? REGULAR_SESSION_END_TIME : null);
  if (!startTime || !endTime) {
    // 시각 없는 세션은 그날 종일 일정이다. 종일 일정의 end.date는 다음 날(미포함)이다
    return {
      start: { date: session.dateKey },
      end: { date: nextDateKey(session.dateKey) },
    };
  }
  // "HH:MM"끼리는 문자열 비교가 시각 순서와 같다. 종료가 시작보다 이르거나 같으면 다음 날 종료다
  const endDateKey =
    endTime <= startTime ? nextDateKey(session.dateKey) : session.dateKey;
  return {
    start: {
      dateTime: `${session.dateKey}T${startTime}:00`,
      timeZone: CALENDAR_TIME_ZONE,
    },
    end: { dateTime: `${endDateKey}T${endTime}:00`, timeZone: CALENDAR_TIME_ZONE },
  };
};

const toEventDescription = (
  session: CalendarSessionSnapshot,
  webAppUrl: string | undefined,
): string => {
  const members = session.participants.filter((player) => !player.isGuest);
  const guests = session.participants.filter((player) => player.isGuest);
  const formatGroup = (label: string, group: typeof members) =>
    group.length > 0
      ? `${label} ${group.length}: ${group.map((player) => player.username).join(", ")}`
      : `${label} 0`;

  const lines = [`참석 ${session.participants.length}명`, formatGroup("회원", members)];
  if (guests.length > 0) {
    lines.push(formatGroup("게스트", guests));
  }
  if (webAppUrl) {
    lines.push("", "앱에서 참석·명단 보기", webAppUrl);
  }
  lines.push("", "이 설명은 앱이 자동으로 바꿉니다. 직접 고친 내용은 지워집니다.");
  return lines.join("\n");
};

/** 세션 상태로 일정 본문을 만든다. 참석자(attendees)는 넣지 않는다 */
export const buildSessionCalendarEvent = (
  session: CalendarSessionSnapshot,
  webAppUrl?: string,
): GoogleCalendarEvent => ({
  summary: `${session.name} (${session.participants.length}명)`,
  location: session.location,
  description: toEventDescription(session, webAppUrl?.trim() || undefined),
  ...toEventTimes(session),
});

export interface SessionCalendarSyncDeps {
  /** 연동이 꺼져 있으면 null. 호출마다 불러 설정 변경을 따라간다 */
  getClient: () => GoogleCalendarClient | null;
  /** 세션의 현재 상태. 세션이 없으면 undefined(일정을 지운다) */
  loadSession: (sessionId: string) => Promise<CalendarSessionSnapshot | undefined>;
  getWebAppUrl: () => string | undefined;
  /** 함수 실행이 끝나기 전에 작업을 마치게 하는 런타임 훅(Edge의 EdgeRuntime.waitUntil) */
  waitUntil?: (task: Promise<unknown>) => void;
}

export interface SessionCalendarSync {
  /**
   * 세션 일정을 현재 상태로 맞추는 작업을 백그라운드로 건다. 호출자는 기다리지 않는다.
   * 실패는 로그만 남기고, 다음 변경 때 그 세션의 최신 상태로 다시 쓴다.
   */
  syncSessions(sessionIds: string[]): void;
  /** 걸린 작업이 모두 끝날 때까지 기다린다(테스트용) */
  whenIdle(): Promise<void>;
}

/** 다음 매크로태스크로 미뤄 지금 처리 중인 요청의 응답을 먼저 보낸다 */
const deferToNextTask = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

export const createSessionCalendarSync = (
  deps: SessionCalendarSyncDeps,
): SessionCalendarSync => {
  // 같은 세션 작업은 순서대로 돌려 이전 상태가 나중 상태를 덮지 않게 한다
  const chains = new Map<string, Promise<void>>();
  // 아직 시작 전인 작업이 있으면 그 작업이 최신 상태를 읽으므로 새로 걸지 않는다
  const queued = new Set<string>();
  const pending = new Set<Promise<void>>();

  const syncOne = async (client: GoogleCalendarClient, sessionId: string) => {
    const eventId = toCalendarEventId(sessionId);
    try {
      const session = await deps.loadSession(sessionId);
      if (session) {
        await client.upsertEvent(
          eventId,
          buildSessionCalendarEvent(session, deps.getWebAppUrl()),
        );
      } else {
        await client.deleteEvent(eventId);
      }
    } catch (error) {
      console.error("[CALENDAR] 세션 일정 반영 실패", sessionId, error);
    }
  };

  return {
    syncSessions(sessionIds) {
      const client = deps.getClient();
      if (!client) {
        return;
      }
      for (const sessionId of new Set(sessionIds)) {
        if (queued.has(sessionId)) {
          continue;
        }
        queued.add(sessionId);
        const previous = chains.get(sessionId) ?? deferToNextTask();
        const task = previous.then(async () => {
          queued.delete(sessionId);
          await syncOne(client, sessionId);
        });
        chains.set(sessionId, task);
        pending.add(task);
        void task.finally(() => {
          pending.delete(task);
          if (chains.get(sessionId) === task) {
            chains.delete(sessionId);
          }
        });
        try {
          deps.waitUntil?.(task);
        } catch (error) {
          console.error("[CALENDAR] waitUntil 등록 실패", error);
        }
      }
    },
    async whenIdle() {
      while (pending.size > 0) {
        await Promise.all([...pending]);
      }
    },
  };
};

/** env 설정이 같으면 클라이언트(액세스 토큰 캐시 포함)를 다시 쓴다 */
let cachedClient: { key: string; client: GoogleCalendarClient | null } | null =
  null;

export const getEnvGoogleCalendarClient = (): GoogleCalendarClient | null => {
  const key = `${process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON ?? ""}\n${process.env.GOOGLE_CALENDAR_ID ?? ""}`;
  if (cachedClient?.key !== key) {
    const config = readGoogleCalendarConfig(process.env);
    cachedClient = {
      key,
      client: config ? createGoogleCalendarClient(config) : null,
    };
  }
  return cachedClient.client;
};
