import { describe, expect, it } from "vitest";
import { getMonthGridDateKeys, toMonthKey } from "./monthGrid";

describe("getMonthGridDateKeys", () => {
  it("1일이 일요일인 5주짜리 달도 다음 달 날짜로 6주를 채운다", () => {
    const keys = getMonthGridDateKeys("2026-11");
    expect(keys).toHaveLength(42);
    expect(keys[0]).toBe("2026-11-01");
    expect(keys[29]).toBe("2026-11-30");
    expect(keys[41]).toBe("2026-12-12");
  });

  it("그 달 1일이 든 주 일요일부터 시작하고 해를 넘긴다", () => {
    const keys = getMonthGridDateKeys("2026-12");
    expect(keys).toHaveLength(42);
    expect(keys[0]).toBe("2026-11-29");
    expect(keys[2]).toBe("2026-12-01");
    expect(keys[41]).toBe("2027-01-09");
  });

  it("6주가 꽉 차는 달도 42칸이다", () => {
    // 2026-08: 1일 토요일, 31일 월요일
    const keys = getMonthGridDateKeys("2026-08");
    expect(keys[0]).toBe("2026-07-26");
    expect(keys[6]).toBe("2026-08-01");
    expect(keys[41]).toBe("2026-09-05");
  });
});

describe("toMonthKey", () => {
  it("날짜 키에서 월 키를 뗀다", () => {
    expect(toMonthKey("2026-11-17")).toBe("2026-11");
  });
});
