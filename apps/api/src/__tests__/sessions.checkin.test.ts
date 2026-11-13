import type { Player } from "@pkpkdupr/shared/player";
import type { ManagedMatchSession, Session } from "@pkpkdupr/shared/match";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  kstDateKeyToDate,
  MATCH_SESSION_LOCATION_MAX_LENGTH,
  MATCH_SESSION_NAME_MAX_LENGTH,
} from "@pkpkdupr/shared/session";
import { db } from "../db";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

// 2026-11-12는 목요일(정기 세션 요일)이다.
const thursdayMorning = new Date("2026-11-12T10:00:00+09:00");
const thursdayNight = new Date("2026-11-12T22:00:00+09:00");

const makePlayer = (
  id: string,
  overrides: Partial<Player> = {},
): Player => ({
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: { singles: 3.5, doubles: 3.6 },
  createdAt: thursdayMorning,
  updatedAt: thursdayMorning,
  ...overrides,
});

const requester = makePlayer("Pmember1");
const other = makePlayer("Pmember2", { gender: "F", duprRating: null });
const inactive = makePlayer("Pinactiv", { status: "inactive" });

const requesterSession: AuthenticatedSession = {
  payload: { playerId: requester.id, isAdmin: false },
  player: requester,
  isFirstLogin: false,
};

const makeSession = (
  overrides: Partial<ManagedMatchSession> = {},
): ManagedMatchSession => ({
  id: "Scustom1",
  name: "번개",
  date: new Date("2026-11-12T09:00:00+09:00"),
  location: "탄천",
  participantIds: [],
  matchCount: 0,
  kind: "custom",
  startTime: null,
  endTime: null,
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
});

const useNow = (now: Date) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
};

describe("public match sessions", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(requesterSession);
    vi.spyOn(AuthService.prototype, "getPublicPlayers").mockResolvedValue([
      requester,
      other,
    ]);
    vi.spyOn(AuthService.prototype, "getPlayerById").mockImplementation(
      async (playerId) =>
        [requester, other, inactive].find((player) => player.id === playerId),
    );
    vi.spyOn(MatchRepository.prototype, "cleanupExpired").mockResolvedValue();
    useNow(thursdayMorning);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("정기 세션 생성 전에는 오늘 세션 조회만으로 정기 세션을 만들지 않는다", async () => {
    const findOrCreate = vi.spyOn(
      MatchRepository.prototype,
      "findOrCreateRegularSession",
    );
    const findByDateKey = vi
      .spyOn(MatchRepository.prototype, "findSessionsByDateKey")
      .mockResolvedValue([]);

    const response = await request(app)
      .get("/api/match-sessions/today")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      dateKey: "2026-11-12",
      regularSessionOpen: true,
      sessions: [],
    });
    expect(findByDateKey).toHaveBeenCalledWith("2026-11-12");
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it("정기 세션이 있으면 맨 앞에 두고 active 참여자만 평점·성별과 함께 돌려준다", async () => {
    vi.spyOn(
      MatchRepository.prototype,
      "findSessionsByDateKey",
    ).mockImplementation(async (dateKey) =>
      dateKey === "2026-11-12"
        ? [
            makeSession({ participantIds: [other.id, inactive.id] }),
            { ...regularSession, participantIds: [requester.id], matchCount: 2 },
          ]
        : [],
    );

    const response = await request(app)
      .get("/api/match-sessions/today")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      "Sregular",
      "Scustom1",
    ]);
    expect(response.body.sessions[0]).toMatchObject({
      kind: "regular",
      dateKey: "2026-11-12",
      isToday: true,
      matchCount: 2,
      participants: [
        {
          id: requester.id,
          username: requester.username,
          gender: "M",
          duprRating: { singles: 3.5, doubles: 3.6 },
        },
      ],
    });
    expect(response.body.sessions[1].participants).toEqual([
      { id: other.id, username: other.username, gender: "F", duprRating: null },
    ]);
  });

  it("오늘 정기 세션을 find-or-create 한다", async () => {
    const findOrCreate = vi
      .spyOn(MatchRepository.prototype, "findOrCreateRegularSession")
      .mockResolvedValue(regularSession);
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      regularSession,
    );

    const response = await request(app)
      .post("/api/match-sessions/regular/today")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(findOrCreate).toHaveBeenCalledWith("2026-11-12");
    expect(response.body).toMatchObject({
      id: "Sregular",
      kind: "regular",
      isToday: true,
      participants: [],
    });
  });

  it("22시 이후나 정기 요일이 아니면 정기 세션을 열지 않는다(409)", async () => {
    const findOrCreate = vi.spyOn(
      MatchRepository.prototype,
      "findOrCreateRegularSession",
    );

    for (const now of [
      thursdayNight,
      new Date("2026-11-10T10:00:00+09:00"),
    ]) {
      vi.setSystemTime(now);
      const response = await request(app)
        .post("/api/match-sessions/regular/today")
        .set("Authorization", "Bearer token");
      expect(response.status).toBe(409);
    }
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it("dateKey를 생략하면 회원 세션을 오늘 00:00 KST로 만들고 요청자를 자동 체크인하지 않는다", async () => {
    const created: Session = {
      id: "Scustom1",
      name: "번개",
      date: kstDateKeyToDate("2026-11-12"),
      location: "탄천",
    };
    const createSession = vi
      .spyOn(MatchRepository.prototype, "createSession")
      .mockResolvedValue(created);
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      makeSession({ date: thursdayMorning }),
    );
    const addParticipants = vi.spyOn(
      MatchRepository.prototype,
      "addSessionParticipants",
    );

    const response = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({ name: "  번개 ", location: " 탄천 " });

    expect(response.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith(
      {
        name: "번개",
        date: new Date("2026-11-12T00:00:00+09:00"),
        location: "탄천",
        startTime: null,
        endTime: null,
      },
      { conflictOnDuplicate: true },
    );
    expect(addParticipants).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      id: "Scustom1",
      kind: "custom",
      isToday: true,
      participants: [],
    });
  });

  it("전날 시작해 자정을 넘긴 회원 세션은 끝나기 전까지 오늘 세션 목록에 오늘 세션으로 나온다", async () => {
    const overnight = makeSession({
      id: "Snight01",
      name: "심야 번개",
      date: new Date("2026-11-12T00:00:00+09:00"),
      startTime: "23:30",
      endTime: "01:30",
    });
    const sameDayEnded = makeSession({
      id: "Sended01",
      date: new Date("2026-11-12T00:00:00+09:00"),
      startTime: "19:00",
      endTime: "21:00",
    });
    vi.spyOn(MatchRepository.prototype, "findSessionsByDateKey").mockImplementation(
      async (dateKey) => (dateKey === "2026-11-12" ? [overnight, sameDayEnded] : []),
    );

    useNow(new Date("2026-11-13T00:30:00+09:00"));
    const during = await request(app)
      .get("/api/match-sessions/today")
      .set("Authorization", "Bearer token");
    expect(during.status).toBe(200);
    expect(during.body.dateKey).toBe("2026-11-13");
    expect(during.body.sessions).toHaveLength(1);
    expect(during.body.sessions[0]).toMatchObject({
      id: "Snight01",
      dateKey: "2026-11-12",
      isToday: true,
    });

    useNow(new Date("2026-11-13T01:30:00+09:00"));
    const after = await request(app)
      .get("/api/match-sessions/today")
      .set("Authorization", "Bearer token");
    expect(after.body.sessions).toEqual([]);
  });

  it("dateKey로 오늘이나 미래 날짜 세션을 그날 00:00 KST로 만든다", async () => {
    const createSession = vi
      .spyOn(MatchRepository.prototype, "createSession")
      .mockImplementation(async (session) => ({
        id: "Sfuture1",
        name: session.name,
        date: session.date,
        location: session.location,
      }));
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      makeSession({
        id: "Sfuture1",
        date: new Date("2026-11-20T00:00:00+09:00"),
      }),
    );

    for (const dateKey of ["2026-11-12", "2026-11-20"]) {
      const response = await request(app)
        .post("/api/match-sessions")
        .set("Authorization", "Bearer token")
        .send({ name: "번개", location: "탄천", dateKey });
      expect(response.status).toBe(201);
      expect(createSession).toHaveBeenLastCalledWith(
        {
          name: "번개",
          date: new Date(`${dateKey}T00:00:00+09:00`),
          location: "탄천",
          startTime: null,
          endTime: null,
        },
        { conflictOnDuplicate: true },
      );
    }
    const future = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({ name: "번개", location: "탄천", dateKey: "2026-11-20" });
    expect(future.body).toMatchObject({
      id: "Sfuture1",
      dateKey: "2026-11-20",
      isToday: false,
    });
  });

  it("시작·종료 시각을 저장하고 세션 응답에 돌려준다. 날짜 시각은 그날 00:00 KST 그대로다", async () => {
    const createSession = vi
      .spyOn(MatchRepository.prototype, "createSession")
      .mockImplementation(async (session) => ({ id: "Stimed01", ...session }));
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      makeSession({
        id: "Stimed01",
        date: new Date("2026-11-20T00:00:00+09:00"),
        startTime: "19:30",
        endTime: "21:00",
      }),
    );

    const response = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({
        name: "번개",
        location: "탄천",
        dateKey: "2026-11-20",
        startTime: "19:30",
        endTime: "21:00",
      });

    expect(response.status).toBe(201);
    expect(createSession).toHaveBeenCalledWith(
      {
        name: "번개",
        date: new Date("2026-11-20T00:00:00+09:00"),
        location: "탄천",
        startTime: "19:30",
        endTime: "21:00",
      },
      { conflictOnDuplicate: true },
    );
    expect(response.body).toMatchObject({
      id: "Stimed01",
      startTime: "19:30",
      endTime: "21:00",
    });
  });

  it("종료가 시작보다 이르면 다음 날 종료로 그대로 저장한다", async () => {
    const createSession = vi
      .spyOn(MatchRepository.prototype, "createSession")
      .mockImplementation(async (session) => ({ id: "Snight01", ...session }));
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      makeSession({
        id: "Snight01",
        date: new Date("2026-11-20T00:00:00+09:00"),
        startTime: "23:30",
        endTime: "01:30",
      }),
    );

    const response = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({
        name: "심야 번개",
        location: "탄천",
        dateKey: "2026-11-20",
        startTime: "23:30",
        endTime: "01:30",
      });

    expect(response.status).toBe(201);
    // 세션 날짜는 시작 시각의 날짜(11월 20일)다
    expect(createSession).toHaveBeenCalledWith(
      {
        name: "심야 번개",
        date: new Date("2026-11-20T00:00:00+09:00"),
        location: "탄천",
        startTime: "23:30",
        endTime: "01:30",
      },
      { conflictOnDuplicate: true },
    );
    expect(response.body).toMatchObject({
      dateKey: "2026-11-20",
      startTime: "23:30",
      endTime: "01:30",
    });
  });

  it("오늘 세션의 시작 시각이 이미 지났으면 400, 미래 날짜는 이른 시각도 된다", async () => {
    const createSession = vi
      .spyOn(MatchRepository.prototype, "createSession")
      .mockImplementation(async (session) => ({ id: "Searly01", ...session }));
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      makeSession({ id: "Searly01" }),
    );

    const past = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({ name: "번개", location: "탄천", startTime: "06:00", endTime: "08:00" });
    expect(past.status).toBe(400);
    expect(past.body).toEqual({
      error: "이미 지난 시각으로는 세션을 만들 수 없습니다.",
    });
    expect(createSession).not.toHaveBeenCalled();

    const future = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({
        name: "새벽 번개",
        location: "탄천",
        dateKey: "2026-11-13",
        startTime: "06:00",
        endTime: "08:00",
      });
    expect(future.status).toBe(201);
  });

  it("시작·종료 시각 중 하나만 있거나 형식이 틀리거나 서로 같으면 400", async () => {
    const createSession = vi.spyOn(MatchRepository.prototype, "createSession");

    for (const time of [
      { startTime: "19:00" },
      { endTime: "21:00" },
      { startTime: "7:00", endTime: "9:00" },
      { startTime: "24:00", endTime: "24:30" },
      { startTime: "19:00", endTime: 2100 },
      { startTime: "21:00", endTime: "21:00" },
    ]) {
      const response = await request(app)
        .post("/api/match-sessions")
        .set("Authorization", "Bearer token")
        .send({ name: "번개", location: "탄천", ...time });
      expect(response.status).toBe(400);
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("dateKey 형식이 틀리거나 없는 날짜면 400, 오늘보다 이르면 400", async () => {
    const createSession = vi.spyOn(MatchRepository.prototype, "createSession");

    for (const dateKey of ["2026/11/20", "2026-02-30", "내일", 20261120]) {
      const response = await request(app)
        .post("/api/match-sessions")
        .set("Authorization", "Bearer token")
        .send({ name: "번개", location: "탄천", dateKey });
      expect(response.status).toBe(400);
    }

    const past = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({ name: "번개", location: "탄천", dateKey: "2026-11-11" });
    expect(past.status).toBe(400);
    expect(past.body).toEqual({
      error: "오늘이나 이후 날짜로만 세션을 만들 수 있습니다.",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("회원 세션 이름·장소가 비어 있으면 400", async () => {
    const createSession = vi.spyOn(MatchRepository.prototype, "createSession");

    for (const body of [
      { name: " ", location: "탄천" },
      { name: "번개", location: "" },
    ]) {
      const response = await request(app)
        .post("/api/match-sessions")
        .set("Authorization", "Bearer token")
        .send(body);
      expect(response.status).toBe(400);
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("회원 세션 이름·장소가 상한을 넘으면 400, 상한 글자 수는 허용한다", async () => {
    const createSession = vi
      .spyOn(MatchRepository.prototype, "createSession")
      .mockResolvedValue({
        id: "Scustom1",
        name: "번개",
        date: thursdayMorning,
        location: "탄천",
      });
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockResolvedValue(
      makeSession({ date: thursdayMorning }),
    );
    const tooLong = "가".repeat(MATCH_SESSION_NAME_MAX_LENGTH + 1);

    const longName = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({ name: tooLong, location: "탄천" });
    expect(longName.status).toBe(400);
    expect(longName.body.error).toBe(
      `세션 이름은 ${MATCH_SESSION_NAME_MAX_LENGTH}자 이하여야 합니다.`,
    );

    const longLocation = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({ name: "번개", location: tooLong });
    expect(longLocation.status).toBe(400);
    expect(longLocation.body.error).toBe(
      `세션 장소는 ${MATCH_SESSION_LOCATION_MAX_LENGTH}자 이하여야 합니다.`,
    );
    expect(createSession).not.toHaveBeenCalled();

    // 코드 포인트 단위로 세므로 이모지 30개는 통과한다.
    const atLimit = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({
        name: "🏓".repeat(MATCH_SESSION_NAME_MAX_LENGTH),
        location: "가".repeat(MATCH_SESSION_LOCATION_MAX_LENGTH),
      });
    expect(atLimit.status).toBe(201);
  });

  it("같은 이름·같은 시각의 (name, date) 유니크 위반이면 DB 원문 대신 안내 메시지로 409", async () => {
    vi.spyOn(db.matches, "createSession").mockRejectedValue(
      Object.assign(
        new Error(
          'duplicate key value violates unique constraint "match_sessions_name_date_unique"',
        ),
        { code: "23505", constraint_name: "match_sessions_name_date_unique" },
      ),
    );

    const response = await request(app)
      .post("/api/match-sessions")
      .set("Authorization", "Bearer token")
      .send({ name: "번개", location: "탄천" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "같은 이름의 세션이 이미 있습니다." });
  });

  it("세션 상세는 지난 세션도 조회하고, 없으면 404·형식 오류면 400", async () => {
    vi.spyOn(MatchRepository.prototype, "findSessionById").mockImplementation(
      async (sessionId) =>
        sessionId === "Spast001"
          ? makeSession({
              id: "Spast001",
              date: new Date("2026-11-09T18:00:00+09:00"),
            })
          : undefined,
    );

    const past = await request(app)
      .get("/api/match-sessions/Spast001")
      .set("Authorization", "Bearer token");
    expect(past.status).toBe(200);
    expect(past.body).toMatchObject({ dateKey: "2026-11-09", isToday: false });

    const missing = await request(app)
      .get("/api/match-sessions/Snone001")
      .set("Authorization", "Bearer token");
    expect(missing.status).toBe(404);

    const invalid = await request(app)
      .get("/api/match-sessions/not-a-session")
      .set("Authorization", "Bearer token");
    expect(invalid.status).toBe(400);
  });

  describe("다가오는 세션 조회", () => {
    const upcoming = () =>
      request(app)
        .get("/api/match-sessions/upcoming")
        .set("Authorization", "Bearer token");

    it("다음 정기 회차를 find-or-create 하고, 반복 조회에도 같은 세션 하나만 돌려준다", async () => {
      const stored: ManagedMatchSession[] = [];
      const findOrCreate = vi
        .spyOn(MatchRepository.prototype, "findOrCreateRegularSession")
        .mockImplementation(async (dateKey) => {
          let session = stored.find(
            (candidate) =>
              candidate.kind === "regular" &&
              candidate.date.getTime() ===
                kstDateKeyToDate(dateKey, 18).getTime(),
          );
          if (!session) {
            session = makeSession({
              id: "Snextreg",
              name: "월요 정기운동",
              kind: "regular",
              date: kstDateKeyToDate(dateKey, 18),
              location: "야탑초등학교",
            });
            stored.push(session);
          }
          return session;
        });
      const findFrom = vi
        .spyOn(MatchRepository.prototype, "findSessionsFromDateKey")
        .mockImplementation(async () => [...stored]);
      // 목 22:00 이후에는 다음 월요일이 다음 정기 회차다
      vi.setSystemTime(thursdayNight);

      const first = await upcoming();
      const second = await upcoming();

      for (const response of [first, second]) {
        expect(response.status).toBe(200);
        expect(response.body.dateKey).toBe("2026-11-12");
        expect(response.body.sessions).toHaveLength(1);
        expect(response.body.sessions[0]).toMatchObject({
          id: "Snextreg",
          kind: "regular",
          name: "월요 정기운동",
          dateKey: "2026-11-16",
          isToday: false,
        });
      }
      expect(findOrCreate).toHaveBeenCalledTimes(2);
      expect(findOrCreate).toHaveBeenCalledWith("2026-11-16");
      // 전날 시작해 자정을 넘긴 세션도 보이도록 전날부터 읽는다
      expect(findFrom).toHaveBeenCalledWith("2026-11-11");
    });

    it("정기 요일 22시 전이면 오늘 정기 세션을 보장한다", async () => {
      const findOrCreate = vi
        .spyOn(MatchRepository.prototype, "findOrCreateRegularSession")
        .mockResolvedValue(regularSession);
      vi.spyOn(
        MatchRepository.prototype,
        "findSessionsFromDateKey",
      ).mockResolvedValue([regularSession]);

      const response = await upcoming();

      expect(response.status).toBe(200);
      expect(findOrCreate).toHaveBeenCalledWith("2026-11-12");
      expect(response.body.sessions[0]).toMatchObject({
        id: "Sregular",
        isToday: true,
      });
    });

    it("날짜 키 오름차순, 같은 날은 정기 세션 먼저, 만료된 세션은 빼고 정렬한다", async () => {
      const nextMonday = makeSession({
        id: "Smonreg1",
        name: "월요 정기운동",
        kind: "regular",
        date: new Date("2026-11-16T18:00:00+09:00"),
      });
      vi.spyOn(
        MatchRepository.prototype,
        "findOrCreateRegularSession",
      ).mockResolvedValue(nextMonday);
      // 저장소는 시각 오름차순으로 준다
      vi.spyOn(
        MatchRepository.prototype,
        "findSessionsFromDateKey",
      ).mockResolvedValue([
        makeSession({
          id: "Stoday01",
          date: new Date("2026-11-12T00:00:00+09:00"),
        }),
        { ...regularSession, matchCount: 1 },
        makeSession({
          id: "Sfri0001",
          date: new Date("2026-11-13T00:00:00+09:00"),
        }),
        makeSession({
          id: "Smon0001",
          date: new Date("2026-11-16T00:00:00+09:00"),
        }),
        nextMonday,
      ]);
      // 목 22:00이면 오늘 정기 세션은 만료됐고 오늘 회원 세션은 자정까지 남는다
      vi.setSystemTime(thursdayNight);

      const response = await upcoming();

      expect(response.status).toBe(200);
      expect(
        response.body.sessions.map((session: { id: string }) => session.id),
      ).toEqual(["Stoday01", "Sfri0001", "Smonreg1", "Smon0001"]);
    });
  });

  describe("참여자 추가·삭제", () => {
    let participantIds: Set<string>;
    let sessionDate: Date;

    beforeEach(() => {
      participantIds = new Set();
      sessionDate = new Date("2026-11-12T09:00:00+09:00");
      vi.spyOn(
        MatchRepository.prototype,
        "findSessionById",
      ).mockImplementation(async () =>
        makeSession({ date: sessionDate, participantIds: [...participantIds] }),
      );
      vi.spyOn(
        MatchRepository.prototype,
        "addSessionParticipants",
      ).mockImplementation(async (_sessionId, playerIds) => {
        playerIds.forEach((playerId) => participantIds.add(playerId));
      });
      vi.spyOn(
        MatchRepository.prototype,
        "removeSessionParticipant",
      ).mockImplementation(async (_sessionId, playerId) => {
        participantIds.delete(playerId);
      });
    });

    const add = (playerId: string) =>
      request(app)
        .post("/api/match-sessions/Scustom1/participants")
        .set("Authorization", "Bearer token")
        .send({ playerId });

    const remove = (playerId: string) =>
      request(app)
        .delete(`/api/match-sessions/Scustom1/participants/${playerId}`)
        .set("Authorization", "Bearer token");

    it("다른 회원도 대신 추가할 수 있고, 같은 회원을 다시 추가해도 200(멱등)", async () => {
      const first = await add(other.id);
      expect(first.status).toBe(200);
      expect(first.body.participants.map((p: { id: string }) => p.id)).toEqual([
        other.id,
      ]);

      const again = await add(other.id);
      expect(again.status).toBe(200);
      expect(again.body.participants).toHaveLength(1);
    });

    it("동시 추가 요청은 전체 교체 없이 개별 추가만 써서 둘 다 남는다", async () => {
      const replace = vi.spyOn(
        MatchRepository.prototype,
        "replaceSessionParticipants",
      );

      const responses = await Promise.all([add(requester.id), add(other.id)]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect([...participantIds].sort()).toEqual(
        [requester.id, other.id].sort(),
      );
      expect(replace).not.toHaveBeenCalled();
    });

    it("참여자를 삭제하고, 참여 중이 아니어도 200(멱등)", async () => {
      participantIds.add(other.id);

      const removed = await remove(other.id);
      expect(removed.status).toBe(200);
      expect(removed.body.participants).toEqual([]);

      const again = await remove(other.id);
      expect(again.status).toBe(200);
    });

    it("미래 세션도 추가·삭제할 수 있다", async () => {
      sessionDate = new Date("2026-11-16T18:00:00+09:00");

      const added = await add(other.id);
      expect(added.status).toBe(200);
      expect(added.body).toMatchObject({
        dateKey: "2026-11-16",
        isToday: false,
        participants: [{ id: other.id }],
      });

      const removed = await remove(other.id);
      expect(removed.status).toBe(200);
      expect(removed.body.participants).toEqual([]);
    });

    it("지난 세션이면 추가·삭제 모두 403", async () => {
      sessionDate = new Date("2026-11-09T18:00:00+09:00");

      const added = await add(other.id);
      expect(added.status).toBe(403);
      expect(added.body).toEqual({
        error: "지난 세션은 참여자를 바꿀 수 없습니다.",
      });
      expect((await remove(other.id)).status).toBe(403);
      expect(
        MatchRepository.prototype.addSessionParticipants,
      ).not.toHaveBeenCalled();
      expect(
        MatchRepository.prototype.removeSessionParticipant,
      ).not.toHaveBeenCalled();
    });

    it("inactive·없는 회원은 추가하지 않는다(400)", async () => {
      expect((await add(inactive.id)).status).toBe(400);
      expect((await add("Pnobody1")).status).toBe(400);
      expect((await add("")).status).toBe(400);
      expect(
        MatchRepository.prototype.addSessionParticipants,
      ).not.toHaveBeenCalled();
    });
  });
});
