import { describe, expect, it } from "vitest";
import { getMatchResultName } from "@/lib/matchResult";

const teams = [
  { players: [{ id: "a1" }, { id: "a2" }] },
  { players: [{ id: "b1" }, { id: "b2" }] },
];

const name = (scoreA: number, scoreB: number, viewerId: string | null) =>
  getMatchResultName({ teams, scores: [{ scoreA, scoreB }] }, viewerId);

describe("getMatchResultName", () => {
  it("보통 경기는 승리·패배", () => {
    expect(name(11, 6, "a1")).toEqual({ label: "승리", icon: null, isWin: true });
    expect(name(11, 6, "b2")).toEqual({ label: "패배", icon: null, isWin: false });
  });

  it("상대가 0점이면 완승, 우리가 0점이면 참패", () => {
    expect(name(0, 11, "b1")).toEqual({ label: "완승", icon: null, isWin: true });
    expect(name(0, 11, "a1")).toEqual({ label: "참패", icon: null, isWin: false });
  });

  it("이긴 팀 점수가 12점 이상(듀스)이면 힘겹게 쟁취한 승리·아쉬운 패배", () => {
    expect(name(13, 11, "a2")).toEqual({ label: "힘겹게 쟁취한 승리", icon: null, isWin: true });
    expect(name(13, 11, "b1")).toEqual({ label: "아쉬운 패배", icon: null, isWin: false });
    expect(name(11, 10, "a1")?.label).toBe("승리");
  });

  it("특수 매치 결과가 있으면 그 이름이 먼저다", () => {
    const specialMatch = { kind: "champions", defendingTeamIndex: null, outcome: "champions_won" } as const;
    expect(getMatchResultName({ specialMatch, teams, scores: [{ scoreA: 11, scoreB: 0 }] }, "a1")).toEqual({
      label: "최강자전 승리",
      icon: "champions",
      isWin: true,
    });
  });

  it("특수 매치 결과가 아직 없으면 일반 이름이다", () => {
    const specialMatch = { kind: "champions", defendingTeamIndex: null, outcome: null } as const;
    expect(getMatchResultName({ specialMatch, teams, scores: [{ scoreA: 11, scoreB: 6 }] }, "a1")?.label).toBe("승리");
  });

  it("보는 회원이 경기하지 않았거나 승패가 갈리지 않았으면 null", () => {
    expect(name(11, 6, "z")).toBeNull();
    expect(name(11, 6, null)).toBeNull();
    expect(name(11, 11, "a1")).toBeNull();
    expect(getMatchResultName({ teams, scores: [] }, "a1")).toBeNull();
    expect(getMatchResultName({ teams, scores: null }, "a1")).toBeNull();
  });
});
