import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

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
  it("일정 탭 달력처럼 6주를 그리고 지난 날만 막는다", () => {
    const markup = renderToStaticMarkup(
      <SessionCalendar
        todayKey="2026-11-13"
        value={null}
        playerId={undefined}
        onChange={() => {}}
      />,
    );

    expect(markup).toContain("2026년 11월");
    expect(markup).toContain("달력 표시");
    const isDisabled = (label: string) =>
      new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*disabled=""`).test(markup);
    expect(isDisabled("11월 12일")).toBe(true);
    expect(isDisabled("11월 13일")).toBe(false);
    expect(isDisabled("12월 5일")).toBe(false);
    // 오늘이 든 달보다 앞으로는 넘기지 않는다
    expect(markup).toMatch(/aria-label="이전 달"[^>]*disabled=""/);
  });

  it("고른 날이 있으면 그 날이 든 달로 열고 그 날을 고른 것으로 그린다", () => {
    const markup = renderToStaticMarkup(
      <SessionCalendar
        todayKey="2026-11-13"
        value="2027-02-10"
        playerId={undefined}
        onChange={() => {}}
      />,
    );

    expect(markup).toContain("2027년 2월");
    expect(markup).toMatch(/aria-pressed="true"[^>]*aria-label="2월 10일/);
    expect(markup).not.toMatch(/aria-label="이전 달"[^>]*disabled=""/);
  });
});
