import type { Player } from "@pkpkdupr/shared/player";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import {
  kstDateKeyToDate,
  type RegularSessionSkipReason,
} from "@pkpkdupr/shared/session";
import request from "supertest";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "../db";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";
import {
  extractPublicHolidayDateKeys,
  isCronSecretMatch,
  KOREAN_HOLIDAY_CALENDAR_ID,
} from "../services/RegularSessionCron";
import { toCalendarEventId } from "../services/SessionCalendarSync";
import {
  createFakeGoogleFetch,
  createTestServiceAccountJson,
  type FakeCalendarResponse,
  type RecordedCalendarCall,
} from "./googleCalendarFake";

// 2026-11-12는 목요일(정기 세션 요일)이다. 28일 안의 정기 회차는 11-12부터 12-07까지 8개다.
const thursdayMorning = new Date("2026-11-12T10:00:00+09:00");
const ALL_REGULAR_DATES = [
  "2026-11-12",
  "2026-11-16",
  "2026-11-19",
  "2026-11-23",
  "2026-11-26",
  "2026-11-30",
  "2026-12-03",
  "2026-12-07",
];

const CRON_SECRET = "cron-secret-value";
const CLUB_CALENDAR_ID = "club@group.calendar.google.com";
const holidayListUrlPrefix = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(KOREAN_HOLIDAY_CALENDAR_ID)}/events?`;

const admin: Player = {
  isGuest: false,
  id: "Padmin01",
  username: "admin",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
};
const adminSession: AuthenticatedSession = {
  payload: { playerId: admin.id, isAdmin: true },
  player: admin,
  isFirstLogin: false,
};

const holidayEvent = (dateKey: string, description: string, endDateKey?: string) => ({
  summary: "휴일",
  description,
  start: { date: dateKey },
  end: { date: endDateKey ?? dateKey },
});

/** 정기 세션 id. 엔티티 id 형식(S + 7자)에 맞춘다 */
const regularSessionId = (dateKey: string) =>
  `S${dateKey.slice(2).replace(/-/g, "")}r`;

/**
 * DB 대신 쓰는 메모리 저장소. 실제 저장소와 같은 규칙으로 동작한다.
 * - 정기 세션은 날짜당 하나, 제외 날짜면 새로 만들지 않는다
 * - 빈 정기 세션만 공휴일 삭제 대상이다
 * - 오늘 이후 정기 세션을 지우면 그 날짜를 취소로 남긴다
 */
const createFakeStore = () => {
  const sessions = new Map<string, ManagedMatchSession>();
  const skips = new Map<string, RegularSessionSkipReason>();

  const addRegular = (dateKey: string, overrides: Partial<ManagedMatchSession> = {}) => {
    const session: ManagedMatchSession = {
      id: regularSessionId(dateKey),
      name: "정기운동",
      date: kstDateKeyToDate(dateKey, 18),
      location: "야탑초등학교",
      participantIds: [],
      matchCount: 0,
      kind: "regular",
      startTime: "18:00",
      endTime: "22:00",
      createdAt: thursdayMorning,
      updatedAt: thursdayMorning,
      ...overrides,
    };
    sessions.set(dateKey, session);
    return session;
  };

  const findOrCreate = vi
    .spyOn(db.matches, "findOrCreateRegularSession")
    .mockImplementation(async (dateKey) => {
      const existing = sessions.get(dateKey);
      if (existing) return { session: existing, created: false };
      if (skips.has(dateKey)) return null;
      return { session: addRegular(dateKey), created: true };
    });
  vi.spyOn(db.matches, "findRegularSessionSkips").mockImplementation(
    async (from, to) =>
      [...skips]
        .filter(([dateKey]) => dateKey >= from && dateKey < to)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, reason]) => ({ dateKey, reason })),
  );
  const addHolidays = vi
    .spyOn(db.matches, "addRegularSessionHolidays")
    .mockImplementation(async (dateKeys) => {
      for (const dateKey of dateKeys) {
        if (!skips.has(dateKey)) skips.set(dateKey, "holiday");
      }
    });
  const deleteEmpty = vi
    .spyOn(db.matches, "deleteEmptyRegularSessions")
    .mockImplementation(async (dateKeys) => {
      const deleted: Array<{ id: string; dateKey: string }> = [];
      for (const dateKey of dateKeys) {
        const session = sessions.get(dateKey);
        if (session && session.participantIds.length === 0 && session.matchCount === 0) {
          sessions.delete(dateKey);
          deleted.push({ id: session.id, dateKey });
        }
      }
      return deleted;
    });
  const deleteSession = vi
    .spyOn(db.matches, "deleteSession")
    .mockImplementation(async (sessionId, options = {}) => {
      const entry = [...sessions].find(([, session]) => session.id === sessionId);
      if (!entry) return false;
      const [dateKey] = entry;
      sessions.delete(dateKey);
      if (
        options.cancelRegularFromDateKey &&
        dateKey >= options.cancelRegularFromDateKey &&
        !skips.has(dateKey)
      ) {
        skips.set(dateKey, "canceled");
      }
      return true;
    });
  vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
    async (sessionId) =>
      [...sessions.values()].find((session) => session.id === sessionId),
  );
  vi.spyOn(MatchRepository.prototype, "findSessionsFromDateKey").mockImplementation(
    async () =>
      [...sessions.values()].sort((a, b) => a.date.getTime() - b.date.getTime()),
  );

  return {
    sessions,
    skips,
    addRegular,
    findOrCreate,
    addHolidays,
    deleteEmpty,
    deleteSession,
  };
};

let serviceAccountJson: string;

beforeAll(async () => {
  serviceAccountJson = await createTestServiceAccountJson();
});

describe("isCronSecretMatch", () => {
  it("값이 같을 때만 true", () => {
    expect(isCronSecretMatch("abc", "abc")).toBe(true);
    expect(isCronSecretMatch("abd", "abc")).toBe(false);
    expect(isCronSecretMatch("ab", "abc")).toBe(false);
    expect(isCronSecretMatch("abcd", "abc")).toBe(false);
    expect(isCronSecretMatch("", "abc")).toBe(false);
  });
});

describe("extractPublicHolidayDateKeys", () => {
  it("설명이 '공휴일'로 시작하는 일정만 공휴일로 보고 기념일은 뺀다", () => {
    expect(
      extractPublicHolidayDateKeys([
        holidayEvent("2027-02-08", "공휴일\n설날 연휴", "2027-02-09"),
        holidayEvent("2027-05-01", "공휴일\n쉬는 날 노동절", "2027-05-02"),
        holidayEvent("2027-04-05", "기념일\n식목일", "2027-04-06"),
        holidayEvent("2027-05-08", "기념일\n어버이날", "2027-05-09"),
        { summary: "설명 없음", start: { date: "2027-06-01" } },
      ]),
    ).toEqual(["2027-02-08", "2027-05-01"]);
  });

  it("여러 날 종일 일정은 end.date 전날까지 펼친다", () => {
    expect(
      extractPublicHolidayDateKeys([
        holidayEvent("2027-02-06", "공휴일", "2027-02-09"),
      ]),
    ).toEqual(["2027-02-06", "2027-02-07", "2027-02-08"]);
  });
});

describe("정기 세션 예약 작업", () => {
  let fake: ReturnType<typeof createFakeGoogleFetch>;
  let store: ReturnType<typeof createFakeStore>;
  let holidayItems: unknown[];

  const useCalendar = (
    responder: (call: RecordedCalendarCall) => FakeCalendarResponse = (call) =>
      call.url.startsWith(holidayListUrlPrefix)
        ? { status: 200, body: { items: holidayItems } }
        : 200,
  ) => {
    vi.stubEnv("GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", serviceAccountJson);
    vi.stubEnv("GOOGLE_CALENDAR_ID", CLUB_CALENDAR_ID);
    fake = createFakeGoogleFetch(responder);
    vi.stubGlobal("fetch", fake.fetchMock);
  };

  const runCron = (secret: string | null = CRON_SECRET) => {
    const call = request(app).post("/api/cron/regular-sessions");
    return secret === null ? call : call.set("x-cron-secret", secret);
  };

  const holidayListCalls = () =>
    fake.calendarCalls.filter((call) => call.url.startsWith(holidayListUrlPrefix));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(thursdayMorning);
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(adminSession);
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([admin]);
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    holidayItems = [];
    store = createFakeStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("인증", () => {
    it("헤더가 없거나 틀리면 401이고 아무것도 하지 않는다", async () => {
      useCalendar();
      for (const secret of [null, "wrong-secret", `${CRON_SECRET}x`]) {
        const response = await runCron(secret);
        expect(response.status).toBe(401);
      }
      expect(fake.fetchMock).not.toHaveBeenCalled();
      expect(store.findOrCreate).not.toHaveBeenCalled();
    });

    it("CRON_SECRET이 설정되지 않았으면 503이다", async () => {
      useCalendar();
      vi.stubEnv("CRON_SECRET", "");

      const response = await runCron();

      expect(response.status).toBe(503);
      expect(store.findOrCreate).not.toHaveBeenCalled();
    });
  });

  it("오늘부터 28일 안의 정기 회차를 만들고, 다시 실행해도 더 만들지 않는다", async () => {
    useCalendar();

    const first = await runCron();

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      fromDateKey: "2026-11-12",
      toDateKey: "2026-12-10",
      created: ALL_REGULAR_DATES,
      skipped: [],
      deleted: [],
    });
    expect([...store.sessions.keys()].sort()).toEqual(ALL_REGULAR_DATES);
    const [listCall] = holidayListCalls();
    const listUrl = new URL(listCall!.url);
    expect(listCall!.method).toBe("GET");
    expect(listUrl.searchParams.get("singleEvents")).toBe("true");
    expect(listUrl.searchParams.get("timeMin")).toBe("2026-11-11T15:00:00.000Z");
    expect(listUrl.searchParams.get("timeMax")).toBe("2026-12-09T15:00:00.000Z");
    // 새로 만든 세션은 동호회 캘린더 일정도 생긴다
    await vi.waitFor(() =>
      expect(
        fake.calendarCalls.filter((call) => call.method === "POST"),
      ).toHaveLength(ALL_REGULAR_DATES.length),
    );
    expect(fake.calendarCalls).toContainEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          id: toCalendarEventId(regularSessionId("2026-12-07")),
        }),
      }),
    );

    const second = await runCron();

    expect(second.status).toBe(200);
    expect(second.body.created).toEqual([]);
    expect(store.sessions.size).toBe(ALL_REGULAR_DATES.length);
  });

  it("오늘이 정기 요일이어도 22시가 지났으면 오늘은 만들지 않는다", async () => {
    useCalendar();
    vi.setSystemTime(new Date("2026-11-12T22:00:00+09:00"));

    const response = await runCron();

    expect(response.status).toBe(200);
    expect(response.body.created).not.toContain("2026-11-12");
    expect(response.body.created[0]).toBe("2026-11-16");
    expect(store.findOrCreate).not.toHaveBeenCalledWith("2026-11-12");
  });

  it("공휴일은 저장하고 건너뛰며, 기념일에는 세션을 만든다", async () => {
    holidayItems = [
      holidayEvent("2026-11-16", "공휴일\n테스트 공휴일", "2026-11-17"),
      holidayEvent("2026-11-18", "공휴일\n쉬는 날", "2026-11-19"),
      holidayEvent("2026-11-19", "기념일\n테스트 기념일", "2026-11-20"),
    ];
    useCalendar();

    const response = await runCron();

    expect(response.status).toBe(200);
    expect(store.addHolidays).toHaveBeenCalledWith(["2026-11-16", "2026-11-18"]);
    expect(response.body.skipped).toEqual([
      { dateKey: "2026-11-16", reason: "holiday" },
    ]);
    expect(response.body.created).toEqual(
      ALL_REGULAR_DATES.filter((dateKey) => dateKey !== "2026-11-16"),
    );
    expect(store.sessions.has("2026-11-16")).toBe(false);
    expect(store.sessions.has("2026-11-19")).toBe(true);
  });

  it("공휴일 조회가 실패하면 세션을 만들지 않고 5xx로 응답한다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    useCalendar((call) => (call.url.startsWith(holidayListUrlPrefix) ? 500 : 200));

    const response = await runCron();

    expect(response.status).toBe(502);
    expect(store.findOrCreate).not.toHaveBeenCalled();
    expect(store.addHolidays).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("구글 캘린더 설정이 없으면 세션을 만들지 않고 503으로 응답한다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await runCron();

    expect(response.status).toBe(503);
    expect(store.findOrCreate).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("공휴일로 확인된 미래 정기 세션은 빈 세션만 지우고 참여자가 있으면 남긴다", async () => {
    store.addRegular("2026-11-16");
    store.addRegular("2026-11-19", { participantIds: [admin.id] });
    holidayItems = [
      holidayEvent("2026-11-16", "공휴일", "2026-11-17"),
      holidayEvent("2026-11-19", "공휴일", "2026-11-20"),
    ];
    useCalendar();

    const response = await runCron();

    expect(response.status).toBe(200);
    expect(response.body.deleted).toEqual(["2026-11-16"]);
    expect(response.body.skipped).toEqual([
      { dateKey: "2026-11-16", reason: "holiday" },
      { dateKey: "2026-11-19", reason: "holiday" },
    ]);
    expect(store.sessions.has("2026-11-16")).toBe(false);
    expect(store.sessions.get("2026-11-19")?.participantIds).toEqual([admin.id]);
    // 지운 세션의 캘린더 일정도 지운다
    await vi.waitFor(() =>
      expect(fake.calendarCalls).toContainEqual(
        expect.objectContaining({
          method: "DELETE",
          url: expect.stringContaining(
            toCalendarEventId(regularSessionId("2026-11-16")),
          ),
        }),
      ),
    );
  });

  describe("관리자 취소", () => {
    it("오늘 이후 정기 세션을 지우면 취소로 남아 예약 작업·조회·기록 어디서도 다시 만들지 않는다", async () => {
      useCalendar();
      const canceled = store.addRegular("2026-11-16");

      const deleteResponse = await request(app)
        .delete(`/api/admin/match-sessions/${canceled.id}`)
        .set("Authorization", "Bearer admin-token");

      expect(deleteResponse.status).toBe(204);
      expect(store.deleteSession).toHaveBeenCalledWith(canceled.id, {
        cancelRegularFromDateKey: "2026-11-12",
      });
      expect(store.skips.get("2026-11-16")).toBe("canceled");

      const cron = await runCron();
      expect(cron.status).toBe(200);
      expect(cron.body.skipped).toEqual([
        { dateKey: "2026-11-16", reason: "canceled" },
      ]);
      expect(cron.body.created).not.toContain("2026-11-16");

      // 월요 정기 시간대 경기 기록도 세션을 새로 만들지 않는다
      expect(
        await new MatchRepository().findOrCreateRegularSession("2026-11-16"),
      ).toBeUndefined();
      expect(store.sessions.has("2026-11-16")).toBe(false);
    });

    it("지난 정기 세션을 지우면 취소로 남기지 않는다", async () => {
      const past = store.addRegular("2026-11-09");

      const response = await request(app)
        .delete(`/api/admin/match-sessions/${past.id}`)
        .set("Authorization", "Bearer admin-token");

      expect(response.status).toBe(204);
      expect(store.skips.has("2026-11-09")).toBe(false);
    });
  });

  describe("기존 경로", () => {
    it("다가오는 세션 조회의 다음 회차는 공휴일·취소 날짜를 건너뛴다", async () => {
      // 목 22시 이후라 다음 회차는 11-16(월)인데 공휴일이고, 11-19(목)는 취소라 11-23(월)이 다음 회차다
      vi.setSystemTime(new Date("2026-11-12T23:00:00+09:00"));
      store.skips.set("2026-11-16", "holiday");
      store.skips.set("2026-11-19", "canceled");

      const response = await request(app)
        .get("/api/match-sessions/upcoming")
        .set("Authorization", "Bearer token");

      expect(response.status).toBe(200);
      expect(store.findOrCreate.mock.calls.map(([dateKey]) => dateKey)).toEqual([
        "2026-11-16",
        "2026-11-19",
        "2026-11-23",
      ]);
      expect(
        response.body.sessions.map((session: { dateKey: string }) => session.dateKey),
      ).toEqual(["2026-11-23"]);
    });

    it("오늘이 공휴일이면 오늘 정기 세션을 열지 않는다(409)", async () => {
      store.skips.set("2026-11-12", "holiday");

      const response = await request(app)
        .post("/api/match-sessions/regular/today")
        .set("Authorization", "Bearer token");

      expect(response.status).toBe(409);
      expect(store.sessions.size).toBe(0);
    });
  });
});
