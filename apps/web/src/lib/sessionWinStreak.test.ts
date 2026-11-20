import { describe, expect, it } from "vitest";
import type { MatchInfo } from "@/types/match";
import { getSessionWinStreaks } from "@/lib/sessionWinStreak";

const player = (id: string) => ({ id, username: id }) as MatchInfo["teams"][number]["players"][number];

let sequence = 0;
/** teamA가 scoreA, teamB가 scoreB로 끝난 경기. minute는 완료 시각(분) */
const match = (
  minute: number,
  teamA: string[],
  teamB: string[],
  [scoreA, scoreB]: [number, number],
  overrides: Partial<MatchInfo> = {},
): MatchInfo => {
  sequence += 1;
  const completedAt = new Date(Date.UTC(2026, 10, 18, 10, minute)).toISOString();
  return {
    id: `M${sequence}`,
    status: "completed",
    ratingExcluded: false,
    matchStartsAt: completedAt,
    completedAt,
    teams: [
      { name: "Team A", players: teamA.map(player) },
      { name: "Team B", players: teamB.map(player) },
    ],
    scores: [{ scoreA, scoreB }],
    ...overrides,
  } as MatchInfo;
};

describe("getSessionWinStreaks", () => {
  it("가장 최근 경기부터 이어지는 3연승 이상만 세션 전적과 함께 돌려준다", () => {
    const streaks = getSessionWinStreaks([
      match(1, ["martin", "joel"], ["brad", "colin"], [7, 11]),
      match(2, ["martin", "joel"], ["ed", "jackie"], [11, 6]),
      match(3, ["martin", "sean"], ["scarlett", "andrew"], [11, 6]),
      match(4, ["martin", "sean"], ["scarlett", "andrew"], [11, 6]),
      match(5, ["brad", "colin"], ["wes", "andrew"], [11, 9]),
      match(6, ["brad", "joel"], ["ed", "jackie"], [15, 14]),
    ]);

    expect(
      streaks.map(({ player: { id }, winStreak, matchCount, wins }) => ({
        id,
        winStreak,
        matchCount,
        wins,
      })),
    ).toEqual([
      { id: "brad", winStreak: 3, matchCount: 3, wins: 3 },
      { id: "martin", winStreak: 3, matchCount: 4, wins: 3 },
    ]);
  });

  it("진 경기에서 연승이 끊기고, 진행 중 경기는 세지 않는다", () => {
    const streaks = getSessionWinStreaks([
      match(1, ["a"], ["b"], [11, 3]),
      match(2, ["a"], ["c"], [11, 3]),
      match(3, ["a"], ["d"], [11, 3]),
      match(4, ["a"], ["e"], [5, 11]),
      match(5, ["a"], ["f"], [0, 0], { status: "created", completedAt: null, scores: [] }),
    ]);

    expect(streaks).toEqual([]);
  });

  it("평점 미반영 경기(게스트 참가)는 연승에서 빼고, 세션 전적에는 센다", () => {
    const streaks = getSessionWinStreaks([
      match(1, ["a"], ["b"], [11, 3]),
      match(2, ["a"], ["c"], [11, 3]),
      match(3, ["a"], ["guest"], [3, 11], { ratingExcluded: true }),
      match(4, ["a"], ["d"], [11, 3]),
    ]);

    expect(streaks).toMatchObject([
      { player: { id: "a" }, winStreak: 3, matchCount: 4, wins: 3 },
    ]);
  });
});
