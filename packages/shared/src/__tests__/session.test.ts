import { describe, expect, it } from "vitest";
import { isMatchInProgress } from "../match";
import {
  canOpenRegularSession,
  getEmptySessionExpiresAt,
  getEmptySessionExpiryCutoff,
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
    const step = 37 * 60 * SECOND_MS;
    for (const kind of ["regular", "custom"] as const) {
      for (let s = 0; s < 120; s += 1) {
        const sessionDate = new Date(base + s * step);
        for (let n = 0; n < 160; n += 1) {
          const now = new Date(base + n * step + 13 * SECOND_MS);
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
