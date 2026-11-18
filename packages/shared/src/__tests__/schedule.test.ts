import { describe, expect, it } from "vitest";
import {
  addScheduleMonths,
  getScheduleMonthDateKeyRange,
  parseScheduleMonth,
} from "../schedule";

describe("schedule month keys", () => {
  it("parses only YYYY-MM", () => {
    expect(parseScheduleMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseScheduleMonth("2026-13")).toBeNull();
    expect(parseScheduleMonth("2026-1")).toBeNull();
    expect(parseScheduleMonth("2026-11-01")).toBeNull();
  });

  it("moves across years", () => {
    expect(addScheduleMonths("2026-12", 1)).toBe("2027-01");
    expect(addScheduleMonths("2026-01", -1)).toBe("2025-12");
    expect(addScheduleMonths("2026-11", 0)).toBe("2026-11");
  });

  it("returns [first day, next month first day)", () => {
    expect(getScheduleMonthDateKeyRange("2026-12")).toEqual({
      fromDateKey: "2026-12-01",
      toDateKey: "2027-01-01",
    });
  });
});
