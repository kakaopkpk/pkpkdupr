import { describe, expect, it } from "vitest";
import {
  getMatchSessionStatus,
  isMatchRecordDeletable,
  isMatchRecordEditable,
  isWithinMatchEditWindow,
  MATCH_EDIT_WINDOW_MS,
  resolveRatingExcludedAfterEdit,
  type Match,
} from "../match";

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

describe("isMatchRecordEditable", () => {
  const startsAt = new Date("2026-07-31T10:00:00.000Z");
  const now = new Date("2026-07-31T12:00:00.000Z");
  const match = {
    status: "completed",
    matchStartsAt: startsAt,
  } as Pick<Match, "status" | "matchStartsAt">;

  it("완료 경기와 점수 없는 진행 중 경기는 true를 반환한다", () => {
    expect(isMatchRecordEditable(match, now)).toBe(true);
    expect(
      isMatchRecordEditable({ ...match, status: "created" }, now),
    ).toBe(true);
  });

  it("취소된 경기면 false를 반환한다", () => {
    expect(isMatchRecordEditable({ ...match, status: "cancelled" }, now)).toBe(
      false,
    );
  });

  it("시작 후 정확히 24시간이면 true, +1ms면 false를 반환한다", () => {
    expect(
      isMatchRecordEditable(
        match,
        new Date(startsAt.getTime() + MATCH_EDIT_WINDOW_MS),
      ),
    ).toBe(true);
    expect(
      isMatchRecordEditable(
        match,
        new Date(startsAt.getTime() + MATCH_EDIT_WINDOW_MS + 1),
      ),
    ).toBe(false);
  });
});

describe("isMatchRecordDeletable", () => {
  const startsAt = new Date("2026-07-31T10:00:00.000Z");
  const now = new Date("2026-07-31T12:00:00.000Z");
  const match = {
    status: "completed" as const,
    matchStartsAt: startsAt,
    source: "player_created" as const,
  };

  it("시작 후 24시간 이내의 완료·진행 중 경기는 true를 반환한다", () => {
    expect(isMatchRecordDeletable(match, now)).toBe(true);
    expect(
      isMatchRecordDeletable({ ...match, status: "created" }, now),
    ).toBe(true);
  });

  it("막 만든 진행 중 경기(시작 시각 = 지금)는 true를 반환한다", () => {
    expect(
      isMatchRecordDeletable(
        { ...match, status: "created" },
        startsAt,
      ),
    ).toBe(true);
  });

  it("아직 시작하지 않은 경기는 false를 반환한다", () => {
    expect(
      isMatchRecordDeletable(match, new Date(startsAt.getTime() - 1)),
    ).toBe(false);
  });

  it("완료되지 않은 관리자 예정 경기는 false, 완료됐으면 true를 반환한다", () => {
    expect(
      isMatchRecordDeletable(
        { ...match, source: "admin_created", status: "created" },
        now,
      ),
    ).toBe(false);
    expect(
      isMatchRecordDeletable({ ...match, source: "admin_created" }, now),
    ).toBe(true);
  });

  it("취소·24시간 경과 경기는 false를 반환한다", () => {
    expect(isMatchRecordDeletable({ ...match, status: "cancelled" }, now)).toBe(
      false,
    );
    expect(
      isMatchRecordDeletable(
        match,
        new Date(startsAt.getTime() + MATCH_EDIT_WINDOW_MS + 1),
      ),
    ).toBe(false);
  });
});

describe("resolveRatingExcludedAfterEdit", () => {
  const teamsOf = (...guestFlags: boolean[][]) =>
    guestFlags.map((flags) => ({
      players: flags.map((isGuest) => ({ isGuest })),
    }));
  const members = teamsOf([false, false], [false, false]);
  const withGuest = teamsOf([false, false], [false, true]);

  it("진행 중 경기에 처음 점수를 넣으면 다음 팀의 게스트 여부로 정한다", () => {
    const created = { status: "created", ratingExcluded: false } as const;
    expect(resolveRatingExcludedAfterEdit(created, withGuest)).toBe(true);
    expect(resolveRatingExcludedAfterEdit(created, members)).toBe(false);
  });

  it("이미 completed이고 미반영이면 게스트가 모두 정회원이 돼도 true를 유지한다", () => {
    const excluded = { status: "completed", ratingExcluded: true } as const;
    expect(resolveRatingExcludedAfterEdit(excluded, members)).toBe(true);
    expect(resolveRatingExcludedAfterEdit(excluded, withGuest)).toBe(true);
  });

  it("이미 completed이고 반영이면 게스트가 새로 들어올 때만 true다", () => {
    const included = { status: "completed", ratingExcluded: false } as const;
    expect(resolveRatingExcludedAfterEdit(included, members)).toBe(false);
    expect(resolveRatingExcludedAfterEdit(included, withGuest)).toBe(true);
  });
});
