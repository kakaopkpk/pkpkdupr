import { getWinningTeamIndex, type MatchScore } from "@pkpkdupr/shared/match";
import {
  getSpecialMatchResultName,
  type SpecialMatchResultIcon,
  type SpecialMatchResultSource,
} from "@/lib/specialMatchResult";

/** 이긴 팀 점수가 이 이상이면 듀스까지 간 경기다(11점제) */
export const MATCH_RESULT_DEUCE_WINNING_SCORE = 12;

/** 점수 아래 결과 이름. 일반 매치 이름은 아이콘이 없다 */
export interface MatchResultName {
  label: string;
  icon: SpecialMatchResultIcon | null;
  /** 보는 회원 팀이 이겼는지. 이기면 블루, 지면 회색이다 */
  isWin: boolean;
}

interface MatchResultInput {
  specialMatch?: SpecialMatchResultSource | null;
  teams: readonly { players: readonly { id: string }[] }[];
  scores?: readonly MatchScore[] | null;
}

/** 일반 매치 [이겼을 때, 졌을 때] 이름. 완승·참패 → 듀스 승패 → 승리·패배 순서로 먼저 맞는 것이다 */
const getGeneralResultLabels = ({ scoreA, scoreB }: MatchScore): [string, string] => {
  if (Math.min(scoreA, scoreB) === 0) return ["완승", "참패"];
  if (Math.max(scoreA, scoreB) >= MATCH_RESULT_DEUCE_WINNING_SCORE) {
    return ["진땀승", "아쉬운 패배"];
  }
  return ["승리", "패배"];
};

/**
 * 기록 완료·경기 상세 점수 아래 결과 이름(docs/design.md "경기 기록·수정"). 보는 회원 팀 기준이고,
 * 특수 매치 결과가 있으면 그 이름이 먼저다.
 * 보는 회원이 경기하지 않았거나 승패가 갈리지 않은 경기(점수 없음 포함)는 null
 */
export const getMatchResultName = (
  match: MatchResultInput,
  viewerId: string | null | undefined,
): MatchResultName | null => {
  const winningTeamIndex = getWinningTeamIndex(match);
  const [score] = match.scores ?? [];
  if (winningTeamIndex == null || !score) return null;
  const viewerTeamIndex = match.teams.findIndex((team) =>
    team.players.some((player) => player.id === viewerId),
  );
  if (viewerTeamIndex !== 0 && viewerTeamIndex !== 1) return null;

  const isWin = viewerTeamIndex === winningTeamIndex;
  const special = match.specialMatch
    ? getSpecialMatchResultName(match.specialMatch, viewerTeamIndex, isWin)
    : null;
  if (special) return { ...special, isWin };

  const [winLabel, lossLabel] = getGeneralResultLabels(score);
  return { label: isWin ? winLabel : lossLabel, icon: null, isWin };
};
