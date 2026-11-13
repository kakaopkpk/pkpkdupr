import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createGoogleCalendarClient,
  readGoogleCalendarConfig,
  type GoogleCalendarClient,
  type GoogleCalendarConfig,
} from "../services/GoogleCalendarClient";
import {
  buildSessionCalendarEvent,
  createSessionCalendarSync,
  toCalendarEventId,
  type CalendarSessionSnapshot,
} from "../services/SessionCalendarSync";
import {
  createFakeGoogleFetch,
  createTestServiceAccountJson,
} from "./googleCalendarFake";

const makeSnapshot = (
  overrides: Partial<CalendarSessionSnapshot> = {},
): CalendarSessionSnapshot => ({
  id: "Sregular",
  name: "목요 정기운동",
  kind: "regular",
  location: "야탑초등학교",
  dateKey: "2026-11-12",
  startTime: "18:00",
  endTime: "22:00",
  participants: [],
  ...overrides,
});

const NOTICE = "이 설명은 앱이 자동으로 바꿉니다. 직접 고친 내용은 지워집니다.";

describe("buildSessionCalendarEvent", () => {
  it("제목은 '<세션 이름> (N명)'이고 N은 회원+게스트 수다", () => {
    const event = buildSessionCalendarEvent(
      makeSnapshot({
        participants: [
          { username: "brad.ley", isGuest: false },
          { username: "colin.34", isGuest: false },
          { username: "mina.k", isGuest: true },
        ],
      }),
    );

    expect(event.summary).toBe("목요 정기운동 (3명)");
    expect(event.location).toBe("야탑초등학교");
    expect(event).not.toHaveProperty("attendees");
  });

  it("설명은 참석 수·회원·게스트 명단·앱 링크·자동 수정 안내 순서다", () => {
    const event = buildSessionCalendarEvent(
      makeSnapshot({
        participants: [
          { username: "brad.ley", isGuest: false },
          { username: "mina.k", isGuest: true },
          { username: "colin.34", isGuest: false },
          { username: "jay.park", isGuest: true },
        ],
      }),
      "https://club.example.com/pkpkdupr/",
    );

    expect(event.description).toBe(
      [
        "참석 4명",
        "회원 2: brad.ley, colin.34",
        "게스트 2: mina.k, jay.park",
        "",
        "앱에서 참석·명단 보기",
        "https://club.example.com/pkpkdupr/",
        "",
        NOTICE,
      ].join("\n"),
    );
  });

  it("게스트가 없으면 게스트 줄을, WEB_APP_URL이 없으면 링크 두 줄을 뺀다", () => {
    const event = buildSessionCalendarEvent(
      makeSnapshot({ participants: [{ username: "brad.ley", isGuest: false }] }),
      "  ",
    );

    expect(event.description).toBe(
      ["참석 1명", "회원 1: brad.ley", "", NOTICE].join("\n"),
    );
  });

  it("정기 세션은 18:00~22:00(Asia/Seoul) 시각 일정이다", () => {
    const event = buildSessionCalendarEvent(
      makeSnapshot({ startTime: null, endTime: null }),
    );

    expect(event.start).toEqual({
      dateTime: "2026-11-12T18:00:00",
      timeZone: "Asia/Seoul",
    });
    expect(event.end).toEqual({
      dateTime: "2026-11-12T22:00:00",
      timeZone: "Asia/Seoul",
    });
  });

  it("시작·종료 시각이 있는 회원 세션은 그 시각으로 만든다", () => {
    const event = buildSessionCalendarEvent(
      makeSnapshot({
        kind: "custom",
        name: "번개",
        startTime: "09:30",
        endTime: "12:00",
      }),
    );

    expect(event.start).toEqual({
      dateTime: "2026-11-12T09:30:00",
      timeZone: "Asia/Seoul",
    });
    expect(event.end).toEqual({
      dateTime: "2026-11-12T12:00:00",
      timeZone: "Asia/Seoul",
    });
  });

  it("종료가 시작보다 이르거나 같으면 다음 날 종료다(자정 넘김, 월말 포함)", () => {
    const event = buildSessionCalendarEvent(
      makeSnapshot({
        kind: "custom",
        dateKey: "2026-11-30",
        startTime: "22:00",
        endTime: "01:00",
      }),
    );

    expect(event.start).toEqual({
      dateTime: "2026-11-30T22:00:00",
      timeZone: "Asia/Seoul",
    });
    expect(event.end).toEqual({
      dateTime: "2026-12-01T01:00:00",
      timeZone: "Asia/Seoul",
    });
  });

  it("시각 없는 회원 세션은 그날 종일 일정이다(end.date는 다음 날)", () => {
    const event = buildSessionCalendarEvent(
      makeSnapshot({
        kind: "custom",
        dateKey: "2026-12-31",
        startTime: null,
        endTime: null,
      }),
    );

    expect(event.start).toEqual({ date: "2026-12-31" });
    expect(event.end).toEqual({ date: "2027-01-01" });
  });
});

describe("toCalendarEventId", () => {
  it("세션 id에서 항상 같은 base32hex 소문자 id를 만든다", () => {
    const id = toCalendarEventId("SaB3_x-9");

    expect(id).toBe(toCalendarEventId("SaB3_x-9"));
    expect(id).not.toBe(toCalendarEventId("SaB3_x-8"));
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(id).toBe(`pks${Buffer.from("SaB3_x-9", "utf8").toString("hex")}`);
  });
});

describe("readGoogleCalendarConfig", () => {
  it("서비스 계정 JSON이나 캘린더 ID가 없으면 연동을 끈다", () => {
    expect(readGoogleCalendarConfig({})).toBeNull();
    expect(
      readGoogleCalendarConfig({ GOOGLE_CALENDAR_ID: "club@group.calendar.google.com" }),
    ).toBeNull();
    expect(
      readGoogleCalendarConfig({
        GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: '{"client_email":"a","private_key":"b"}',
      }),
    ).toBeNull();
  });

  it("서비스 계정 JSON이 깨졌으면 로그를 남기고 연동을 끈다", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(
      readGoogleCalendarConfig({
        GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: "{not json",
        GOOGLE_CALENDAR_ID: "club@group.calendar.google.com",
      }),
    ).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("createGoogleCalendarClient", () => {
  let config: GoogleCalendarConfig;
  const event = buildSessionCalendarEvent(makeSnapshot());
  const eventsUrl =
    "https://www.googleapis.com/calendar/v3/calendars/club%40group.calendar.google.com/events";

  beforeAll(async () => {
    config = readGoogleCalendarConfig({
      GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: await createTestServiceAccountJson(),
      GOOGLE_CALENDAR_ID: "club@group.calendar.google.com",
    })!;
  });

  it("서비스 계정 JWT로 토큰을 받고, 토큰은 다시 받지 않는다", async () => {
    const fake = createFakeGoogleFetch();
    const client = createGoogleCalendarClient(config, fake.fetchMock);

    await client.upsertEvent("pks01", event);
    await client.deleteEvent("pks01");

    expect(fake.tokenRequests).toHaveLength(1);
    const form = fake.tokenRequests[0]!;
    expect(form.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    const [header, claims, signature] = form.get("assertion")!.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toMatchObject({
      iss: "calendar-bot@test-project.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("일정을 그 id로 만든다", async () => {
    const fake = createFakeGoogleFetch();
    const client = createGoogleCalendarClient(config, fake.fetchMock);

    await client.upsertEvent("pks01", event);

    expect(fake.calendarCalls).toEqual([
      { method: "POST", url: eventsUrl, body: { id: "pks01", ...event } },
    ]);
  });

  it("같은 id가 이미 있으면(409) 그 id로 덮어쓰고 지워진 일정을 되살린다", async () => {
    const fake = createFakeGoogleFetch((call) =>
      call.method === "POST" ? 409 : 200,
    );
    const client = createGoogleCalendarClient(config, fake.fetchMock);

    await client.upsertEvent("pks01", event);

    expect(fake.calendarCalls[1]).toEqual({
      method: "PATCH",
      url: `${eventsUrl}/pks01`,
      body: {
        ...event,
        start: { date: null, ...event.start },
        end: { date: null, ...event.end },
        status: "confirmed",
      },
    });
  });

  it("고치기·지우기가 404/410이면 무시하고, 그 밖의 실패는 던진다", async () => {
    const gone = createFakeGoogleFetch((call) =>
      call.method === "POST" ? 409 : call.method === "PATCH" ? 404 : 410,
    );
    const goneClient = createGoogleCalendarClient(config, gone.fetchMock);
    await expect(goneClient.upsertEvent("pks01", event)).resolves.toBeUndefined();
    await expect(goneClient.deleteEvent("pks01")).resolves.toBeUndefined();

    const broken = createFakeGoogleFetch(() => 500);
    const brokenClient = createGoogleCalendarClient(config, broken.fetchMock);
    await expect(brokenClient.upsertEvent("pks01", event)).rejects.toThrow(
      /500/,
    );
    await expect(brokenClient.deleteEvent("pks01")).rejects.toThrow(/500/);
  });
});

describe("createSessionCalendarSync", () => {
  const makeClient = () => ({
    upsertEvent: vi.fn<GoogleCalendarClient["upsertEvent"]>(async () => undefined),
    deleteEvent: vi.fn<GoogleCalendarClient["deleteEvent"]>(async () => undefined),
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("연동이 꺼져 있으면 세션을 읽지도 않는다", async () => {
    const loadSession = vi.fn();
    const sync = createSessionCalendarSync({
      getClient: () => null,
      loadSession,
      getWebAppUrl: () => undefined,
    });

    sync.syncSessions(["Sregular"]);
    await sync.whenIdle();

    expect(loadSession).not.toHaveBeenCalled();
  });

  it("세션이 있으면 현재 상태로 일정을 쓰고, 없으면 일정을 지운다", async () => {
    const client = makeClient();
    const waitUntil = vi.fn();
    const sync = createSessionCalendarSync({
      getClient: () => client,
      loadSession: async (sessionId) =>
        sessionId === "Sregular" ? makeSnapshot() : undefined,
      getWebAppUrl: () => "https://club.example.com/",
      waitUntil,
    });

    sync.syncSessions(["Sregular", "Sdeleted"]);
    await sync.whenIdle();

    expect(client.upsertEvent).toHaveBeenCalledWith(
      toCalendarEventId("Sregular"),
      buildSessionCalendarEvent(makeSnapshot(), "https://club.example.com/"),
    );
    expect(client.deleteEvent).toHaveBeenCalledWith(
      toCalendarEventId("Sdeleted"),
    );
    expect(waitUntil).toHaveBeenCalledTimes(2);
  });

  it("호출자에게 기다리지 않게 하고, 시작 전 같은 세션 작업은 하나로 합친다", async () => {
    const client = makeClient();
    const loadSession = vi.fn(async () => makeSnapshot());
    const sync = createSessionCalendarSync({
      getClient: () => client,
      loadSession,
      getWebAppUrl: () => undefined,
    });

    sync.syncSessions(["Sregular"]);
    sync.syncSessions(["Sregular"]);
    expect(loadSession).not.toHaveBeenCalled();
    await sync.whenIdle();

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(client.upsertEvent).toHaveBeenCalledTimes(1);
  });

  it("캘린더 실패는 로그만 남긴다", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const client = makeClient();
    client.upsertEvent.mockRejectedValue(new Error("calendar down"));
    const sync = createSessionCalendarSync({
      getClient: () => client,
      loadSession: async () => makeSnapshot(),
      getWebAppUrl: () => undefined,
    });

    sync.syncSessions(["Sregular"]);
    await expect(sync.whenIdle()).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "[CALENDAR] 세션 일정 반영 실패",
      "Sregular",
      expect.any(Error),
    );
  });
});
