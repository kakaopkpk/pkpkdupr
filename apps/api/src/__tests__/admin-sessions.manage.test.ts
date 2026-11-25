import type { Player } from "@pkpkdupr/shared/player";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import { kstDateKeyToDate } from "@pkpkdupr/shared/session";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RegularSessionConflictError,
  RegularSessionSkipExistsError,
  SessionHasMatchesError,
} from "@pkpkdupr/db";
import { db } from "../db";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

// 2026-11-12는 목요일(정기 세션 요일)이다
const thursdayMorning = new Date("2026-11-12T10:00:00+09:00");

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

const customSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Scustom1",
  name: "토요 번개",
  date: kstDateKeyToDate("2026-11-14"),
  location: "야탑초등학교",
  participantIds: [],
  matchCount: 0,
  kind: "custom",
  autoCreated: false,
  startTime: null,
  endTime: null,
  completedAt: null,
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
  ...overrides,
});

const regularSession = (
  dateKey: string,
  autoCreated = true,
): ManagedMatchSession => ({
  id: "Sregular",
  name: "월요 정기운동",
  date: kstDateKeyToDate(dateKey, 18),
  location: "야탑초등학교",
  participantIds: [],
  matchCount: 0,
  kind: "regular",
  autoCreated,
  startTime: "18:00",
  endTime: "22:00",
  completedAt: null,
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
});

const asAdmin = (test: request.Test) =>
  test.set("Authorization", "Bearer admin-token");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(thursdayMorning);
  vi.spyOn(
    AuthService.prototype,
    "authenticateAccessToken",
  ).mockResolvedValue(adminSession);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PATCH /api/admin/match-sessions/:sessionId", () => {
  /** 저장소 조회를 stored로 고정하고, 수정은 받은 값을 덮어쓴 세션을 돌려준다 */
  const mockSession = (stored: ManagedMatchSession) => {
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      stored,
    );
    const updateSession = vi
      .spyOn(db.matches, "updateSession")
      .mockImplementation(async (_sessionId, input) => ({
        ...stored,
        ...Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ),
      }));
    const notify = vi.spyOn(
      MatchRepository.prototype,
      "notifySessionsChanged",
    );
    return { updateSession, notify };
  };

  it("회원 세션의 이름·날짜·시간을 고치고 세션 변경을 알린다", async () => {
    const { updateSession, notify } = mockSession(customSession());

    const response = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({
      name: " 일요 번개 ",
      dateKey: "2026-11-15",
      startTime: "19:00",
      endTime: "21:00",
    });

    expect(response.status).toBe(200);
    expect(updateSession).toHaveBeenCalledWith("Scustom1", {
      name: "일요 번개",
      location: undefined,
      date: kstDateKeyToDate("2026-11-15"),
      startTime: "19:00",
      endTime: "21:00",
      // 날짜·시각이 바뀌면 완료를 되돌린다
      completedAt: null,
    });
    expect(response.body).toMatchObject({
      id: "Scustom1",
      name: "일요 번개",
      date: kstDateKeyToDate("2026-11-15").toISOString(),
      startTime: "19:00",
      endTime: "21:00",
      kind: "custom",
    });
    expect(notify).toHaveBeenCalledWith(["Scustom1"]);
  });

  it("시각을 둘 다 null로 보내면 시각 없는 세션이 되고, 생략하면 그대로 둔다", async () => {
    const { updateSession } = mockSession(
      customSession({ startTime: "19:00", endTime: "21:00" }),
    );

    const cleared = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({ startTime: null, endTime: null });
    expect(cleared.status).toBe(200);
    expect(updateSession).toHaveBeenLastCalledWith(
      "Scustom1",
      expect.objectContaining({
        startTime: null,
        endTime: null,
        completedAt: null,
      }),
    );

    const renamed = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({ location: "탄천 코트" });
    expect(renamed.status).toBe(200);
    expect(updateSession.mock.lastCall?.[1]).not.toHaveProperty("startTime");
    expect(updateSession.mock.lastCall?.[1]).not.toHaveProperty("completedAt");
    expect(updateSession.mock.lastCall?.[1]).toMatchObject({
      location: "탄천 코트",
      date: undefined,
    });
  });

  it.each([
    [{ name: "" }, "세션 이름이 필요합니다."],
    [{ name: "가".repeat(31) }, "세션 이름은 30자 이하여야 합니다."],
    [{ location: " " }, "세션 장소가 필요합니다."],
    [
      { dateKey: "2026-02-30" },
      "세션 날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.",
    ],
    [{ dateKey: "2026-11-11" }, "오늘이나 이후 날짜로만 바꿀 수 있습니다."],
    [
      { startTime: "19:00" },
      "세션 시작·종료 시각은 HH:MM 형식으로 함께 보내고, 서로 달라야 합니다.",
    ],
    [
      { startTime: "19:00", endTime: "19:00" },
      "세션 시작·종료 시각은 HH:MM 형식으로 함께 보내고, 서로 달라야 합니다.",
    ],
  ])("잘못된 값 %o는 400", async (body, error) => {
    const { updateSession } = mockSession(customSession());

    const response = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("오늘로 옮기면서 시작 시각이 지났으면 400이고, 시각을 바꾸지 않은 이름 수정은 된다", async () => {
    const { updateSession } = mockSession(
      customSession({ startTime: "09:00", endTime: "11:00" }),
    );

    const moved = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({ dateKey: "2026-11-12" });
    expect(moved.status).toBe(400);
    expect(updateSession).not.toHaveBeenCalled();

    const today = mockSession(
      customSession({
        date: kstDateKeyToDate("2026-11-12"),
        startTime: "09:00",
        endTime: "11:00",
      }),
    );
    const renamed = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({ name: "아침 번개" });
    expect(renamed.status).toBe(200);
    expect(today.updateSession).toHaveBeenCalled();
  });

  it("정기 세션은 이름을 고치고, 날짜·시각은 409", async () => {
    const { updateSession } = mockSession(regularSession("2026-11-16"));

    const renamed = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Sregular"),
    ).send({ name: "월요 특별운동" });
    expect(renamed.status).toBe(200);
    expect(updateSession).toHaveBeenCalledWith(
      "Sregular",
      expect.objectContaining({ name: "월요 특별운동" }),
    );

    updateSession.mockClear();
    const moved = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Sregular"),
    ).send({ startTime: "19:00", endTime: "21:00" });
    expect(moved.status).toBe(409);
    expect(moved.body).toEqual({
      error: "정기 세션 날짜와 시간은 바꿀 수 없어요.",
    });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("지난 세션은 이름을 고치고, 날짜·시각은 409", async () => {
    const { updateSession } = mockSession(
      customSession({ date: kstDateKeyToDate("2026-11-11") }),
    );

    const renamed = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({ name: "어제 번개" });
    expect(renamed.status).toBe(200);
    expect(updateSession).toHaveBeenCalled();

    updateSession.mockClear();
    const retimed = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({ startTime: "19:00", endTime: "21:00" });
    expect(retimed.status).toBe(409);
    expect(retimed.body).toEqual({
      error: "지난 세션은 날짜와 시간을 바꿀 수 없어요.",
    });
    expect(updateSession).not.toHaveBeenCalled();
  });

  describe("종류 변경", () => {
    const mockKindChange = (stored: ManagedMatchSession) => {
      const { updateSession, notify } = mockSession(stored);
      const changeSessionKind = vi
        .spyOn(db.matches, "changeSessionKind")
        .mockResolvedValue(true);
      return { updateSession, notify, changeSessionKind };
    };

    it("회원 세션을 대회로 바꾸면 종류와 다른 필드를 함께 넘기고 세션 변경을 알린다", async () => {
      const { updateSession, notify, changeSessionKind } = mockKindChange(
        customSession(),
      );

      const response = await asAdmin(
        request(app).patch("/api/admin/match-sessions/Scustom1"),
      ).send({ kind: "tournament", name: "가을 대회" });

      expect(response.status).toBe(200);
      expect(changeSessionKind).toHaveBeenCalledWith(
        "Scustom1",
        "tournament",
        expect.objectContaining({ name: "가을 대회", date: undefined }),
      );
      expect(updateSession).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(["Scustom1"]);
    });

    it("지난 세션도 종류를 바꾼다", async () => {
      const { changeSessionKind } = mockKindChange(
        customSession({ date: kstDateKeyToDate("2026-11-11") }),
      );

      const response = await asAdmin(
        request(app).patch("/api/admin/match-sessions/Scustom1"),
      ).send({ kind: "tournament" });

      expect(response.status).toBe(200);
      expect(changeSessionKind).toHaveBeenCalled();
    });

    it("직접 만든 정기 세션을 다른 종류로 바꾸면서 시각을 고칠 수 있다", async () => {
      const { changeSessionKind } = mockKindChange(
        regularSession("2026-11-16", false),
      );

      const response = await asAdmin(
        request(app).patch("/api/admin/match-sessions/Sregular"),
      ).send({ kind: "custom", startTime: "19:00", endTime: "21:00" });

      expect(response.status).toBe(200);
      expect(changeSessionKind).toHaveBeenCalledWith(
        "Sregular",
        "custom",
        expect.objectContaining({ startTime: "19:00", endTime: "21:00" }),
      );
    });

    it("정기로 바꾸면서 날짜·시각을 보내면 409", async () => {
      const { changeSessionKind } = mockKindChange(
        customSession({ date: kstDateKeyToDate("2026-11-16") }),
      );

      const response = await asAdmin(
        request(app).patch("/api/admin/match-sessions/Scustom1"),
      ).send({ kind: "regular", dateKey: "2026-11-16" });

      expect(response.status).toBe(409);
      expect(changeSessionKind).not.toHaveBeenCalled();
    });

    it("정기 요일(월·목)이 아닌 세션은 정기로 바꿀 수 없다", async () => {
      const { changeSessionKind } = mockKindChange(customSession());

      const response = await asAdmin(
        request(app).patch("/api/admin/match-sessions/Scustom1"),
      ).send({ kind: "regular" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "정기 세션은 월·목에만 둘 수 있어요.",
      });
      expect(changeSessionKind).not.toHaveBeenCalled();
    });

    it("정기로 바꿀 수 없는 날짜면 409", async () => {
      mockSession(customSession({ date: kstDateKeyToDate("2026-11-16") }));
      vi.spyOn(db.matches, "changeSessionKind").mockRejectedValue(
        new RegularSessionConflictError("그 날짜에는 이미 정기 세션이 있어요."),
      );

      const response = await asAdmin(
        request(app).patch("/api/admin/match-sessions/Scustom1"),
      ).send({ kind: "regular" });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: "그 날짜에는 이미 정기 세션이 있어요.",
      });
    });

    it("자동 정기 세션의 종류를 바꾸면 409", async () => {
      mockSession(regularSession("2026-11-16"));
      vi.spyOn(db.matches, "changeSessionKind").mockRejectedValue(
        new RegularSessionConflictError(
          "자동으로 만든 정기 세션은 종류를 바꿀 수 없어요.",
        ),
      );

      const response = await asAdmin(
        request(app).patch("/api/admin/match-sessions/Sregular"),
      ).send({ kind: "tournament" });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: "자동으로 만든 정기 세션은 종류를 바꿀 수 없어요.",
      });
    });

    it("모르는 종류는 400", async () => {
      const { changeSessionKind } = mockKindChange(customSession());

      const response = await asAdmin(
        request(app).patch("/api/admin/match-sessions/Scustom1"),
      ).send({ kind: "league" });

      expect(response.status).toBe(400);
      expect(changeSessionKind).not.toHaveBeenCalled();
    });
  });

  it("경기가 있는 세션은 날짜만 바꿀 수 없다", async () => {
    const { updateSession } = mockSession(customSession({ matchCount: 2 }));

    const moved = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({ dateKey: "2026-11-15" });
    expect(moved.status).toBe(409);
    expect(moved.body).toEqual({
      error: "경기가 있는 세션은 날짜를 바꿀 수 없어요.",
    });
    expect(updateSession).not.toHaveBeenCalled();

    const sameDate = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({
      dateKey: "2026-11-14",
      name: "토요 번개 2",
      startTime: "19:00",
      endTime: "21:00",
    });
    expect(sameDate.status).toBe(200);
    expect(updateSession).toHaveBeenCalledWith(
      "Scustom1",
      expect.objectContaining({ name: "토요 번개 2", date: undefined }),
    );
  });

  it("같은 날 같은 이름이 있으면 409", async () => {
    mockSession(customSession());
    vi.spyOn(db.matches, "updateSession").mockRejectedValue(
      new Error(
        'duplicate key value violates unique constraint "match_sessions_name_date_unique"',
      ),
    );

    const response = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Scustom1"),
    ).send({ name: "중복 이름" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "같은 이름의 세션이 이미 있습니다." });
  });

  it("없는 세션은 404", async () => {
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      undefined,
    );

    const response = await asAdmin(
      request(app).patch("/api/admin/match-sessions/Snone001"),
    ).send({ name: "새 이름" });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/admin/match-sessions", () => {
  const body = {
    name: "가을 대회",
    location: "야탑초등학교",
    dateKey: "2026-11-21",
    startTime: "09:00",
    endTime: "17:00",
  };

  it("대회 세션은 회원 세션과 같은 규칙으로 만들고 종류를 넘긴다", async () => {
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue(
      undefined as never,
    );
    const createSession = vi
      .spyOn(db.matches, "createSession")
      .mockImplementation(async (session) => session);
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      customSession({ id: "Stourn01", kind: "tournament" }),
    );

    const response = await asAdmin(
      request(app).post("/api/admin/match-sessions"),
    ).send({ ...body, kind: "tournament" });

    expect(response.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "가을 대회",
        date: kstDateKeyToDate("2026-11-21"),
        startTime: "09:00",
        endTime: "17:00",
      }),
      "tournament",
    );
    expect(response.body).toMatchObject({ id: "Stourn01", kind: "tournament" });
  });

  it("정기 세션은 그 날짜의 정기 세션으로 만들고 시각은 무시한다", async () => {
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue(
      undefined as never,
    );
    const createRegularSession = vi
      .spyOn(db.matches, "createRegularSession")
      .mockResolvedValue(regularSession("2026-11-19"));
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      regularSession("2026-11-19"),
    );

    const response = await asAdmin(
      request(app).post("/api/admin/match-sessions"),
    ).send({
      ...body,
      kind: "regular",
      dateKey: "2026-11-19",
      startTime: "09:00",
      endTime: "09:00",
    });

    expect(response.status).toBe(201);
    expect(createRegularSession).toHaveBeenCalledWith("2026-11-19", {
      name: "가을 대회",
      location: "야탑초등학교",
    });
  });

  it("정기 세션을 만들 수 없는 날짜면 409", async () => {
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue(
      undefined as never,
    );
    vi.spyOn(db.matches, "createRegularSession").mockRejectedValue(
      new RegularSessionConflictError("쉬는 날에는 정기 세션을 둘 수 없어요."),
    );

    const response = await asAdmin(
      request(app).post("/api/admin/match-sessions"),
    ).send({ ...body, kind: "regular", dateKey: "2026-11-19" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "쉬는 날에는 정기 세션을 둘 수 없어요.",
    });
  });

  it("정기 요일(월·목)이 아닌 날짜로는 정기 세션을 만들지 않는다", async () => {
    const createRegularSession = vi.spyOn(db.matches, "createRegularSession");

    const response = await asAdmin(
      request(app).post("/api/admin/match-sessions"),
    ).send({ ...body, kind: "regular" });

    expect(response.status).toBe(400);
    expect(createRegularSession).not.toHaveBeenCalled();
  });

  it("종류가 없거나 모르는 값이면 400", async () => {
    const createSession = vi.spyOn(db.matches, "createSession");

    for (const kind of [undefined, "league"]) {
      const response = await asAdmin(
        request(app).post("/api/admin/match-sessions"),
      ).send({ ...body, kind });
      expect(response.status).toBe(400);
    }
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("정기 세션 쉬는 날", () => {
  it("GET은 모든 쉬는 날을 날짜 내림차순으로 돌려준다", async () => {
    const findAll = vi
      .spyOn(db.matches, "findAllRegularSessionSkips")
      .mockResolvedValue([
        { dateKey: "2026-12-25", reason: "holiday" },
        { dateKey: "2026-11-16", reason: "canceled" },
        { dateKey: "2026-10-05", reason: "canceled" },
      ]);

    const response = await asAdmin(
      request(app).get("/api/admin/regular-session-skips"),
    );

    expect(response.status).toBe(200);
    expect(findAll).toHaveBeenCalled();
    expect(response.body).toEqual({
      skips: [
        { dateKey: "2026-12-25", reason: "holiday" },
        { dateKey: "2026-11-16", reason: "canceled" },
        { dateKey: "2026-10-05", reason: "canceled" },
      ],
    });
  });

  describe("POST", () => {
    it("정기 요일을 취소로 남기고 그날 지운 빈 정기 세션을 알린다", async () => {
      const add = vi
        .spyOn(db.matches, "addRegularSessionCancellation")
        .mockResolvedValue({ deletedSessionId: "Sregular" });
      const notify = vi.spyOn(
        MatchRepository.prototype,
        "notifySessionsChanged",
      );

      const response = await asAdmin(
        request(app).post("/api/admin/regular-session-skips"),
      ).send({ dateKey: "2026-11-16" });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        dateKey: "2026-11-16",
        reason: "canceled",
      });
      expect(add).toHaveBeenCalledWith("2026-11-16");
      expect(notify).toHaveBeenCalledWith(["Sregular"]);
    });

    it("오늘(정기 요일)도 받는다", async () => {
      const add = vi
        .spyOn(db.matches, "addRegularSessionCancellation")
        .mockResolvedValue({ deletedSessionId: null });

      const response = await asAdmin(
        request(app).post("/api/admin/regular-session-skips"),
      ).send({ dateKey: "2026-11-12" });

      expect(response.status).toBe(201);
      expect(add).toHaveBeenCalledWith("2026-11-12");
    });

    it.each([
      ["2026-11-14", "정기 세션 요일(월·목)만 쉬는 날로 정할 수 있어요."],
      ["2026-11-09", "오늘이나 이후 날짜만 쉬는 날로 정할 수 있어요."],
      ["2026-13-01", "날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다."],
    ])("%s는 400", async (dateKey, error) => {
      const add = vi.spyOn(db.matches, "addRegularSessionCancellation");

      const response = await asAdmin(
        request(app).post("/api/admin/regular-session-skips"),
      ).send({ dateKey });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error });
      expect(add).not.toHaveBeenCalled();
    });

    it("이미 쉬는 날이면 409", async () => {
      vi.spyOn(db.matches, "addRegularSessionCancellation").mockRejectedValue(
        new RegularSessionSkipExistsError(),
      );

      const response = await asAdmin(
        request(app).post("/api/admin/regular-session-skips"),
      ).send({ dateKey: "2026-11-16" });

      expect(response.status).toBe(409);
    });

    it("그날 정기 세션에 경기가 있으면 409이고 알리지 않는다", async () => {
      vi.spyOn(db.matches, "addRegularSessionCancellation").mockRejectedValue(
        new SessionHasMatchesError(),
      );
      const notify = vi.spyOn(
        MatchRepository.prototype,
        "notifySessionsChanged",
      );

      const response = await asAdmin(
        request(app).post("/api/admin/regular-session-skips"),
      ).send({ dateKey: "2026-11-16" });

      expect(response.status).toBe(409);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe("DELETE", () => {
    const mockSkip = (
      dateKey: string,
      reason: "holiday" | "canceled" | null,
    ) => {
      vi.spyOn(db.matches, "findRegularSessionSkips").mockImplementation(
        async (from, to) =>
          reason && dateKey >= from && dateKey < to
            ? [{ dateKey, reason }]
            : [],
      );
      const remove = vi
        .spyOn(db.matches, "deleteRegularSessionCancellation")
        .mockResolvedValue(reason === "canceled");
      const findOrCreate = vi
        .spyOn(db.matches, "findOrCreateRegularSession")
        .mockImplementation(async (key) => ({
          session: regularSession(key),
          created: true,
        }));
      return { remove, findOrCreate };
    };

    it("취소를 되돌리고 그 날짜의 정기 세션을 바로 만든다", async () => {
      // 28일 범위 밖 날짜도 바로 만든다
      const { remove, findOrCreate } = mockSkip("2026-12-28", "canceled");

      const response = await asAdmin(
        request(app).delete("/api/admin/regular-session-skips/2026-12-28"),
      );

      expect(response.status).toBe(200);
      expect(remove).toHaveBeenCalledWith("2026-12-28");
      expect(findOrCreate).toHaveBeenCalledWith("2026-12-28");
      expect(response.body.session).toMatchObject({
        id: "Sregular",
        kind: "regular",
        date: kstDateKeyToDate("2026-12-28", 18).toISOString(),
      });
    });

    it("공휴일은 409", async () => {
      const { remove } = mockSkip("2026-12-24", "holiday");

      const response = await asAdmin(
        request(app).delete("/api/admin/regular-session-skips/2026-12-24"),
      );

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: "공휴일은 되돌릴 수 없어요." });
      expect(remove).not.toHaveBeenCalled();
    });

    it("지난 날짜는 409", async () => {
      const { remove } = mockSkip("2026-11-09", "canceled");

      const response = await asAdmin(
        request(app).delete("/api/admin/regular-session-skips/2026-11-09"),
      );

      expect(response.status).toBe(409);
      expect(remove).not.toHaveBeenCalled();
    });

    it("없으면 404", async () => {
      mockSkip("2026-11-16", null);

      const response = await asAdmin(
        request(app).delete("/api/admin/regular-session-skips/2026-11-16"),
      );

      expect(response.status).toBe(404);
    });

    it("오늘 22시 이후면 되돌리기만 하고 세션은 만들지 않는다", async () => {
      vi.setSystemTime(new Date("2026-11-12T22:30:00+09:00"));
      const { remove, findOrCreate } = mockSkip("2026-11-12", "canceled");

      const response = await asAdmin(
        request(app).delete("/api/admin/regular-session-skips/2026-11-12"),
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ session: null });
      expect(remove).toHaveBeenCalledWith("2026-11-12");
      expect(findOrCreate).not.toHaveBeenCalled();
    });
  });
});

describe("비관리자", () => {
  it.each([
    ["patch", "/api/admin/match-sessions/Scustom1"],
    ["post", "/api/admin/match-sessions"],
    ["get", "/api/admin/regular-session-skips"],
    ["post", "/api/admin/regular-session-skips"],
    ["delete", "/api/admin/regular-session-skips/2026-11-16"],
  ] as const)("%s %s는 403", async (method, path) => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue({
      ...adminSession,
      payload: { playerId: admin.id, isAdmin: false },
    });
    const updateSession = vi.spyOn(db.matches, "updateSession");
    const add = vi.spyOn(db.matches, "addRegularSessionCancellation");
    const remove = vi.spyOn(db.matches, "deleteRegularSessionCancellation");

    const response = await request(app)
      [method](path)
      .set("Authorization", "Bearer member-token")
      .send({ name: "x", dateKey: "2026-11-16" });

    expect(response.status).toBe(403);
    expect(updateSession).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
