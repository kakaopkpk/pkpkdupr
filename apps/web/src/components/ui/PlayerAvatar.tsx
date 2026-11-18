import React, { useState } from "react";
import { resolveAssetUrl } from "@/lib/api";
import { cx } from "./cx";

export interface AvatarPlayer {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

const AVATAR_BACKGROUNDS = [
  "#f2cdc4",
  "#c9d4f2",
  "#c8e5d3",
  "#e2d3f0",
  "#efd0dc",
  "#f2e2b8",
  "#c6e3ec",
  "#d9dde6",
] as const;

/** 같은 선수는 어느 화면에서든 같은 배경색이 되도록 id 해시로 고른다 */
const getAvatarBackground = (playerId: string) => {
  let hash = 0;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) | 0;
  }
  return AVATAR_BACKGROUNDS[Math.abs(hash) % AVATAR_BACKGROUNDS.length];
};

const getInitial = (username: string) =>
  (Array.from(username.trim())[0] ?? "?").toUpperCase();

export const PlayerAvatar: React.FC<{
  player: AvatarPlayer;
  size: number;
  className?: string;
  /** 사진을 다 불러왔을 때 그 URL로 부른다 */
  onImageLoad?: (url: string) => void;
}> = ({ player, size, className, onImageLoad }) => {
  const avatarUrl = resolveAssetUrl(player.avatarUrl);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!avatarUrl && failedUrl !== avatarUrl;

  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold leading-none text-pk-ink",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        backgroundColor: getAvatarBackground(player.id),
      }}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onLoad={() => onImageLoad?.(avatarUrl)}
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        getInitial(player.username)
      )}
    </span>
  );
};

/** 팀 아바타 쌍에서 뒤 아바타가 앞 아바타와 겹치는 폭(px) */
export const TEAM_AVATAR_OVERLAP = 6;

/** 팀 아바타 쌍. 뒤 아바타는 TEAM_AVATAR_OVERLAP만큼 겹치고, 둘레의 2px 테로 구분한다 */
export const TeamAvatars: React.FC<{
  players: readonly AvatarPlayer[];
  size: number;
  /** 테 색. 아바타가 놓인 바탕색과 맞춘다(기본 흰색) */
  ringColor?: string;
}> = ({ players, size, ringColor = "#ffffff" }) => (
  <span aria-hidden="true" className="inline-flex shrink-0">
    {players.map((player, index) => (
      <span
        key={player.id}
        className="inline-flex rounded-full"
        style={{
          boxShadow: `0 0 0 2px ${ringColor}`,
          marginLeft: index > 0 ? -TEAM_AVATAR_OVERLAP : undefined,
        }}
      >
        <PlayerAvatar player={player} size={size} />
      </span>
    ))}
  </span>
);
