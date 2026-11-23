import { describe, expect, it } from "vitest";
import { getSpecialMatchResultName, type SpecialMatchResultSource } from "@/lib/specialMatchResult";

const teams = [
  { players: [{ id: "a1" }, { id: "a2" }] },
  { players: [{ id: "b1" }, { id: "b2" }] },
];
/** 팀 0 승리 */
const teamAWins = [{ scoreA: 11, scoreB: 7 }];
/** 팀 1 승리 */
const teamBWins = [{ scoreA: 8, scoreB: 11 }];

const name = (
  specialMatch: SpecialMatchResultSource | null,
  scores: { scoreA: number; scoreB: number }[],
  viewerId: string | null,
) => getSpecialMatchResultName({ specialMatch, teams, scores }, viewerId);

describe("getSpecialMatchResultName", () => {
  describe("도전 매치(팀 0 방어)", () => {
    const challengeSuccess = { kind: "challenge", defendingTeamIndex: 0, outcome: "challenge_success" } as const;
    const defenseSuccess = { kind: "challenge", defendingTeamIndex: 0, outcome: "defense_success" } as const;

    it("도전 쪽이 이기면 도전 성공, 방어 쪽은 방어 실패", () => {
      expect(name(challengeSuccess, teamBWins, "b1")).toEqual({ label: "도전 성공", icon: "challenge", isWin: true });
      expect(name(challengeSuccess, teamBWins, "a1")).toEqual({ label: "방어 실패", icon: "shield", isWin: false });
    });

    it("방어 쪽이 이기면 방어 성공, 도전 쪽은 도전 실패", () => {
      expect(name(defenseSuccess, teamAWins, "a2")).toEqual({ label: "방어 성공", icon: "shield", isWin: true });
      expect(name(defenseSuccess, teamAWins, "b2")).toEqual({ label: "도전 실패", icon: "challenge", isWin: false });
    });

    it("도전 쪽이 이겨도 순위가 뒤바뀌지 않았으면(방어 성공) 도전 실패·방어 성공이고 색은 승패를 따른다", () => {
      expect(name(defenseSuccess, teamBWins, "b1")).toEqual({ label: "도전 실패", icon: "challenge", isWin: true });
      expect(name(defenseSuccess, teamBWins, "a1")).toEqual({ label: "방어 성공", icon: "shield", isWin: false });
    });

    it("양쪽 다 도전이면 두 팀 모두 도전 쪽 이름이다", () => {
      const both = { kind: "challenge", defendingTeamIndex: null, outcome: "challenge_success" } as const;
      expect(name(both, teamAWins, "a1")).toEqual({ label: "도전 성공", icon: "challenge", isWin: true });
      expect(name(both, teamAWins, "b1")).toEqual({ label: "도전 실패", icon: "challenge", isWin: false });
    });
  });

  describe("연승 저지(팀 0 연승 회원 팀)", () => {
    const streakStopped = { kind: "streak_stopper", defendingTeamIndex: 0, outcome: "streak_stopped" } as const;
    const streakDefended = { kind: "streak_stopper", defendingTeamIndex: 0, outcome: "streak_defended" } as const;

    it("상대 팀이 이기면 연승 저지, 연승 회원 팀은 연승 끝", () => {
      expect(name(streakStopped, teamBWins, "b1")).toEqual({ label: "연승 저지", icon: "streak_stopper", isWin: true });
      expect(name(streakStopped, teamBWins, "a1")).toEqual({ label: "연승 끝", icon: "champions", isWin: false });
    });

    it("연승 회원 팀이 이기면 연승 연장, 상대 팀은 저지 실패", () => {
      expect(name(streakDefended, teamAWins, "a1")).toEqual({ label: "연승 연장", icon: "champions", isWin: true });
      expect(name(streakDefended, teamAWins, "b2")).toEqual({ label: "저지 실패", icon: "streak_stopper", isWin: false });
    });
  });

  it("최강자전은 이긴 팀 최강자전 승리, 진 팀 최강자전 패배", () => {
    const champions = { kind: "champions", defendingTeamIndex: null, outcome: "champions_won" } as const;
    expect(name(champions, teamAWins, "a1")).toEqual({ label: "최강자전 승리", icon: "champions", isWin: true });
    expect(name(champions, teamAWins, "b1")).toEqual({ label: "최강자전 패배", icon: "champions", isWin: false });
  });

  describe("리벤지(팀 1이 직전 경기 승리 팀)", () => {
    const revengeSuccess = { kind: "revenge", defendingTeamIndex: 1, outcome: "revenge_success" } as const;
    const revengeDefended = { kind: "revenge", defendingTeamIndex: 1, outcome: "revenge_defended" } as const;

    it("직전에 진 팀이 이기면 리벤지 성공, 직전에 이긴 팀은 방어 실패", () => {
      expect(name(revengeSuccess, teamAWins, "a1")).toEqual({ label: "리벤지 성공", icon: "revenge", isWin: true });
      expect(name(revengeSuccess, teamAWins, "b1")).toEqual({ label: "방어 실패", icon: "shield", isWin: false });
    });

    it("직전에 이긴 팀이 이기면 방어 성공, 직전에 진 팀은 리벤지 실패", () => {
      expect(name(revengeDefended, teamBWins, "b2")).toEqual({ label: "방어 성공", icon: "shield", isWin: true });
      expect(name(revengeDefended, teamBWins, "a2")).toEqual({ label: "리벤지 실패", icon: "revenge", isWin: false });
    });
  });

  it("경기하지 않은 회원이 기록하면 이긴 팀 기준 이름이다", () => {
    const streakStopped = { kind: "streak_stopper", defendingTeamIndex: 0, outcome: "streak_stopped" } as const;
    expect(name(streakStopped, teamBWins, "z")).toEqual({ label: "연승 저지", icon: "streak_stopper", isWin: true });
    const revengeDefended = { kind: "revenge", defendingTeamIndex: 1, outcome: "revenge_defended" } as const;
    expect(name(revengeDefended, teamBWins, null)).toEqual({ label: "방어 성공", icon: "shield", isWin: true });
  });

  it("일반 매치·결과 없음·승패가 갈리지 않은 경기는 null", () => {
    expect(name(null, teamAWins, "a1")).toBeNull();
    expect(name({ kind: "champions", defendingTeamIndex: null, outcome: null }, teamAWins, "a1")).toBeNull();
    expect(
      name({ kind: "champions", defendingTeamIndex: null, outcome: "champions_won" }, [{ scoreA: 11, scoreB: 11 }], "a1"),
    ).toBeNull();
    expect(getSpecialMatchResultName({ teams, scores: teamAWins }, "a1")).toBeNull();
  });
});
