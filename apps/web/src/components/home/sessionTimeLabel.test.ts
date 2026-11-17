import { describe, expect, it } from "vitest";
import {
  getSessionChipLabel,
  getSessionTimeLabel,
} from "@/components/home/sessionTimeLabel";

// 2026-11-16(월) 18:00~22:00 정기 세션
const regular = {
  kind: "regular" as const,
  date: "2026-11-15T15:00:00.000Z",
  dateKey: "2026-11-16",
  startTime: "18:00",
  endTime: "22:00",
};

describe("다음 세션 카드 날짜 기준", () => {
  it("자정 전(일요일 밤)에는 월요 정기 세션이 '내일'이고 칩은 '다음 세션'", () => {
    const now = new Date("2026-11-15T14:00:00.000Z"); // 일 23:00 KST
    expect(getSessionChipLabel(regular, "2026-11-15")).toBe("다음 세션");
    expect(getSessionTimeLabel(regular, "2026-11-15", now)).toBe(
      "11월 16일 월 18:00~22:00 · 내일",
    );
  });

  it("자정을 넘기면(월요일 아침) 같은 세션이 오늘 기준으로 바뀐다", () => {
    const now = new Date("2026-11-15T23:00:00.000Z"); // 월 08:00 KST
    expect(getSessionChipLabel(regular, "2026-11-16")).toBe("정기");
    expect(getSessionTimeLabel(regular, "2026-11-16", now)).toBe(
      "18:00~22:00 · 10시간 뒤",
    );
  });

  it("오늘 회원 세션은 '오늘' 칩", () => {
    expect(
      getSessionChipLabel({ ...regular, kind: "custom" }, "2026-11-16"),
    ).toBe("오늘");
  });
});
