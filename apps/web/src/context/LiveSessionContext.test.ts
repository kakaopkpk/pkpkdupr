import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import {
  getNextLiveSessionBoundary,
  pickLiveSession,
} from "@/context/LiveSessionContext";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

const makeSession = (
  overrides: Pick<MatchSessionDetailInfo, "id" | "kind" | "date"> &
    Partial<MatchSessionDetailInfo>,
): MatchSessionDetailInfo =>
  ({
    name: overrides.id,
    location: "야탑초등학교",
    startTime: null,
    endTime: null,
    participants: [],
    ...overrides,
  }) as MatchSessionDetailInfo;

// 2026-11-19(목) KST
const at = (time: string) => new Date(`2026-11-19T${time}:00+09:00`);

describe("pickLiveSession", () => {
  it("대회 세션은 시작 시각 전에는 진행 중이 아니고 시작 시각부터 진행 중이다", () => {
    const tournament = makeSession({
      id: "T",
      kind: "tournament",
      date: at("00:00").toISOString(),
      startTime: "10:00",
      endTime: "17:00",
    });

    expect(pickLiveSession([tournament], at("09:59"))).toBeNull();
    expect(pickLiveSession([tournament], at("10:00"))?.id).toBe("T");
    expect(pickLiveSession([tournament], at("23:59"))?.id).toBe("T");
  });

  it("시작 시각 없는 대회 세션은 세션 시각(date)부터 진행 중이다", () => {
    const tournament = makeSession({
      id: "T",
      kind: "tournament",
      date: at("00:00").toISOString(),
    });

    expect(pickLiveSession([tournament], at("00:00"))?.id).toBe("T");
  });

  it("회원 세션은 시작 시각과 상관없이 세션 시각(date)부터 진행 중이다", () => {
    const custom = makeSession({
      id: "C",
      kind: "custom",
      date: at("00:00").toISOString(),
      startTime: "10:00",
      endTime: "12:00",
    });

    expect(pickLiveSession([custom], at("09:59"))?.id).toBe("C");
    expect(pickLiveSession([custom], at("10:00"))?.id).toBe("C");
  });

  it("정기 세션은 세션 시각(18:00)부터 22:00 전까지 진행 중이다", () => {
    const regular = makeSession({
      id: "R",
      kind: "regular",
      date: at("18:00").toISOString(),
      startTime: "18:00",
      endTime: "22:00",
    });

    expect(pickLiveSession([regular], at("17:59"))).toBeNull();
    expect(pickLiveSession([regular], at("18:00"))?.id).toBe("R");
    expect(pickLiveSession([regular], at("22:00"))).toBeNull();
  });
});

describe("getNextLiveSessionBoundary", () => {
  it("대회 세션 시작 전이면 다음 경계는 그 시작 시각이다", () => {
    const tournament = makeSession({
      id: "T",
      kind: "tournament",
      date: at("00:00").toISOString(),
      startTime: "10:00",
      endTime: "17:00",
    });

    expect(getNextLiveSessionBoundary([tournament], at("09:00"))).toEqual(
      at("10:00"),
    );
  });

  it("회원 세션은 시작 시각이 아니라 세션 시각·만료 시각을 경계로 쓴다", () => {
    const custom = makeSession({
      id: "C",
      kind: "custom",
      date: at("00:00").toISOString(),
      startTime: "10:00",
      endTime: "12:00",
    });

    // 회원 세션 만료(다음 날 0시) 전 가장 이른 경계는 정기 회차 시작(목요일 18:00)이다
    expect(getNextLiveSessionBoundary([custom], at("09:00"))).toEqual(
      at("18:00"),
    );
  });
});
