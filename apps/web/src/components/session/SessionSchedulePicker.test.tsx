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

describe("SessionCalendar", () => {
  it("오늘이 든 주 일요일부터 3주 뒤가 든 주 토요일까지 그리고 범위 밖 날은 막는다", () => {
    const markup = renderToStaticMarkup(
      <SessionCalendar todayKey="2026-11-13" value={null} onChange={() => {}} />,
    );
    const cells = [...markup.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>/g)];

    // 11월 8일(일) ~ 12월 5일(토) 4주
    expect(cells).toHaveLength(28);
    expect(cells[0][1]).toContain("11월 8일");
    expect(cells[0][0]).toContain("disabled");
    expect(cells[5][1]).toContain("오늘");
    expect(cells[5][0]).not.toContain("disabled");
    // 오늘부터 21일째인 12월 3일까지만 고를 수 있다
    expect(cells[25][1]).toContain("12월 3일");
    expect(cells[25][0]).not.toContain("disabled");
    expect(cells[26][0]).toContain("disabled");
    // 달이 바뀌는 날 아래 줄에 'N월'을 쓴다
    expect(markup).toContain("12월</span>");
  });
});
