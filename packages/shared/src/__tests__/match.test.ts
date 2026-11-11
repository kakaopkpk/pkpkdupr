import { describe, expect, it } from "vitest";
import {
  computeMatchStartsAt,
  getMatchSessionStatus,
  isWithinMatchEditWindow,
  MATCH_EDIT_WINDOW_MS,
} from "../match";

describe("getMatchSessionStatus", () => {
  it("모든 매치가 완료일 때만 완료 상태를 반환한다", () => {
    expect(getMatchSessionStatus(["completed", "completed"])).toBe(
      "completed",
    );
    expect(getMatchSessionStatus(["completed", "created"])).toBe("created");
    expect(getMatchSessionStatus(["cancelled"])).toBe("created");
  });
});

describe("computeMatchStartsAt", () => {
  it("keeps the time if already on a 30-minute boundary", () => {
    const input = new Date("2026-07-13T14:00:00.000Z");
    const result = computeMatchStartsAt(input);
    expect(result).toEqual(new Date("2026-07-13T14:00:00.000Z"));
  });

  it("keeps the time at :30", () => {
    const input = new Date("2026-07-13T14:30:00.000Z");
    const result = computeMatchStartsAt(input);
    expect(result).toEqual(new Date("2026-07-13T14:30:00.000Z"));
  });

  it("rounds up 1 minute past to the next 30-minute slot", () => {
    const input = new Date("2026-07-13T14:01:00.000Z");
    const result = computeMatchStartsAt(input);
    expect(result).toEqual(new Date("2026-07-13T14:30:00.000Z"));
  });

  it("rounds up 14:31 to 15:00", () => {
    const input = new Date("2026-07-13T14:31:00.000Z");
    const result = computeMatchStartsAt(input);
    expect(result).toEqual(new Date("2026-07-13T15:00:00.000Z"));
  });

  it("rounds up 14:59 to 15:00", () => {
    const input = new Date("2026-07-13T14:59:59.000Z");
    const result = computeMatchStartsAt(input);
    expect(result).toEqual(new Date("2026-07-13T15:00:00.000Z"));
  });

  it("rounds up to the next hour when 1 minute past :30", () => {
    const input = new Date("2026-07-13T14:30:01.000Z");
    const result = computeMatchStartsAt(input);
    expect(result).toEqual(new Date("2026-07-13T15:00:00.000Z"));
  });

  it("handles midnight boundary", () => {
    const input = new Date("2026-07-13T23:45:00.000Z");
    const result = computeMatchStartsAt(input);
    expect(result).toEqual(new Date("2026-07-14T00:00:00.000Z"));
  });

  it("defaults to current time when no argument is given", () => {
    const before = Date.now();
    const result = computeMatchStartsAt();
    const after = Date.now();

    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThan(after + 30 * 60 * 1000);

    const remainder = result.getTime() % (30 * 60 * 1000);
    expect(remainder).toBe(0);
  });
});

describe("isWithinMatchEditWindow", () => {
  const startsAt = new Date("2026-07-31T10:00:00.000Z");

  it("경기 시작 전이면 true를 반환한다", () => {
    expect(
      isWithinMatchEditWindow(startsAt, new Date("2026-07-31T09:00:00.000Z")),
    ).toBe(true);
  });

  it("시작 후 정확히 24시간이면 true를 반환한다", () => {
    expect(
      isWithinMatchEditWindow(
        startsAt,
        new Date(startsAt.getTime() + MATCH_EDIT_WINDOW_MS),
      ),
    ).toBe(true);
  });

  it("시작 후 24시간 + 1ms이면 false를 반환한다", () => {
    expect(
      isWithinMatchEditWindow(
        startsAt,
        new Date(startsAt.getTime() + MATCH_EDIT_WINDOW_MS + 1),
      ),
    ).toBe(false);
  });
});
