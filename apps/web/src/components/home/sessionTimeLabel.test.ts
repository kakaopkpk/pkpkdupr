import { describe, expect, it } from "vitest";
import {
  formatSessionTimePlace,
  getSessionMetaLabel,
  getSessionTimeUntilLabel,
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
  isToday: dateKey <= TODAY_KEY,
  location: "야탑초등학교",
  ...times,
});

const NO_TIME = { startTime: null, endTime: null };
const CROSS_MIDNIGHT = { startTime: "23:30", endTime: "01:30" };

/** 오늘(TODAY_KEY) KST 시각 */
const at = (time: string) => new Date(`${TODAY_KEY}T${time}:00+09:00`);

describe("getSessionTimeUntilLabel", () => {
  it("미래 세션은 날짜 차로 내일·N일 뒤를 보인다", () => {
    const now = at("23:00");
    expect(getSessionTimeUntilLabel(makeSession("2026-11-17"), TODAY_KEY, now)).toBe("내일");
    expect(getSessionTimeUntilLabel(makeSession("2026-11-20"), TODAY_KEY, now)).toBe("4일 뒤");
  });

  it("오늘 시작 전이면 1시간 미만은 분, 그 이상은 시간 단위다", () => {
    const session = makeSession(TODAY_KEY);
    expect(getSessionTimeUntilLabel(session, TODAY_KEY, at("17:20"))).toBe("40분 뒤");
    expect(getSessionTimeUntilLabel(session, TODAY_KEY, at("15:30"))).toBe("2시간 뒤");
  });

  it("오늘 시작 시각이 지났으면 null이다", () => {
    const session = makeSession(TODAY_KEY);
    expect(getSessionTimeUntilLabel(session, TODAY_KEY, at("18:00"))).toBeNull();
    expect(getSessionTimeUntilLabel(session, TODAY_KEY, at("19:10"))).toBeNull();
  });

  it("시각 없는 오늘 세션은 null, 시각 없는 미래 세션은 날짜 차를 보인다", () => {
    expect(
      getSessionTimeUntilLabel(makeSession(TODAY_KEY, NO_TIME), TODAY_KEY, at("10:00")),
    ).toBeNull();
    expect(
      getSessionTimeUntilLabel(makeSession("2026-11-17", NO_TIME), TODAY_KEY, at("10:00")),
    ).toBe("내일");
  });

  it("자정을 넘기는 세션은 시작 시각 기준으로 남은 시간을 센다", () => {
    expect(
      getSessionTimeUntilLabel(makeSession(TODAY_KEY, CROSS_MIDNIGHT), TODAY_KEY, at("22:50")),
    ).toBe("40분 뒤");
    // 전날 시작해 자정을 넘긴 세션은 오늘 세션이고 이미 시작했다
    expect(
      getSessionTimeUntilLabel(
        makeSession("2026-11-15", CROSS_MIDNIGHT),
        TODAY_KEY,
        at("00:30"),
      ),
    ).toBeNull();
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
