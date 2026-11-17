import React from "react";
import { cx } from "./cx";

const AVATAR_BACKGROUNDS = ["bg-pk-primary", "bg-pk-deep", "bg-pk-primary-mid"];

// 같은 아이디는 늘 같은 색이 되도록 아이디로 고른다
const pickBackground = (username: string) => {
  let hash = 0;
  for (const char of username) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_BACKGROUNDS[hash % AVATAR_BACKGROUNDS.length];
};

/** 사진이 있으면 사진, 없으면 아이디 첫 글자(대문자) 원. 기본 28px */
export const PlayerAvatar: React.FC<{
  player: { username: string; avatarUrl?: string };
  size?: number;
  className?: string;
}> = ({ player, size = 28, className }) => {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (player.avatarUrl) {
    return (
      <img
        src={player.avatarUrl}
        alt=""
        style={style}
        className={cx("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        pickBackground(player.username),
        className,
      )}
    >
      {player.username.charAt(0).toUpperCase()}
    </span>
  );
};
