import type { Player } from "@pkpkdupr/shared/player";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
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
import { toCalendarEventId } from "../services/SessionCalendarSync";
import {
  createFakeGoogleFetch,
  createTestServiceAccountJson,
  type RecordedCalendarCall,
} from "./googleCalendarFake";

// 2026-11-12는 목요일(정기 세션 요일)이다.
const thursdayMorning = new Date("2026-11-12T10:00:00+09:00");

const makePlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  isGuest: false,
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
  ...overrides,
});

const member = makePlayer("Pmember1", { username: "brad.ley" });
const guest = makePlayer("Pguest01", {
  username: "mina.k",
  gender: null,
  isGuest: true,
});

const memberSession: AuthenticatedSession = {
  payload: { playerId: member.id, isAdmin: true },
  player: member,
  isFirstLogin: false,
};

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Scustom1",
  name: "번개",
  date: new Date("2026-11-12T00:00:00+09:00"),
  location: "탄천",
  participantIds: [],
  matchCount: 0,
  kind: "custom",
  startTime: "19:00",
  endTime: "21:00",
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
  ...overrides,
});

const regularSession = makeSession({
  id: "Sregular",
  name: "목요 정기운동",
  date: new Date("2026-11-12T18:00:00+09:00"),
  location: "야탑초등학교",
  kind: "regular",
  startTime: "18:00",
  endTime: "22:00",
});

const CALENDAR_ID = "club@group.calendar.google.com";
const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;

/** 응답이 끝난 뒤 백그라운드 반영이 일어날 시간을 준다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

let serviceAccountJson: string;

beforeAll(async () => {
  serviceAccountJson = await createTestServiceAccountJson();
});

describe("세션 변경의 구글 캘린더 반영", () => {
  let fake: ReturnType<typeof createFakeGoogleFetch>;
  let currentSession: ManagedMatchSession | undefined;

  const useCalendar = (
    responder?: (call: RecordedCalendarCall) => number,
  ) => {
    vi.stubEnv("GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", serviceAccountJson);
    vi.stubEnv("GOOGLE_CALENDAR_ID", CALENDAR_ID);
    vi.stubEnv("WEB_APP_URL", "https://club.example.com/");
    fake = createFakeGoogleFetch(responder);
    vi.stubGlobal("fetch", fake.fetchMock);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(thursdayMorning);
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(memberSession);
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([
      member,
      guest,
    ]);
    vi.spyOn(AuthService.prototype, "getAllPlayers").mockResolvedValue([
      member,
      guest,
    ]);
    vi.spyOn(AuthService.prototype, "getPlayerById").mockImplementation(
      async (playerId) => [member, guest].find((p) => p.id === playerId),
    );
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    currentSession = makeSession();
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) =>
        currentSession?.id === sessionId ? currentSession : undefined,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("회원 세션을 만들면 그 세션 일정을 만든다", async () => {
    useCalendar();
    vi.spyOn(db.matches, "createSession").mockResolvedValue({
      id: "Scustom1",
      name: "번개",
      date: new Date("2026-11-12T00:00:00+09:00"),
      location: "탄천",
      startTime: "19:00",
      endTime: "21:00",
    });

    const response = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({
        name: "번개",
        location: "탄천",
        startTime: "19:00",
        endTime: "21:00",
      });

    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(1));
    expect(fake.calendarCalls[0]).toMatchObject({
      method: "POST",
      url: eventsUrl,
      body: {
        id: toCalendarEventId("Scustom1"),
        summary: "번개 (0명)",
        location: "탄천",
        start: { dateTime: "2026-11-12T19:00:00", timeZone: "Asia/Seoul" },
        end: { dateTime: "2026-11-12T21:00:00", timeZone: "Asia/Seoul" },
      },
    });
    expect(fake.calendarCalls[0]!.body).not.toHaveProperty("attendees");
  });

  it("관리자가 세션을 만들어도 일정을 만든다", async () => {
    useCalendar();
    vi.spyOn(db.matches, "createSession").mockResolvedValue({
      id: "Scustom1",
      name: "번개",
      date: new Date("2026-11-12T00:00:00+09:00"),
      location: "탄천",
    });

    const response = await request(app)
      .post("/api/admin/match-sessions")
      .set("Authorization", "Bearer token")
      .send({
        name: "번개",
        date: "2026-11-11T15:00:00.000Z",
        location: "탄천",
      });

    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(1));
    expect(fake.calendarCalls[0]).toMatchObject({
      method: "POST",
      body: { id: toCalendarEventId("Scustom1") },
    });
  });

  it("다가오는 세션 조회는 정기 세션을 새로 만들었을 때만 일정을 쓴다", async () => {
    useCalendar();
    currentSession = regularSession;
    vi.spyOn(
      MatchRepository.prototype,
      "findSessionsFromDateKey",
    ).mockResolvedValue([regularSession]);
    const findOrCreate = vi
      .spyOn(db.matches, "findOrCreateRegularSession")
      .mockResolvedValue({ session: regularSession, created: false });

    const existing = await request(app)
      .get("/api/match-sessions/upcoming")
      .set("Authorization", "Bearer token");
    expect(existing.status).toBe(200);
    await settle();
    expect(fake.fetchMock).not.toHaveBeenCalled();

    findOrCreate.mockResolvedValue({ session: regularSession, created: true });
    const created = await request(app)
      .get("/api/match-sessions/upcoming")
      .set("Authorization", "Bearer token");
    expect(created.status).toBe(200);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(1));
    expect(fake.calendarCalls[0]).toMatchObject({
      method: "POST",
      body: {
        id: toCalendarEventId("Sregular"),
        summary: "목요 정기운동 (0명)",
        start: { dateTime: "2026-11-12T18:00:00", timeZone: "Asia/Seoul" },
        end: { dateTime: "2026-11-12T22:00:00", timeZone: "Asia/Seoul" },
      },
    });
  });

  it("참여자를 추가하면 이미 있는 일정을 최신 명단으로 덮어쓴다", async () => {
    useCalendar((call) => (call.method === "POST" ? 409 : 200));
    vi.spyOn(db.matches, "addSessionParticipants").mockImplementation(
      async () => {
        currentSession = makeSession({ participantIds: [member.id] });
        return true;
      },
    );

    const response = await request(app)
      .post("/api/match-sessions/Scustom1/participants")
      .set("Authorization", "Bearer token")
      .send({ playerId: member.id });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(2));
    expect(fake.calendarCalls[1]).toMatchObject({
      method: "PATCH",
      url: `${eventsUrl}/${toCalendarEventId("Scustom1")}`,
      body: {
        summary: "번개 (1명)",
        status: "confirmed",
        description: expect.stringContaining("회원 1: brad.ley"),
      },
    });
  });

  it("이미 참여 중이라 바뀐 게 없으면 일정을 쓰지 않는다", async () => {
    useCalendar();
    vi.spyOn(db.matches, "addSessionParticipants").mockResolvedValue(false);

    const response = await request(app)
      .post("/api/match-sessions/Scustom1/participants")
      .set("Authorization", "Bearer token")
      .send({ playerId: member.id });

    expect(response.status).toBe(200);
    await settle();
    expect(fake.fetchMock).not.toHaveBeenCalled();
  });

  it("게스트를 추가하면 게스트 줄이 있는 일정을 쓴다", async () => {
    useCalendar();
    vi.spyOn(AuthService.prototype, "createGuestPlayer").mockResolvedValue(
      guest,
    );
    vi.spyOn(db.matches, "addSessionParticipants").mockImplementation(
      async () => {
        currentSession = makeSession({ participantIds: [member.id, guest.id] });
        return true;
      },
    );

    const response = await request(app)
      .post("/api/match-sessions/Scustom1/guests")
      .set("Authorization", "Bearer token")
      .send({ username: guest.username });

    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(1));
    expect(fake.calendarCalls[0]!.body).toMatchObject({
      summary: "번개 (2명)",
      description: [
        "참석 2명",
        "회원 1: brad.ley",
        "게스트 1: mina.k",
        "",
        "앱에서 참석·명단 보기",
        "https://club.example.com/",
        "",
        "이 설명은 앱이 자동으로 바꿉니다. 직접 고친 내용은 지워집니다.",
      ].join("\n"),
    });
  });

  it("참여자를 빼면 일정을 고친다", async () => {
    useCalendar();
    currentSession = makeSession({ participantIds: [member.id] });
    vi.spyOn(db.matches, "removeSessionParticipant").mockImplementation(
      async () => {
        currentSession = makeSession();
        return true;
      },
    );

    const response = await request(app)
      .delete(`/api/match-sessions/Scustom1/participants/${member.id}`)
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(1));
    expect(fake.calendarCalls[0]!.body).toMatchObject({ summary: "번개 (0명)" });
  });

  it("관리자가 참여자를 교체하면 일정을 고친다", async () => {
    useCalendar();
    vi.spyOn(db.matches, "replaceSessionParticipants").mockImplementation(
      async () => {
        currentSession = makeSession({ participantIds: [member.id] });
        return currentSession;
      },
    );

    const response = await request(app)
      .put("/api/admin/match-sessions/Scustom1/participants")
      .set("Authorization", "Bearer token")
      .send({ playerIds: [member.id] });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(1));
    expect(fake.calendarCalls[0]!.body).toMatchObject({ summary: "번개 (1명)" });
  });

  it("관리자가 세션을 지우면 일정을 지운다", async () => {
    useCalendar();
    vi.spyOn(db.matches, "deleteSession").mockImplementation(async () => {
      currentSession = undefined;
      return true;
    });

    const response = await request(app)
      .delete("/api/admin/match-sessions/Scustom1")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(204);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(1));
    expect(fake.calendarCalls[0]).toEqual({
      method: "DELETE",
      url: `${eventsUrl}/${toCalendarEventId("Scustom1")}`,
      body: undefined,
    });
  });

  it("조회 시점 정리가 지운 빈 세션의 일정을 지운다", async () => {
    useCalendar();
    vi.mocked(MatchRepository.prototype.cleanupExpired).mockRestore();
    currentSession = undefined;
    vi.spyOn(
      db.matches,
      "deleteExpiredInProgressMatchesAndEmptySessions",
    ).mockResolvedValue({
      deletedMatchCount: 0,
      deletedSessionCount: 2,
      deletedSessionIds: ["Sold0001", "Sold0002"],
    });
    vi.spyOn(
      MatchRepository.prototype,
      "findSessionsByDateKey",
    ).mockResolvedValue([]);

    const response = await request(app)
      .get("/api/match-sessions/today")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(fake.calendarCalls).toHaveLength(2));
    expect(fake.calendarCalls.map((call) => [call.method, call.url])).toEqual(
      expect.arrayContaining([
        ["DELETE", `${eventsUrl}/${toCalendarEventId("Sold0001")}`],
        ["DELETE", `${eventsUrl}/${toCalendarEventId("Sold0002")}`],
      ]),
    );
  });

  it("설정이 없으면 구글을 호출하지 않는다", async () => {
    fake = createFakeGoogleFetch();
    vi.stubGlobal("fetch", fake.fetchMock);
    vi.stubEnv("GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", "");
    vi.stubEnv("GOOGLE_CALENDAR_ID", CALENDAR_ID);
    vi.spyOn(db.matches, "addSessionParticipants").mockResolvedValue(true);

    const response = await request(app)
      .post("/api/match-sessions/Scustom1/participants")
      .set("Authorization", "Bearer token")
      .send({ playerId: member.id });

    expect(response.status).toBe(200);
    await settle();
    expect(fake.fetchMock).not.toHaveBeenCalled();
  });

  it("캘린더가 실패해도 API 응답은 그대로 성공하고 로그만 남긴다", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    useCalendar(() => 500);
    vi.spyOn(db.matches, "addSessionParticipants").mockResolvedValue(true);

    const response = await request(app)
      .post("/api/match-sessions/Scustom1/participants")
      .set("Authorization", "Bearer token")
      .send({ playerId: member.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: "Scustom1" });
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[CALENDAR] 세션 일정 반영 실패",
        "Scustom1",
        expect.any(Error),
      ),
    );
  });
});
