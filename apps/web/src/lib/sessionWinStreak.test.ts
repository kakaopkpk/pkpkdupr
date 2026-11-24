import { describe, expect, it } from "vitest";
import type { MatchInfo } from "@/types/match";
import { getSessionWinStreaks } from "@/lib/sessionWinStreak";

const player = (id: string) =>
    ({ id, username: id, isGuest: id.startsWith("guest") }) as MatchInfo["teams"][number]["players"][number];

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
  it("세션 경기를 뛴 회원 중 누적 연승 3 이상만 세션 전적과 함께 돌려준다", () => {
    const streaks = getSessionWinStreaks(
      [
        match(1, ["martin", "joel"], ["brad", "colin"], [7, 11]),
        match(2, ["martin", "joel"], ["ed", "jackie"], [11, 6]),
        match(3, ["brad", "colin"], ["wes", "andrew"], [11, 9]),
      ],
      // 지난 세션부터 이어진 누적 연승(세션 리포트 winStreaks). 세션 경기가 없는 sean은 빠진다
      { brad: 5, martin: 3, joel: 2, colin: 4, sean: 7 },
    );

    expect(
      streaks.map(({ player: { id }, winStreak, matchCount, wins }) => ({
        id,
        winStreak,
        matchCount,
        wins,
      })),
    ).toEqual([
      { id: "brad", winStreak: 5, matchCount: 2, wins: 2 },
      { id: "colin", winStreak: 4, matchCount: 2, wins: 2 },
      { id: "martin", winStreak: 3, matchCount: 2, wins: 1 },
    ]);
  });

  it("진행 중 경기만 뛴 회원은 넣지 않는다", () => {
    const streaks = getSessionWinStreaks(
      [match(1, ["a"], ["b"], [0, 0], { status: "created", completedAt: null, scores: [] })],
      { a: 4 },
    );

    expect(streaks).toEqual([]);
  });

  it("게스트는 연승 값이 있어도 넣지 않는다", () => {
    const streaks = getSessionWinStreaks(
      [match(1, ["guest1"], ["b"], [11, 3], { ratingExcluded: true })],
      { guest1: 3 },
    );

    expect(streaks).toEqual([]);
  });
});
