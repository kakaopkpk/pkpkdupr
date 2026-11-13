import React from "react";
import { type AvatarPlayer, TeamAvatars } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";

/** 팀 아바타 쌍 + 이름 두 줄. 오른쪽 팀(align="end")은 아바타가 바깥쪽에 온다 */
export const TeamBlock: React.FC<{
  players: readonly AvatarPlayer[];
  align?: "start" | "end";
  size?: 24 | 28;
}> = ({ players, align = "start", size = 24 }) => (
  <div
    className={cx(
      "flex min-w-0 items-center gap-2",
      align === "end" && "flex-row-reverse text-right",
    )}
  >
    <TeamAvatars players={players} size={size} />
    <span
      className={cx(
        "flex min-w-0 flex-col font-bold leading-[1.35] text-pk-ink",
        size === 28 ? "text-pk-15" : "text-pk-13",
      )}
    >
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
  size?: 24 | 28;
}> = ({ teams, size }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
    <TeamBlock players={teams[0]} size={size} />
    <span className="text-pk-12 font-bold text-pk-muted">vs</span>
    <TeamBlock players={teams[1]} size={size} align="end" />
  </div>
);
