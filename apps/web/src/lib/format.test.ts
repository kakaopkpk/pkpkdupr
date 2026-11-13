import { describe, expect, it } from "vitest";
import { formatElapsed, formatKstDateTime } from "@/lib/format";

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
