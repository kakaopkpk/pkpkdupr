import { getWinningTeamIndex } from "@pkpkdupr/shared/match";
import {
  getSpecialMatchResultName,
  type SpecialMatchResultIcon,
  type SpecialMatchResultName,
} from "@/lib/specialMatchResult";

/** 이긴 팀 점수가 이 이상이면 듀스까지 간 경기다(11점제) */
export const MATCH_RESULT_DEUCE_WINNING_SCORE = 12;

/** 점수 아래 결과 이름. 일반 매치 이름은 아이콘이 없다 */
export interface MatchResultName extends Omit<SpecialMatchResultName, "icon"> {
  icon: SpecialMatchResultIcon | null;
}

type MatchResultInput = Parameters<typeof getSpecialMatchResultName>[0];

/**
 * 기록 완료·경기 상세 점수 아래 결과 이름(docs/design.md "경기 기록·수정"). 보는 회원 팀 기준이다.
 * 특수 매치 결과가 있으면 그 이름이고, 아니면 완승·참패 → 듀스 승패 → 승리·패배 순서로 정한다.
 * 보는 회원이 경기하지 않았거나 승패가 갈리지 않은 경기(점수 없음 포함)는 null
 */
export const getMatchResultName = (
  match: MatchResultInput,
  viewerId: string | null | undefined,
): MatchResultName | null => {
  const special = getSpecialMatchResultName(match, viewerId);
  if (special) return special;

  const winningTeamIndex = getWinningTeamIndex(match);
  const [score] = match.scores ?? [];
  if (winningTeamIndex == null || !score) return null;
  const viewerTeamIndex = match.teams.findIndex((team) =>
    team.players.some((player) => player.id === viewerId),
  );
  if (viewerTeamIndex < 0) return null;

  const isWin = viewerTeamIndex === winningTeamIndex;
  const winningScore = Math.max(score.scoreA, score.scoreB);
  const losingScore = Math.min(score.scoreA, score.scoreB);
  const label =
    losingScore === 0
      ? isWin ? "완승" : "참패"
      : winningScore >= MATCH_RESULT_DEUCE_WINNING_SCORE
        ? isWin ? "힘겹게 쟁취한 승리" : "아쉬운 패배"
        : isWin ? "승리" : "패배";
  return { label, icon: null, isWin };
};
