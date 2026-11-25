import { describe, expect, it, vi } from "vitest";
import type {
  SessionPraiseCandidate,
  SessionPraiseResponse,
} from "@pkpkdupr/shared/sessionPraise";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import {
  addSkippedSessionPraise,
  formatSessionPraiseValue,
  getSessionPraiseCardValue,
  getSessionPraisePillState,
  getSkippedSessionPraiseKey,
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
  it("분류마다 한 줄 값 표기를 붙인다", () => {
    expect(formatSessionPraiseValue("dominator", 0.1064)).toBe("+0.106 상승");
    expect(formatSessionPraiseValue("streakGuard", 11)).toBe("11연승 저지");
    expect(formatSessionPraiseValue("streakGuard", 4, 2)).toBe("연승 저지 2회");
    expect(formatSessionPraiseValue("rankJump", 9)).toBe("순위 상승 ▲9");
    expect(formatSessionPraiseValue("mostWins", 5)).toBe("5승");
    expect(formatSessionPraiseValue("mostPoints", 58)).toBe("58점 득점");
    expect(formatSessionPraiseValue("clutch", 2)).toBe("듀스 2승");
    expect(formatSessionPraiseValue("underdog", 0.25)).toBe("+0.25 강팀 격파");
    expect(formatSessionPraiseValue("revenge", 1)).toBe("리벤지 성공 1회");
  });
});

describe("getSessionPraiseCardValue", () => {
  it("팝업 카드의 큰 값과 설명 줄로 나눈다", () => {
    expect(getSessionPraiseCardValue({ category: "streakGuard", value: 11, streakBreaks: 1 })).toEqual({
      main: "11연승",
      caption: "저지",
    });
    expect(getSessionPraiseCardValue({ category: "streakGuard", value: 5, streakBreaks: 2 })).toEqual({
      main: "2회",
      caption: "연승 저지",
    });
    expect(getSessionPraiseCardValue({ category: "underdog", value: 0.33 })).toEqual({
      main: "+0.33",
      caption: "강팀 격파",
    });
    expect(getSessionPraiseCardValue({ category: "revenge", value: 1 })).toEqual({
      main: "1회",
      caption: "리벤지 성공",
    });
    expect(getSessionPraiseCardValue({ category: "dominator", value: 0.106 })).toEqual({
      main: "+0.106",
      caption: "상승",
    });
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
  it("넘긴 세션을 건너뛴 첫 세션이다(후보 수는 서버가 거른다)", () => {
    const items = [
      makePraise("S1", ["A", "B"]),
      makePraise("S2", ["A", "B", "C"]),
    ];
    const skipped = [getSkippedSessionPraiseKey("P1", "S1")];
    expect(pickPendingSessionPraise(items, "P1", skipped)?.session.id).toBe("S2");
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
