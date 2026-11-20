import React from "react";
import {
  type AvatarPlayer,
  type SessionWinStreakByPlayer,
  TeamAvatars,
} from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import { formatRating } from "@/utils/dupr";

/** 팀 아바타 쌍 + 이름 두 줄. 오른쪽 팀(align="end")은 아바타가 바깥쪽에 온다 */
const TeamBlock: React.FC<{
  players: readonly AvatarPlayer[];
  align?: "start" | "end";
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({ players, align = "start", sessionWinStreaks }) => (
  <div
    className={cx(
      "flex min-w-0 items-center gap-2",
      align === "end" && "flex-row-reverse text-right",
    )}
  >
    <TeamAvatars
      players={players}
      size={24}
      sessionWinStreaks={sessionWinStreaks}
    />
    <span className="flex min-w-0 flex-col text-pk-13 font-bold leading-[1.35] text-pk-ink">
      {players.map((player) => (
        <span key={player.id} className="truncate">
          {player.username}
        </span>
      ))}
    </span>
  </div>
);

/** 두 팀을 "vs"로 나란히 놓는다. sessionWinStreaks에 든 회원 아바타는 세션 연승 링을 두른다 */
export const TeamsVersus: React.FC<{
  teams: readonly [readonly AvatarPlayer[], readonly AvatarPlayer[]];
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({ teams, sessionWinStreaks }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
    <TeamBlock players={teams[0]} sessionWinStreaks={sessionWinStreaks} />
    <span className="text-pk-12 font-bold text-pk-muted">vs</span>
    <TeamBlock
      players={teams[1]}
      align="end"
      sessionWinStreaks={sessionWinStreaks}
    />
  </div>
);

/** 위에 두 팀 평균 평점(양 끝 정렬), 아래에 팀 vs 팀. 추천 매칭 줄·대진 예정 경기 줄의 왼쪽 열 */
export const TeamsVersusWithAverages: React.FC<{
  teams: readonly [readonly AvatarPlayer[], readonly AvatarPlayer[]];
  averages: readonly [number, number];
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({ teams, averages, sessionWinStreaks }) => (
  <div className="flex min-w-0 flex-1 flex-col gap-1">
    <div className="flex justify-between gap-2 text-pk-12 text-pk-muted tabular-nums">
      <span>평균 {formatRating(averages[0])}</span>
      <span>평균 {formatRating(averages[1])}</span>
    </div>
    <TeamsVersus teams={teams} sessionWinStreaks={sessionWinStreaks} />
  </div>
);
