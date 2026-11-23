import { describe, expect, it, vi } from "vitest";
import type {
  SessionPraiseCandidate,
  SessionPraiseResponse,
} from "@pkpkdupr/shared/sessionPraise";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import {
  addSkippedSessionPraise,
  formatSessionPraiseValue,
  getSessionPraisePillState,
  getSkippedSessionPraiseKey,
  isSessionPraiseValueRising,
  parseSkippedSessionPraises,
  pickPendingSessionPraise,
} from "@/lib/sessionPraise";

const candidate = (id: string): SessionPraiseCandidate => ({
  player: { id, username: id },
  category: "mostWins",
  value: 3,
  praiseCount: 0,
});

const makePraise = (
  sessionId: string,
  candidateIds: string[],
  overrides: Partial<SessionPraiseResponse> = {},
): SessionPraiseResponse => ({
  session: { id: sessionId, name: "목요 정기운동", kind: "regular" },
  status: "open",
  candidates: candidateIds.map(candidate),
  myTargetPlayerId: null,
  ...overrides,
});

describe("formatSessionPraiseValue", () => {
  it("분류마다 값 표기를 붙인다", () => {
    expect(formatSessionPraiseValue("dominator", 0.1064)).toBe("+0.106");
    expect(formatSessionPraiseValue("winStreak", 4)).toBe("4연승");
    expect(formatSessionPraiseValue("streakGuard", 2)).toBe("2번 저지");
    expect(formatSessionPraiseValue("mostWins", 3)).toBe("3승");
    expect(formatSessionPraiseValue("rankJump", 4)).toBe("▲4");
    expect(formatSessionPraiseValue("mostPoints", 58)).toBe("58점");
  });
});

describe("isSessionPraiseValueRising", () => {
  it("세션 지배자·순위 도약의 양수만 상승색이다", () => {
    expect(isSessionPraiseValueRising("dominator", 0.106)).toBe(true);
    expect(isSessionPraiseValueRising("rankJump", 4)).toBe(true);
    expect(isSessionPraiseValueRising("dominator", 0)).toBe(false);
    expect(isSessionPraiseValueRising("mostWins", 3)).toBe(false);
  });
});

describe("getSessionPraisePillState", () => {
  it("칭찬 전·받는 중이면 모두 누를 수 있다", () => {
    expect(getSessionPraisePillState({ status: "open", myTargetPlayerId: null }, "A")).toBe("open");
  });

  it("칭찬한 뒤에는 고른 후보만 picked, 나머지는 inactive다", () => {
    const praise = { status: "open", myTargetPlayerId: "A" } as const;
    expect(getSessionPraisePillState(praise, "A")).toBe("picked");
    expect(getSessionPraisePillState(praise, "B")).toBe("inactive");
  });

  it("마감 뒤 칭찬하지 않았으면 모두 inactive, 칭찬했으면 고른 후보만 picked다", () => {
    expect(getSessionPraisePillState({ status: "closed", myTargetPlayerId: null }, "A")).toBe(
      "inactive",
    );
    expect(getSessionPraisePillState({ status: "closed", myTargetPlayerId: "A" }, "A")).toBe(
      "picked",
    );
  });
});

describe("넘긴 칭찬 팝업 기록", () => {
  it("깨진 값은 빈 목록으로 읽는다", () => {
    expect(parseSkippedSessionPraises(null)).toEqual([]);
    expect(parseSkippedSessionPraises("{")).toEqual([]);
    expect(parseSkippedSessionPraises('{"a":1}')).toEqual([]);
    expect(parseSkippedSessionPraises('["P1:S1",3]')).toEqual(["P1:S1"]);
  });

  it("같은 키는 한 번만 두고 맨 뒤로 옮긴다", () => {
    expect(addSkippedSessionPraise(["a", "b"], "a")).toEqual(["b", "a"]);
  });

  it("오래된 것부터 지워 30개만 남긴다", () => {
    const skipped = Array.from({ length: 30 }, (_, index) => `k${index}`);
    const next = addSkippedSessionPraise(skipped, "new");
    expect(next).toHaveLength(30);
    expect(next[0]).toBe("k1");
    expect(next.at(-1)).toBe("new");
  });
});

describe("pickPendingSessionPraise", () => {
  it("넘긴 세션과 후보 1명 이하 세션을 건너뛴 첫 세션이다", () => {
    const items = [
      makePraise("S1", ["A", "B"]),
      makePraise("S2", ["A"]),
      makePraise("S3", ["A", "B", "C"]),
    ];
    const skipped = [getSkippedSessionPraiseKey("P1", "S1")];
    expect(pickPendingSessionPraise(items, "P1", skipped)?.session.id).toBe("S3");
  });

  it("다른 회원이 넘긴 기록은 보지 않는다", () => {
    const items = [makePraise("S1", ["A", "B"])];
    const skipped = [getSkippedSessionPraiseKey("P2", "S1")];
    expect(pickPendingSessionPraise(items, "P1", skipped)?.session.id).toBe("S1");
  });

  it("띄울 세션이 없으면 null", () => {
    expect(pickPendingSessionPraise([], "P1", [])).toBeNull();
  });
});
