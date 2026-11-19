import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getStartTimeSegment,
  SessionCalendar,
} from "@/components/session/SessionSchedulePicker";

describe("getStartTimeSegment", () => {
  it("6시간 단위로 새벽·오전·오후·저녁을 정한다", () => {
    expect(getStartTimeSegment("00:00")).toBe("dawn");
    expect(getStartTimeSegment("05:30")).toBe("dawn");
    expect(getStartTimeSegment("06:00")).toBe("morning");
    expect(getStartTimeSegment("12:00")).toBe("afternoon");
    expect(getStartTimeSegment("23:30")).toBe("evening");
  });
});

const getDayCells = (markup: string) => [
  ...markup.matchAll(/<button[^>]*role="radio"[^>]*aria-label="([^"]+)"[^>]*>/g),
];

describe("SessionCalendar", () => {
  it("오늘이 든 달을 그리고 지난 날만 막는다", () => {
    const markup = renderToStaticMarkup(
      <SessionCalendar todayKey="2026-11-13" value={null} onChange={() => {}} />,
    );
    const cells = getDayCells(markup);

    expect(markup).toContain("2026년 11월");
    // 11월 1일부터 30일까지만 날짜 칸이고 다른 달 날은 빈 칸이다
    expect(cells).toHaveLength(30);
    expect(cells[0][1]).toContain("11월 1일");
    expect(cells[11][0]).toContain('disabled=""');
    expect(cells[12][1]).toContain("오늘");
    expect(cells[12][0]).not.toContain('disabled=""');
    expect(cells[29][0]).not.toContain('disabled=""');
    // 오늘이 든 달보다 앞으로는 넘기지 않는다
    expect(markup).toMatch(/aria-label="이전 달"[^>]*disabled=""/);
  });

  it("고른 날이 있으면 그 날이 든 달로 연다(3주보다 먼 날도 고를 수 있다)", () => {
    const markup = renderToStaticMarkup(
      <SessionCalendar
        todayKey="2026-11-13"
        value="2027-02-10"
        onChange={() => {}}
      />,
    );
    const cells = getDayCells(markup);

    expect(markup).toContain("2027년 2월");
    expect(cells).toHaveLength(28);
    expect(cells.every((cell) => !cell[0].includes('disabled=""'))).toBe(true);
    expect(markup).not.toMatch(/aria-label="이전 달"[^>]*disabled=""/);
  });
});
