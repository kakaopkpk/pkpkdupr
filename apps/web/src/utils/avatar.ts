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
