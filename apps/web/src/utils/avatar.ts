/** 프로필 사진 확대 보기(240px 원)가 레티나 화면에서도 선명하도록 512px로 저장한다 */
const MAX_AVATAR_SIZE = 512;
const AVATAR_JPEG_QUALITY = 0.85;

const readImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    image.src = src;
  });

export const resizeAvatarImage = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 선택할 수 있습니다.");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await readImage(objectUrl);
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (!sourceSize) {
      throw new Error("이미지 크기를 확인하지 못했습니다.");
    }

    const outputSize = Math.min(MAX_AVATAR_SIZE, sourceSize);
    const sourceX = Math.floor((image.naturalWidth - sourceSize) / 2);
    const sourceY = Math.floor((image.naturalHeight - sourceSize) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("이미지를 처리하지 못했습니다.");
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      outputSize,
      outputSize,
    );

    return canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
