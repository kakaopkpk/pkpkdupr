import React, { useMemo } from "react";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { Chip } from "../../components/ui/Chip";
import { cx } from "../../components/ui/cx";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { PlayerPicker } from "../../components/ui/PlayerPicker";
import { textInputClassName } from "../../components/ui/TextInput";
import {
  getLineupWinnerIndex,
  MAX_TEAM_SIZE,
  type MatchLineupValue,
} from "./matchLineup";
import { DELETED_PLAYER_LABEL } from "./matchView";

const TEAM_INDEXES = [0, 1] as const;

/** 팀 1·팀 2 선수 칩·콤보박스·점수 입력 */
export const MatchLineupEditor: React.FC<{
  value: MatchLineupValue;
  onChange: (value: MatchLineupValue) => void;
  /** 이름·게스트 여부를 찾을 회원 전체(비활성 포함). 후보는 이 중 활성 회원·게스트 */
  players: AdminPlayer[];
  disabled?: boolean;
}> = ({ value, onChange, players, disabled = false }) => {
  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const candidates = useMemo(
    () => players.filter((player) => player.status === "active"),
    [players],
  );
  const selectedIds = useMemo(() => value.teams.flat(), [value.teams]);
  const winnerIndex = getLineupWinnerIndex(value);

  const updateTeam = (teamIndex: 0 | 1, playerIds: string[]) => {
    const teams: MatchLineupValue["teams"] = [...value.teams];
    teams[teamIndex] = playerIds;
    onChange({ ...value, teams });
  };

  const updateScore = (teamIndex: 0 | 1, score: string) => {
    const scores: MatchLineupValue["scores"] = [...value.scores];
    scores[teamIndex] = score;
    onChange({ ...value, scores });
  };

  return (
    <div className="space-y-4">
      {TEAM_INDEXES.map((teamIndex) => {
        const teamIds = value.teams[teamIndex];
        const label = `팀 ${teamIndex + 1}`;
        return (
          <div key={teamIndex} className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-pk-12 font-bold text-pk-muted">{label}</div>
              {teamIds.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label={`${label} 선수`}>
                  {teamIds.map((playerId) => {
                    const player = playersById.get(playerId);
                    const username = player?.username ?? DELETED_PLAYER_LABEL;
                    return (
                      <li
                        key={playerId}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pk-bg pl-1 pr-1.5 text-pk-13 font-semibold text-pk-ink"
                      >
                        <PlayerAvatar
                          player={{ username, avatarUrl: player?.avatarUrl }}
                          size={24}
                        />
                        <span>{username}</span>
                        {player?.isGuest && <Chip className="h-5 px-2">게스트</Chip>}
                        {!disabled && (
                          <button
                            type="button"
                            aria-label={`${label}에서 ${username} 빼기`}
                            onClick={() =>
                              updateTeam(
                                teamIndex,
                                teamIds.filter((id) => id !== playerId),
                              )
                            }
                            className="flex size-6 items-center justify-center rounded-full text-pk-12 text-pk-muted hover:bg-pk-neutral hover:text-pk-sub focus-visible:outline-2 focus-visible:outline-pk-primary"
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {!disabled && teamIds.length < MAX_TEAM_SIZE && (
                <PlayerPicker
                  players={candidates}
                  excludeIds={selectedIds}
                  placeholder={`${label} 아이디 검색`}
                  onSelect={(playerId) => updateTeam(teamIndex, [...teamIds, playerId])}
                />
              )}
            </div>
            <label className="w-20 shrink-0 space-y-2">
              <span className="block text-pk-12 font-bold text-pk-muted">점수</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`${label} 점수`}
                value={value.scores[teamIndex]}
                disabled={disabled}
                onChange={(event) => updateScore(teamIndex, event.target.value)}
                className={cx(
                  textInputClassName,
                  "text-center tabular-nums",
                  // 이긴 쪽 점수만 진하게 보인다
                  winnerIndex === teamIndex
                    ? "font-bold text-pk-ink"
                    : "font-normal text-pk-sub",
                )}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
};
