import { getWinningTeamIndex, type MatchScore } from "@pkpkdupr/shared/match";
import type { SpecialMatch, SpecialMatchKind } from "@pkpkdupr/shared/specialMatch";

/**
 * 결과 이름 아이콘. 유형 아이콘 그대로이거나 지키는 쪽(도전 매치 방어·리벤지 방어)은 방패다.
 * 연승 회원 팀은 최강자전과 같은 불꽃(`champions`)을 쓴다
 */
export type SpecialMatchResultIcon = SpecialMatchKind | "shield";

export interface SpecialMatchResultName {
  label: string;
  icon: SpecialMatchResultIcon;
  /** 기록한 회원 쪽(경기하지 않았으면 이긴 팀)이 이겼는지. 이기면 블루, 지면 회색이다 */
  isWin: boolean;
}

export type SpecialMatchResultSource = Pick<SpecialMatch, "kind" | "defendingTeamIndex" | "outcome">;

interface SpecialMatchResultInput {
  specialMatch?: SpecialMatchResultSource | null;
  teams: readonly { players: readonly { id: string }[] }[];
  scores?: readonly MatchScore[] | null;
}

/**
 * 기록 완료 점수 아래 결과 이름(docs/design.md "경기 기록·수정").
 * 기록한 회원이 낀 팀의 역할과 승패로 정하고, 경기하지 않은 회원이면 이긴 팀 기준이다.
 * 일반 매치·결과가 없는 경기(승패가 갈리지 않음)는 null
 */
export const getSpecialMatchResultName = (
  match: SpecialMatchResultInput,
  viewerId: string | null | undefined,
): SpecialMatchResultName | null => {
  const specialMatch = match.specialMatch;
  if (!specialMatch?.outcome) return null;
  const winningTeamIndex = getWinningTeamIndex(match);
  if (winningTeamIndex == null) return null;

  const viewerTeamIndex = match.teams.findIndex((team) =>
    team.players.some((player) => player.id === viewerId),
  );
  const teamIndex = viewerTeamIndex >= 0 ? viewerTeamIndex : winningTeamIndex;
  const isWin = teamIndex === winningTeamIndex;
  // 최강자전과 양쪽 다 도전인 도전 매치는 지키는 쪽이 없다
  const isDefending = specialMatch.defendingTeamIndex === teamIndex;

  const name = ((): Omit<SpecialMatchResultName, "isWin"> => {
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
  })();
  return { ...name, isWin };
};
