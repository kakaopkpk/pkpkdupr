import { describe, expect, it } from "vitest";
import { isMatchInProgress } from "../match";
import {
  canOpenRegularSession,
  getEmptySessionExpiresAt,
  IN_PROGRESS_MATCH_TIMEOUT_MS,
  isInProgressMatchExpired,
  isRegularSessionTime,
  kstDateKeyToDate,
  toKstDateKey,
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
