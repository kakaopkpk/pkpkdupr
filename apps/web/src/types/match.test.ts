import { describe, expect, it } from "vitest";
import { isMatchSessionToday, type MatchInfo } from "@/types/match";

const kst = (value: string) => new Date(`${value}+09:00`);

const makeMatch = (
  session: Partial<NonNullable<MatchInfo["session"]>> | undefined,
): Pick<MatchInfo, "session"> => ({
  session: session && {
    id: "Ssession1",
    date: kst("2026-11-18T00:00:00").toISOString(),
    kind: "tournament",
    startTime: "22:00",
    endTime: "02:00",
    ...session,
  },
});

describe("isMatchSessionToday", () => {
  const overnight = makeMatch({});

  it("세션 날 자정 직전에는 오늘 세션이다", () => {
    expect(isMatchSessionToday(overnight, kst("2026-11-18T23:59:00"))).toBe(
      true,
    );
  });

  it("자정을 넘겨도 종료 시각 전이면 오늘 세션이다", () => {
    expect(isMatchSessionToday(overnight, kst("2026-11-19T00:01:00"))).toBe(
      true,
    );
    expect(isMatchSessionToday(overnight, kst("2026-11-19T01:59:00"))).toBe(
      true,
    );
  });

  it("종료 시각이 지나면 오늘 세션이 아니다", () => {
    expect(isMatchSessionToday(overnight, kst("2026-11-19T02:00:00"))).toBe(
      false,
    );
  });

  it("자정을 넘기지 않는 지난 날 세션은 오늘 세션이 아니다", () => {
    const sameDay = makeMatch({ startTime: "10:00", endTime: "12:00" });
    expect(isMatchSessionToday(sameDay, kst("2026-11-19T00:01:00"))).toBe(
      false,
    );
  });

  it("세션이 없으면 오늘 세션이 아니다", () => {
    expect(isMatchSessionToday(makeMatch(undefined), new Date())).toBe(false);
  });
});
