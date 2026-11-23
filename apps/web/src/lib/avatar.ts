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

/** 같은 선수는 어느 화면(공유 이미지 포함)에서든 같은 배경색이 되도록 id 해시로 고른다 */
export const getAvatarBackground = (playerId: string) => {
  let hash = 0;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) | 0;
  }
  return AVATAR_BACKGROUNDS[Math.abs(hash) % AVATAR_BACKGROUNDS.length];
};

/** 사진이 없을 때 아바타에 쓰는 첫 글자 */
export const getAvatarInitial = (username: string) =>
  (Array.from(username.trim())[0] ?? "?").toUpperCase();
