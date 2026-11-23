import { type AvatarCropRect, getAvatarCropOutputSize } from "./avatarCrop";

/** 프로필 사진 확대 보기(240px 원)가 레티나 화면에서도 선명하도록 512px로 저장한다 */
const MAX_AVATAR_SIZE = 512;
const AVATAR_JPEG_QUALITY = 0.85;

/** 고른 파일이 이미지인지 확인하고 조정 화면에 띄울 object URL을 만든다. 다 쓰면 URL.revokeObjectURL로 해제한다 */
export const createAvatarSourceUrl = (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 선택할 수 있습니다.");
  }
  return URL.createObjectURL(file);
};

/** 원본 사진의 rect 영역을 정사각형 JPEG data URL로 그린다. 원본 영역이 MAX_AVATAR_SIZE보다 작으면 키우지 않는다 */
export const cropAvatarImage = (
  image: HTMLImageElement,
  rect: AvatarCropRect,
) => {
  const outputSize = getAvatarCropOutputSize(rect.size, MAX_AVATAR_SIZE);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지를 처리하지 못했습니다.");
  }

  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.size,
    rect.size,
    0,
    0,
    outputSize,
    outputSize,
  );

  return canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY);
};

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
