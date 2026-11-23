import { resolveAssetUrl } from "@/lib/api";
import { loadShareImage, SHARE_SCALE, shareFont } from "@/lib/shareImageCanvas";
import { getAvatarBackground, getAvatarInitial } from "@/utils/avatar";

/* 공유 이미지(특수 매치·세션 리포트)에 그리는 회원 아바타 원. 사진을 못 그리면 이니셜 원이다. */

const AVATAR_TIMEOUT_MS = 5000;

export interface ShareAvatarPlayer {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

export type ShareAvatars = Map<string, HTMLImageElement | null>;

/** 회원 사진을 한 번에 불러온다. 못 불러오거나 오래 걸린 사진은 null이라 이니셜로 그린다 */
export const loadShareAvatars = async (players: ShareAvatarPlayer[]): Promise<ShareAvatars> => {
  const entries = await Promise.all(
    players.map(
      async (player) =>
        [
          player.id,
          await loadShareImage(resolveAssetUrl(player.avatarUrl), {
            crossOrigin: true,
            timeoutMs: AVATAR_TIMEOUT_MS,
          }),
        ] as const,
    ),
  );
  return new Map(entries);
};

/** 아바타 원 하나를 따로 그린다. gray면 CSS grayscale(1) brightness(0.97)과 같은 회색으로 바꾼다 */
const renderAvatar = (
  player: ShareAvatarPlayer,
  image: HTMLImageElement | null,
  size: number,
  gray: boolean,
  ink: string,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * SHARE_SCALE);
  canvas.height = canvas.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(SHARE_SCALE, SHARE_SCALE);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = getAvatarBackground(player.id);
  ctx.fillRect(0, 0, size, size);
  if (image) {
    // object-fit: cover
    const ratio = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  } else {
    // PlayerAvatar 이니셜과 같은 크기(지름의 0.42)
    ctx.fillStyle = ink;
    ctx.font = shareFont(800, Math.round(size * 0.42));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getAvatarInitial(player.username), size / 2, size / 2);
  }
  if (gray) {
    // ctx.filter를 못 쓰는 브라우저(Safari)가 있어 픽셀을 직접 바꾼다
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = data.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance =
        (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) * 0.97;
      pixels[index] = luminance;
      pixels[index + 1] = luminance;
      pixels[index + 2] = luminance;
    }
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
};

/** (cx, cy)를 가운데로 아바타 원을 그린다 */
export const drawShareAvatar = (
  ctx: CanvasRenderingContext2D,
  avatars: ShareAvatars,
  player: ShareAvatarPlayer,
  { cx, cy, size, ink, gray = false }: { cx: number; cy: number; size: number; ink: string; gray?: boolean },
) => {
  const avatar = renderAvatar(player, avatars.get(player.id) ?? null, size, gray, ink);
  ctx.drawImage(avatar, cx - size / 2, cy - size / 2, size, size);
};
