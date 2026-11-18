import { describe, expect, it } from "vitest";
import {
  computeCurrentWinStreak,
  computeCurrentWinStreaks,
  type WinStreakMatch,
} from "../streak.js";

const match = (
  id: string,
  minute: number,
  teams: [string[], string[]],
  score: [number, number],
  extra: Partial<WinStreakMatch> = {},
): WinStreakMatch => ({
  id,
  completedAt: new Date(Date.UTC(2026, 10, 18, 10, minute)),
  teamPlayerIds: teams,
  scores: [{ scoreA: score[0], scoreB: score[1] }],
  ...extra,
});

describe("computeCurrentWinStreak", () => {
  it("마지막 경기부터 거꾸로 이긴 경기를 센다", () => {
    const matches = [
      match("m1", 0, [["a"], ["b"]], [5, 11]),
      match("m2", 10, [["a", "c"], ["b", "d"]], [11, 6]),
      match("m4", 30, [["b"], ["a"]], [3, 11]),
      match("m3", 20, [["a"], ["d"]], [11, 9]),
    ];
    expect(computeCurrentWinStreak(matches, "a")).toBe(3);
    expect(computeCurrentWinStreak(matches, "b")).toBe(0);
  });

  it("승패가 갈리지 않은 경기는 연승을 끊는다", () => {
    const matches = [
      match("m1", 0, [["a"], ["b"]], [11, 5]),
      match("m2", 10, [["a"], ["b"]], [10, 10]),
      match("m3", 20, [["a"], ["b"]], [11, 7]),
    ];
    expect(computeCurrentWinStreak(matches, "a")).toBe(1);
  });

  it("평점 미반영 경기는 건너뛴다", () => {
    const matches = [
      match("m1", 0, [["a"], ["b"]], [11, 5]),
      match("m2", 10, [["a"], ["g"]], [2, 11], { ratingExcluded: true }),
      match("m3", 20, [["a"], ["b"]], [11, 7]),
    ];
    expect(computeCurrentWinStreak(matches, "a")).toBe(2);
  });

  it("여러 회원을 한 번에 센다", () => {
    const streaks = computeCurrentWinStreaks([
      match("m1", 0, [["a"], ["b"]], [11, 5]),
      match("m2", 10, [["a"], ["c"]], [11, 8]),
    ]);
    expect(Object.fromEntries(streaks)).toEqual({ a: 2, b: 0, c: 0 });
  });
});
