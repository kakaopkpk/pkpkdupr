import { describe, expect, it } from "vitest";
import {
  formatSessionTimePlace,
  getSessionDDayLabel,
  getSessionMetaLabel,
} from "./sessionTimeLabel";

const TODAY_KEY = "2026-11-16"; // 월요일

/** dateKey 날짜의 KST 00:00 ISO 문자열 */
const kstMidnight = (dateKey: string) => `${dateKey}T00:00:00+09:00`;

const makeSession = (
  dateKey: string,
  times: { startTime: string | null; endTime: string | null } = {
    startTime: "18:00",
    endTime: "22:00",
  },
) => ({
  kind: "regular" as const,
  date: kstMidnight(dateKey),
  dateKey,
  location: "야탑초등학교",
  ...times,
});

const NO_TIME = { startTime: null, endTime: null };
const CROSS_MIDNIGHT = { startTime: "23:30", endTime: "01:30" };

describe("getSessionDDayLabel", () => {
  it("미래 세션은 날짜 차로 D-N이다", () => {
    expect(getSessionDDayLabel(makeSession("2026-11-17"), TODAY_KEY)).toBe("D-1");
    expect(getSessionDDayLabel(makeSession("2026-11-26"), TODAY_KEY)).toBe("D-10");
  });

  it("오늘 세션은 시각과 상관없이 D-Day다", () => {
    expect(getSessionDDayLabel(makeSession(TODAY_KEY), TODAY_KEY)).toBe("D-Day");
    expect(getSessionDDayLabel(makeSession(TODAY_KEY, NO_TIME), TODAY_KEY)).toBe("D-Day");
  });

  it("전날 시작해 자정을 넘긴 오늘 세션도 D-Day다", () => {
    expect(
      getSessionDDayLabel(makeSession("2026-11-15", CROSS_MIDNIGHT), TODAY_KEY),
    ).toBe("D-Day");
  });
});

describe("getSessionMetaLabel", () => {
  it("미래 세션은 날짜 시각 · 장소다", () => {
    expect(getSessionMetaLabel(makeSession("2026-11-19"), TODAY_KEY)).toBe(
      "11월 19일 목 18:00~22:00 · 야탑초등학교",
    );
  });

  it("오늘 세션은 날짜 없이 시각 · 장소다", () => {
    expect(getSessionMetaLabel(makeSession(TODAY_KEY), TODAY_KEY)).toBe(
      "18:00~22:00 · 야탑초등학교",
    );
  });

  it("시각 없는 세션은 미래면 날짜 · 장소, 오늘이면 장소만이다", () => {
    expect(getSessionMetaLabel(makeSession("2026-11-17", NO_TIME), TODAY_KEY)).toBe(
      "11월 17일 화 · 야탑초등학교",
    );
    expect(getSessionMetaLabel(makeSession(TODAY_KEY, NO_TIME), TODAY_KEY)).toBe(
      "야탑초등학교",
    );
  });

  it("자정을 넘기는 세션은 다음 날 종료 시각으로 보인다", () => {
    expect(getSessionMetaLabel(makeSession("2026-11-17", CROSS_MIDNIGHT), TODAY_KEY)).toBe(
      "11월 17일 화 23:30~다음 날 01:30 · 야탑초등학교",
    );
    expect(getSessionMetaLabel(makeSession("2026-11-15", CROSS_MIDNIGHT), TODAY_KEY)).toBe(
      "23:30~다음 날 01:30 · 야탑초등학교",
    );
  });
});

describe("formatSessionTimePlace", () => {
  it("시각 → 장소 순서이고 시각 없으면 장소만이다", () => {
    expect(formatSessionTimePlace(makeSession(TODAY_KEY))).toBe(
      "18:00~22:00 · 야탑초등학교",
    );
    expect(formatSessionTimePlace(makeSession(TODAY_KEY, NO_TIME))).toBe("야탑초등학교");
  });
});

describe("다음 세션 카드 날짜 기준(자정 넘김)", () => {
  // 2026-11-16(월) 18:00~22:00 정기 세션
  const regular = makeSession(TODAY_KEY);

  it("자정 전(일요일 밤)에는 월요 정기 세션이 D-1이고 메타에 날짜가 붙는다", () => {
    expect(getSessionDDayLabel(regular, "2026-11-15")).toBe("D-1");
    expect(getSessionMetaLabel(regular, "2026-11-15")).toBe(
      "11월 16일 월 18:00~22:00 · 야탑초등학교",
    );
  });

  it("자정을 넘기면(월요일) 같은 세션이 D-Day가 되고 메타에서 날짜가 빠진다", () => {
    expect(getSessionDDayLabel(regular, TODAY_KEY)).toBe("D-Day");
    expect(getSessionMetaLabel(regular, TODAY_KEY)).toBe("18:00~22:00 · 야탑초등학교");
  });
});
