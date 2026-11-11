import { describe, expect, it } from "vitest";
import {
  canEditMatchRecord,
  getMatchSessionStatus,
  isWithinMatchEditWindow,
  MATCH_EDIT_WINDOW_MS,
  type Match,
} from "../match";
import type { Player } from "../player";

describe("getMatchSessionStatus", () => {
  it("모든 매치가 완료일 때만 완료 상태를 반환한다", () => {
    expect(getMatchSessionStatus(["completed", "completed"])).toBe(
      "completed",
    );
    expect(getMatchSessionStatus(["completed", "created"])).toBe("created");
    expect(getMatchSessionStatus(["cancelled"])).toBe("created");
  });
});

describe("isWithinMatchEditWindow", () => {
  const startsAt = new Date("2026-07-31T10:00:00.000Z");

  it("경기 시작 전이면 true를 반환한다", () => {
    expect(
      isWithinMatchEditWindow(startsAt, new Date("2026-07-31T09:00:00.000Z")),
    ).toBe(true);
  });

  it("시작 후 정확히 24시간이면 true를 반환한다", () => {
    expect(
      isWithinMatchEditWindow(
        startsAt,
        new Date(startsAt.getTime() + MATCH_EDIT_WINDOW_MS),
      ),
    ).toBe(true);
  });

  it("시작 후 24시간 + 1ms이면 false를 반환한다", () => {
    expect(
      isWithinMatchEditWindow(
        startsAt,
        new Date(startsAt.getTime() + MATCH_EDIT_WINDOW_MS + 1),
      ),
    ).toBe(false);
  });
});

describe("canEditMatchRecord", () => {
  const player = (id: string) => ({ id }) as Player;
  const match = {
    creatorPlayerId: "creator",
    teams: [
      { id: "a", name: "A", players: [player("p1"), player("p2")] },
      { id: "b", name: "B", players: [player("p3"), player("p4")] },
    ],
  } as Pick<Match, "creatorPlayerId" | "teams">;

  it("참가자나 생성자면 true를 반환한다", () => {
    expect(canEditMatchRecord(match, "p3")).toBe(true);
    expect(canEditMatchRecord(match, "creator")).toBe(true);
  });

  it("참가자도 생성자도 아니면 false를 반환한다", () => {
    expect(canEditMatchRecord(match, "outsider")).toBe(false);
  });
});
