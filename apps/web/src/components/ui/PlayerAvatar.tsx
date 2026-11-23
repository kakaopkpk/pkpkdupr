import React, { useState } from "react";
import { resolveAssetUrl } from "@/lib/api";
import { getAvatarBackground, getAvatarInitial } from "@/utils/avatar";
import { cx } from "./cx";
import { SessionWinStreakFrame } from "./WinStreakAvatarFrame";

export interface AvatarPlayer {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

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
        getAvatarInitial(player.username)
      )}
    </span>
  );
};

/** 팀 아바타 쌍에서 뒤 아바타가 앞 아바타와 겹치는 폭(px) */
export const TEAM_AVATAR_OVERLAP = 6;

/** 회원 id → 진행 중 세션 연승. 들어 있는 회원 아바타에 세션 연승 링(태그 없음)을 두른다 */
export type SessionWinStreakByPlayer = ReadonlyMap<string, number>;

/** 팀 아바타 쌍. 뒤 아바타는 overlap(기본 TEAM_AVATAR_OVERLAP)만큼 겹치고, 둘레의 2px 테로 구분한다 */
export const TeamAvatars: React.FC<{
  players: readonly AvatarPlayer[];
  size: number;
  /** 테 색. 아바타가 놓인 바탕색과 맞춘다(기본 흰색) */
  ringColor?: string;
  overlap?: number;
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({
  players,
  size,
  ringColor = "#ffffff",
  overlap = TEAM_AVATAR_OVERLAP,
  sessionWinStreaks,
}) => (
  <span aria-hidden="true" className="inline-flex shrink-0">
    {players.map((player, index) => (
      <span
        key={player.id}
        className="inline-flex rounded-full"
        style={{
          boxShadow: `0 0 0 2px ${ringColor}`,
          marginLeft: index > 0 ? -overlap : undefined,
        }}
      >
        <SessionWinStreakFrame winStreak={sessionWinStreaks?.get(player.id)}>
          <PlayerAvatar player={player} size={size} />
        </SessionWinStreakFrame>
      </span>
    ))}
  </span>
);
