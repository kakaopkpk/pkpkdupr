import {
  getWinningTeamIndex,
  type MatchScore,
  type MatchSessionParticipant,
  type MatchStatus,
} from "./match.js";

export type TournamentPlace = 1 | 2 | 3;
export const TOURNAMENT_PLACES: readonly TournamentPlace[] = [1, 2, 3];

export const isTournamentPlace = (value: unknown): value is TournamentPlace =>
  (TOURNAMENT_PLACES as readonly unknown[]).includes(value);

/** 참가 단위의 대진 승패 */
export interface TournamentUnitRecord {
  wins: number;
  losses: number;
}

/** 대회 최종 순위 한 칸. 관리자가 직접 정한다 */
export interface TournamentPlacement {
  place: TournamentPlace;
  /** 참가 단위(1명·2명·팀). 관리자가 고른 순서이고 첫 사람이 대표 */
  players: MatchSessionParticipant[];
  /** 라운드 있는 완료 경기에서 이 단위의 승패를 셀 수 있을 때만. 셀 경기가 없으면 null */
  record: TournamentUnitRecord | null;
}

/** PUT /api/admin/match-sessions/:sessionId/placements 요청. 빠진 순위는 비우고, 빈 배열이면 순위를 모두 지운다 */
export interface AdminUpdateTournamentPlacementsRequest {
  placements: { place: TournamentPlace; playerIds: string[] }[];
}

/** 승패를 세는 데 필요한 경기 정보. Match를 그대로 넘겨도 된다 */
export interface TournamentRecordMatch {
  status: MatchStatus;
  round?: number | null;
  teams: readonly { players: readonly { id: string }[] }[];
  scores?: readonly MatchScore[] | null;
}

/**
 * 참가 단위의 대진 승패를 센다. 센 경기가 없으면 null.
 * - 라운드 있는 completed 경기만 센다.
 * - 단위의 팀은 팀 선수가 모두 단위에 있는 팀이고, 1명 단위면 그 사람이 든 팀이다.
 * - 두 팀 모두 단위의 팀이거나 어느 팀도 아니면, 또는 승패가 갈리지 않았으면 세지 않는다.
 */
export const countTournamentUnitRecord = (
  unitPlayerIds: readonly string[],
  matches: readonly TournamentRecordMatch[],
): TournamentUnitRecord | null => {
  const unit = new Set(unitPlayerIds);
  if (unit.size === 0) return null;

  const isUnitTeam = (team: TournamentRecordMatch["teams"][number]) =>
    unit.size === 1
      ? team.players.some((player) => unit.has(player.id))
      : team.players.length > 0 &&
        team.players.every((player) => unit.has(player.id));

  const record: TournamentUnitRecord = { wins: 0, losses: 0 };
  for (const match of matches) {
    if (match.status !== "completed" || match.round == null) continue;
    const unitTeamIndexes = match.teams.flatMap((team, index) =>
      isUnitTeam(team) ? [index] : [],
    );
    if (unitTeamIndexes.length !== 1) continue;
    const winner = getWinningTeamIndex(match);
    if (winner === null) continue;
    if (winner === unitTeamIndexes[0]) record.wins += 1;
    else record.losses += 1;
  }
  return record.wins + record.losses > 0 ? record : null;
};
