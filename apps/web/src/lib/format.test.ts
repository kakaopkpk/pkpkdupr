import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  formatKstDateTime,
  formatKstMonthDay,
  formatKstNumericDate,
} from "@/lib/format";

describe("formatElapsed", () => {
  const startsAt = "2026-11-13T11:14:00.000Z";
  const at = (offsetMs: number) =>
    new Date(new Date(startsAt).getTime() + offsetMs);

  it("시작 직후는 '방금 시작'", () => {
    expect(formatElapsed(startsAt, at(0))).toBe("방금 시작");
  });

  it("59초까지는 '방금 시작'", () => {
    expect(formatElapsed(startsAt, at(59_000))).toBe("방금 시작");
  });

  it("12분 뒤는 '12분째'", () => {
    expect(formatElapsed(new Date(startsAt), at(12 * 60_000))).toBe("12분째");
  });

  it("시작 전이면 '방금 시작'", () => {
    expect(formatElapsed(startsAt, at(-5 * 60_000))).toBe("방금 시작");
  });
});

describe("formatKstDateTime", () => {
  it("KST 날짜·요일·시각을 붙인다", () => {
    expect(formatKstDateTime("2026-11-13T11:14:00.000Z")).toBe(
      "11월 13일 금 20:14",
    );
  });
});

describe("formatKstNumericDate", () => {
  it("KST 날짜를 연도까지 숫자로 쓴다", () => {
    expect(formatKstNumericDate("2026-11-17T03:00:00.000Z")).toBe("2026. 11. 17.");
  });

  it("UTC로는 전날이어도 KST 날짜를 쓴다", () => {
    expect(formatKstNumericDate(new Date("2025-03-02T16:30:00.000Z"))).toBe(
      "2025. 3. 3.",
    );
  });
});

describe("formatKstMonthDay", () => {
  it("KST 월·일만 쓴다", () => {
    expect(formatKstMonthDay("2026-11-17T03:00:00.000Z")).toBe("11월 17일");
  });

  it("UTC로는 전날이어도 KST 날짜를 쓴다", () => {
    expect(formatKstMonthDay(new Date("2025-03-02T16:30:00.000Z"))).toBe(
      "3월 3일",
    );
  });
});
