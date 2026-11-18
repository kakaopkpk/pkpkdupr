import React from "react";
import { type AvatarPlayer, TeamAvatars } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";

/** 팀 아바타 쌍 + 이름 두 줄. 오른쪽 팀(align="end")은 아바타가 바깥쪽에 온다 */
const TeamBlock: React.FC<{
  players: readonly AvatarPlayer[];
  align?: "start" | "end";
}> = ({ players, align = "start" }) => (
  <div
    className={cx(
      "flex min-w-0 items-center gap-2",
      align === "end" && "flex-row-reverse text-right",
    )}
  >
    <TeamAvatars players={players} size={24} />
    <span className="flex min-w-0 flex-col text-pk-13 font-bold leading-[1.35] text-pk-ink">
      {players.map((player) => (
        <span key={player.id} className="truncate">
          {player.username}
        </span>
      ))}
    </span>
  </div>
);

/** 두 팀을 "vs"로 나란히 놓는다 */
export const TeamsVersus: React.FC<{
  teams: readonly [readonly AvatarPlayer[], readonly AvatarPlayer[]];
}> = ({ teams }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
    <TeamBlock players={teams[0]} />
    <span className="text-pk-12 font-bold text-pk-muted">vs</span>
    <TeamBlock players={teams[1]} align="end" />
  </div>
);
