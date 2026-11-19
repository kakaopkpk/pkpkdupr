import { describe, expect, it } from "vitest";
import {
  countTournamentUnitRecord,
  isTournamentPlace,
  type TournamentRecordMatch,
} from "../tournament";

const match = (
  teamA: string[],
  teamB: string[],
  scoreA: number,
  scoreB: number,
  overrides: Partial<TournamentRecordMatch> = {},
): TournamentRecordMatch => ({
  status: "completed",
  round: 1,
  teams: [
    { players: teamA.map((id) => ({ id })) },
    { players: teamB.map((id) => ({ id })) },
  ],
  scores: [{ scoreA, scoreB }],
  ...overrides,
});

describe("countTournamentUnitRecord", () => {
  it("1명 단위는 그 사람이 뛴 대진 경기를 모두 센다", () => {
    expect(
      countTournamentUnitRecord(
        ["a"],
        [
          match(["a", "b"], ["c", "d"], 11, 5),
          match(["c", "a"], ["b", "d"], 3, 11),
          match(["a"], ["e"], 11, 9),
          match(["b", "c"], ["d", "e"], 11, 0),
        ],
      ),
    ).toEqual({ wins: 2, losses: 1 });
  });

  it("2명 단위는 둘이 같은 팀인 경기만 센다", () => {
    expect(
      countTournamentUnitRecord(
        ["a", "b"],
        [
          match(["a", "b"], ["c", "d"], 11, 5),
          match(["c", "d"], ["a", "b"], 11, 7),
          match(["a", "c"], ["b", "d"], 11, 5),
        ],
      ),
    ).toEqual({ wins: 1, losses: 1 });
  });

  it("팀 단위는 팀 선수가 모두 단위 안에 있는 경기를 센다", () => {
    const unit = ["a", "b", "c", "d"];
    expect(
      countTournamentUnitRecord(unit, [
        match(["a", "b"], ["e", "f"], 11, 5),
        match(["g", "h"], ["c", "d"], 11, 5),
        match(["a", "e"], ["f", "g"], 11, 5),
      ]),
    ).toEqual({ wins: 1, losses: 1 });
  });

  it("두 팀 모두 단위의 팀이면 세지 않는다", () => {
    expect(
      countTournamentUnitRecord(
        ["a", "b", "c", "d"],
        [match(["a", "b"], ["c", "d"], 11, 5)],
      ),
    ).toBeNull();
  });

  it("라운드 없는 경기·완료 아닌 경기·무승부는 세지 않고, 센 경기가 없으면 null이다", () => {
    expect(
      countTournamentUnitRecord(
        ["a"],
        [
          match(["a"], ["b"], 11, 5, { round: null }),
          match(["a"], ["b"], 11, 5, { round: undefined }),
          match(["a"], ["b"], 0, 0, { status: "scheduled", scores: [] }),
          match(["a"], ["b"], 11, 5, { status: "created" }),
          match(["a"], ["b"], 11, 5, { status: "cancelled" }),
          match(["a"], ["b"], 11, 11),
        ],
      ),
    ).toBeNull();
  });

  it("빈 단위는 null이다", () => {
    expect(
      countTournamentUnitRecord([], [match(["a"], ["b"], 11, 5)]),
    ).toBeNull();
  });
});

describe("isTournamentPlace", () => {
  it("1~3 정수만 순위다", () => {
    expect([1, 2, 3].every(isTournamentPlace)).toBe(true);
    expect([0, 4, 1.5, "1", null].some(isTournamentPlace)).toBe(false);
  });
});
