import type { SpecialMatch, SpecialMatchKind } from "@pkpkdupr/shared/specialMatch";

/**
 * 결과 이름 아이콘. 유형 아이콘 그대로이거나 지키는 쪽(도전 매치 방어·리벤지 방어)은 방패다.
 * 연승 회원 팀은 최강자전과 같은 불꽃(`champions`)을 쓴다
 */
export type SpecialMatchResultIcon = SpecialMatchKind | "shield";

export interface SpecialMatchResultName {
  label: string;
  icon: SpecialMatchResultIcon;
}

export type SpecialMatchResultSource = Pick<SpecialMatch, "kind" | "defendingTeamIndex" | "outcome">;

/**
 * 특수 매치 결과 이름(docs/design.md "경기 기록·수정"). 보는 회원 팀의 역할과 승패로 정한다.
 * 결과(`outcome`)가 아직 없으면 null
 */
export const getSpecialMatchResultName = (
  specialMatch: SpecialMatchResultSource,
  viewerTeamIndex: 0 | 1,
  isWin: boolean,
): SpecialMatchResultName | null => {
  if (!specialMatch.outcome) return null;
  // 최강자전과 양쪽 다 도전인 도전 매치는 지키는 쪽이 없다
  const isDefending = specialMatch.defendingTeamIndex === viewerTeamIndex;

  switch (specialMatch.kind) {
    case "challenge":
      // 도전 매치 성공·실패는 승패가 아니라 서버가 정한 순위 역전 결과로 정한다
      return isDefending
        ? { label: specialMatch.outcome === "defense_success" ? "방어 성공" : "방어 실패", icon: "shield" }
        : {
            label: specialMatch.outcome === "challenge_success" && isWin ? "도전 성공" : "도전 실패",
            icon: "challenge",
          };
    case "streak_stopper":
      return isDefending
        ? { label: isWin ? "연승 연장" : "연승 끝", icon: "champions" }
        : { label: isWin ? "연승 저지" : "저지 실패", icon: "streak_stopper" };
    case "champions":
      return { label: isWin ? "최강자전 승리" : "최강자전 패배", icon: "champions" };
    case "revenge":
      return isDefending
        ? { label: isWin ? "방어 성공" : "방어 실패", icon: "shield" }
        : { label: isWin ? "리벤지 성공" : "리벤지 실패", icon: "revenge" };
  }
};
