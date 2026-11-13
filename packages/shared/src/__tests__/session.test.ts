import { describe, expect, it } from "vitest";
import { isMatchInProgress } from "../match";
import {
  canOpenRegularSession,
  getEmptySessionExpiresAt,
  getEmptySessionExpiryCutoff,
  getNextRegularSessionDateKey,
  getSessionDurationMinutes,
  isOvernightSessionTimeRange,
  getRegularSessionName,
  IN_PROGRESS_MATCH_TIMEOUT_MS,
  isInProgressMatchExpired,
  isRegularSessionTime,
  isValidKstDateKey,
  formatSessionTimeRange,
  isValidSessionTime,
  isValidSessionTimeRange,
  kstDateKeyTimeToDate,
  kstDateKeyToDate,
  minutesToSessionTime,
  REGULAR_SESSION_END_TIME,
  REGULAR_SESSION_START_TIME,
  sessionTimeToMinutes,
  toKstDateKey,
  toKstMinutesOfDay,
} from "../session";

// 2026-11-09는 월요일, 2026-11-12는 목요일, 2026-11-10은 화요일(KST)
describe("toKstDateKey", () => {
  it("KST 자정 경계로 날짜 키를 만든다", () => {
    expect(toKstDateKey(new Date("2026-11-09T14:59:59Z"))).toBe("2026-11-09");
    expect(toKstDateKey(new Date("2026-11-09T15:00:00Z"))).toBe("2026-11-10");
  });

  it("연말 경계도 KST 기준으로 넘긴다", () => {
    expect(toKstDateKey(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });
});

describe("kstDateKeyToDate", () => {
  it("hour 생략 시 KST 0시를 돌려준다", () => {
    expect(kstDateKeyToDate("2026-11-10").toISOString()).toBe(
      "2026-11-09T15:00:00.000Z",
    );
  });

  it("hour를 KST 시각으로 해석한다", () => {
    expect(kstDateKeyToDate("2026-11-09", 22).toISOString()).toBe(
      "2026-11-09T13:00:00.000Z",
    );
  });

  it("toKstDateKey와 왕복된다", () => {
    expect(toKstDateKey(kstDateKeyToDate("2026-03-01", 23))).toBe(
      "2026-03-01",
    );
  });
});

describe("isRegularSessionTime", () => {
  it("월·목 18:00 이상 22:00 미만이면 true", () => {
    expect(isRegularSessionTime(new Date("2026-11-09T18:00:00+09:00"))).toBe(
      true,
    );
    expect(isRegularSessionTime(new Date("2026-11-12T21:59:59+09:00"))).toBe(
      true,
    );
  });

  it("22:00:00과 18:00 전은 false", () => {
    expect(isRegularSessionTime(new Date("2026-11-09T22:00:00+09:00"))).toBe(
      false,
    );
    expect(isRegularSessionTime(new Date("2026-11-09T17:59:59+09:00"))).toBe(
      false,
    );
  });

  it("다른 요일은 false", () => {
    expect(isRegularSessionTime(new Date("2026-11-10T19:00:00+09:00"))).toBe(
      false,
    );
  });

  it("UTC로는 전날이어도 KST 요일로 판단한다", () => {
    // 2026-11-09T09:30:00Z = 월요일 18:30 KST
    expect(isRegularSessionTime(new Date("2026-11-09T09:30:00Z"))).toBe(true);
    // 2026-11-10T09:30:00Z = 화요일 18:30 KST
    expect(isRegularSessionTime(new Date("2026-11-10T09:30:00Z"))).toBe(false);
  });
});

describe("canOpenRegularSession", () => {
  it("월·목 22:00 전이면 true(18:00 전 포함)", () => {
    expect(canOpenRegularSession(new Date("2026-11-09T00:00:00+09:00"))).toBe(
      true,
    );
    expect(canOpenRegularSession(new Date("2026-11-09T10:00:00+09:00"))).toBe(
      true,
    );
    expect(canOpenRegularSession(new Date("2026-11-12T21:59:59+09:00"))).toBe(
      true,
    );
  });

  it("22:00 이후와 다른 요일은 false", () => {
    expect(canOpenRegularSession(new Date("2026-11-09T22:00:00+09:00"))).toBe(
      false,
    );
    expect(canOpenRegularSession(new Date("2026-11-10T19:00:00+09:00"))).toBe(
      false,
    );
  });
});

describe("getEmptySessionExpiresAt", () => {
  it("정기 세션은 그날 22:00 KST", () => {
    expect(
      getEmptySessionExpiresAt(
        "regular",
        new Date("2026-11-09T18:00:00+09:00"),
      ).toISOString(),
    ).toBe("2026-11-09T13:00:00.000Z");
  });

  it("회원 세션은 다음 날 00:00 KST", () => {
    expect(
      getEmptySessionExpiresAt(
        "custom",
        new Date("2026-11-09T23:30:00+09:00"),
      ).toISOString(),
    ).toBe("2026-11-09T15:00:00.000Z");
  });

  it("자정을 넘기는 회원 세션은 다음 날 종료 시각, 같은 날 끝나면 다음 날 00:00 KST", () => {
    const sessionDate = new Date("2026-11-09T00:00:00+09:00");
    expect(
      getEmptySessionExpiresAt("custom", sessionDate, {
        startTime: "23:30",
        endTime: "01:30",
      }),
    ).toEqual(new Date("2026-11-10T01:30:00+09:00"));
    expect(
      getEmptySessionExpiresAt("custom", sessionDate, {
        startTime: "18:00",
        endTime: "20:00",
      }),
    ).toEqual(new Date("2026-11-10T00:00:00+09:00"));
    // 정기 세션은 시각과 상관없이 그날 22:00 KST
    expect(
      getEmptySessionExpiresAt("regular", new Date("2026-11-09T18:00:00+09:00"), {
        startTime: "23:00",
        endTime: "01:00",
      }),
    ).toEqual(new Date("2026-11-09T22:00:00+09:00"));
  });

  it("UTC 날짜가 아닌 KST 날짜를 기준으로 한다", () => {
    // 2026-11-09T16:00:00Z = 2026-11-10 01:00 KST
    expect(
      getEmptySessionExpiresAt(
        "custom",
        new Date("2026-11-09T16:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-10T15:00:00.000Z");
  });
});

describe("getEmptySessionExpiryCutoff", () => {
  const SECOND_MS = 1000;
  // 기준 시각 비교(세션 시각 < cutoff)가 getEmptySessionExpiresAt(kind, 세션 시각) <= now와 같은지 본다
  const isExpiredByCutoff = (
    kind: "regular" | "custom",
    sessionDate: Date,
    now: Date,
  ) =>
    sessionDate.getTime() < getEmptySessionExpiryCutoff(kind, now).getTime();
  const isExpiredByRule = (
    kind: "regular" | "custom",
    sessionDate: Date,
    now: Date,
  ) => getEmptySessionExpiresAt(kind, sessionDate).getTime() <= now.getTime();

  it.each([
    ["regular", "2026-11-09T18:00:00+09:00", "2026-11-09T22:00:00+09:00"],
    ["regular", "2026-11-09T00:00:00+09:00", "2026-11-09T22:00:00+09:00"],
    ["regular", "2026-11-09T23:59:59+09:00", "2026-11-09T22:00:00+09:00"],
    ["custom", "2026-11-09T23:30:00+09:00", "2026-11-10T00:00:00+09:00"],
    ["custom", "2026-11-09T00:00:00+09:00", "2026-11-10T00:00:00+09:00"],
    ["custom", "2026-12-31T23:59:59+09:00", "2027-01-01T00:00:00+09:00"],
  ] as const)(
    "%s 세션(%s)은 만료 1초 전에는 남고 만료 정각(%s)에 만료된다",
    (kind, sessionDateIso, expiresAtIso) => {
      const sessionDate = new Date(sessionDateIso);
      const expiresAt = new Date(expiresAtIso);
      expect(getEmptySessionExpiresAt(kind, sessionDate)).toEqual(expiresAt);

      const oneSecondBefore = new Date(expiresAt.getTime() - SECOND_MS);
      expect(isExpiredByCutoff(kind, sessionDate, oneSecondBefore)).toBe(false);
      expect(isExpiredByCutoff(kind, sessionDate, expiresAt)).toBe(true);
    },
  );

  it("정기 세션 기준 시각은 22:00 KST에 하루 넘어간다", () => {
    expect(
      getEmptySessionExpiryCutoff(
        "regular",
        new Date("2026-11-09T21:59:59+09:00"),
      ).toISOString(),
    ).toBe("2026-11-08T15:00:00.000Z");
    expect(
      getEmptySessionExpiryCutoff(
        "regular",
        new Date("2026-11-09T22:00:00+09:00"),
      ).toISOString(),
    ).toBe("2026-11-09T15:00:00.000Z");
  });

  it("회원 세션 기준 시각은 오늘 00:00 KST다", () => {
    expect(
      getEmptySessionExpiryCutoff(
        "custom",
        new Date("2026-11-10T00:00:00+09:00"),
      ).toISOString(),
    ).toBe("2026-11-09T15:00:00.000Z");
  });

  it("세션 시각·now 조합 전반에서 getEmptySessionExpiresAt 판정과 같다", () => {
    const base = new Date("2026-11-08T00:00:00+09:00").getTime();
    // 37분은 시·일 경계와 어긋나게 해 KST 자정·22시 전후를 고르게 훑기 위한 간격이다.
    const STEP_MS = 37 * 60 * SECOND_MS;
    const SESSION_COUNT = 120;
    // now는 세션 범위보다 더 뒤까지 훑어 만료 후 구간도 확인한다.
    const NOW_COUNT = 160;
    // 정각에서 비껴난 now로 초 단위 경계 처리도 확인한다.
    const NOW_OFFSET_MS = 13 * SECOND_MS;
    for (const kind of ["regular", "custom"] as const) {
      for (let s = 0; s < SESSION_COUNT; s += 1) {
        const sessionDate = new Date(base + s * STEP_MS);
        for (let n = 0; n < NOW_COUNT; n += 1) {
          const now = new Date(base + n * STEP_MS + NOW_OFFSET_MS);
          expect(isExpiredByCutoff(kind, sessionDate, now)).toBe(
            isExpiredByRule(kind, sessionDate, now),
          );
        }
      }
    }
  });
});

describe("isInProgressMatchExpired", () => {
  const startsAt = new Date("2026-11-09T19:00:00+09:00");

  it("시작 후 2시간 미만이면 false", () => {
    expect(
      isInProgressMatchExpired(
        startsAt,
        new Date(startsAt.getTime() + IN_PROGRESS_MATCH_TIMEOUT_MS - 1),
      ),
    ).toBe(false);
  });

  it("정확히 2시간부터 true", () => {
    expect(
      isInProgressMatchExpired(
        startsAt,
        new Date(startsAt.getTime() + IN_PROGRESS_MATCH_TIMEOUT_MS),
      ),
    ).toBe(true);
  });
});

describe("isMatchInProgress", () => {
  it("created 상태만 진행 중으로 본다", () => {
    expect(isMatchInProgress({ status: "created" })).toBe(true);
    expect(isMatchInProgress({ status: "completed" })).toBe(false);
    expect(isMatchInProgress({ status: "cancelled" })).toBe(false);
  });
});

describe("getRegularSessionName", () => {
  it("날짜 키의 KST 요일로 이름을 정한다", () => {
    expect(getRegularSessionName("2026-11-09")).toBe("월요 정기운동");
    expect(getRegularSessionName("2026-11-12")).toBe("목요 정기운동");
  });
});

describe("getNextRegularSessionDateKey", () => {
  it.each([
    ["월 21:59 → 오늘", "2026-11-09T21:59:59+09:00", "2026-11-09"],
    ["월 22:00 → 목", "2026-11-09T22:00:00+09:00", "2026-11-12"],
    ["화 → 목", "2026-11-10T09:00:00+09:00", "2026-11-12"],
    ["수 → 목", "2026-11-11T23:59:00+09:00", "2026-11-12"],
    ["목 21:59 → 오늘", "2026-11-12T21:59:00+09:00", "2026-11-12"],
    ["목 22:00 → 다음 월", "2026-11-12T22:00:00+09:00", "2026-11-16"],
    ["금 → 다음 월", "2026-11-13T12:00:00+09:00", "2026-11-16"],
    ["토 → 다음 월", "2026-11-14T12:00:00+09:00", "2026-11-16"],
    ["일 → 다음 월", "2026-11-15T23:00:00+09:00", "2026-11-16"],
  ])("%s", (_label, nowIso, expected) => {
    expect(getNextRegularSessionDateKey(new Date(nowIso))).toBe(expected);
  });

  it("월말·연말을 넘긴다", () => {
    expect(
      getNextRegularSessionDateKey(new Date("2026-12-31T23:00:00+09:00")),
    ).toBe("2027-01-04");
  });
});

describe("isValidKstDateKey", () => {
  it("형식과 실제 날짜를 확인한다", () => {
    expect(isValidKstDateKey("2026-11-12")).toBe(true);
    expect(isValidKstDateKey("2028-02-29")).toBe(true);
    expect(isValidKstDateKey("2026-02-30")).toBe(false);
    expect(isValidKstDateKey("2026-13-01")).toBe(false);
    expect(isValidKstDateKey("2026-1-01")).toBe(false);
    expect(isValidKstDateKey("2026/11/12")).toBe(false);
  });
});

describe("세션 시각", () => {
  it("HH:MM 00:00~23:59만 유효하다", () => {
    for (const value of ["00:00", "09:30", "23:59"]) {
      expect(isValidSessionTime(value)).toBe(true);
    }
    for (const value of ["24:00", "9:30", "19:60", "1930", 1930, null]) {
      expect(isValidSessionTime(value)).toBe(false);
    }
  });

  it("분 단위와 서로 바꾼다", () => {
    expect(sessionTimeToMinutes("18:30")).toBe(1110);
    expect(minutesToSessionTime(1110)).toBe("18:30");
    expect(minutesToSessionTime(0)).toBe("00:00");
  });

  it("KST 날짜 키와 시각으로 시점을 만든다", () => {
    expect(kstDateKeyTimeToDate("2026-11-12", "19:30")).toEqual(
      new Date("2026-11-12T19:30:00+09:00"),
    );
  });

  it("범위는 둘 다 유효하고 종료가 시작보다 늦어야 한다", () => {
    expect(isValidSessionTimeRange("18:00", "20:00")).toBe(true);
    expect(isValidSessionTimeRange("20:00", "20:00")).toBe(false);
    // 종료가 시작보다 이르면 다음 날 종료다
    expect(isValidSessionTimeRange("23:30", "01:30")).toBe(true);
    expect(isValidSessionTimeRange("18:00", null)).toBe(false);
  });

  it("범위 문자열을 만들고 시각이 없으면 null", () => {
    expect(
      formatSessionTimeRange({
        startTime: REGULAR_SESSION_START_TIME,
        endTime: REGULAR_SESSION_END_TIME,
      }),
    ).toBe("18:00~22:00");
    expect(formatSessionTimeRange({ startTime: null, endTime: null })).toBe(
      null,
    );
  });

  it("자정을 넘기면 끝나는 시각에 '다음 날'을 붙이고 길이를 다음 날까지 센다", () => {
    expect(
      formatSessionTimeRange({ startTime: "23:30", endTime: "01:30" }),
    ).toBe("23:30~다음 날 01:30");
    expect(isOvernightSessionTimeRange({ startTime: "23:30", endTime: "01:30" })).toBe(true);
    expect(isOvernightSessionTimeRange({ startTime: "18:00", endTime: "20:00" })).toBe(false);
    expect(isOvernightSessionTimeRange({ startTime: null, endTime: null })).toBe(false);
    expect(getSessionDurationMinutes("23:30", "01:30")).toBe(120);
    expect(getSessionDurationMinutes("18:00", "20:00")).toBe(120);
    expect(getSessionDurationMinutes("22:00", "00:00")).toBe(120);
  });

  it("KST 0시부터 지난 분을 센다", () => {
    expect(toKstMinutesOfDay(new Date("2026-11-12T19:45:00+09:00"))).toBe(
      1185,
    );
  });
});
