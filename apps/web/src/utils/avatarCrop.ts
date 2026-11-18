/**
 * 프로필 사진 조정 화면의 좌표 계산.
 * 위치는 원 지름을 1로 둔 단위라 화면 크기가 바뀌어도 같은 영역을 가리킨다.
 */

export const AVATAR_CROP_MIN_SCALE = 1;
export const AVATAR_CROP_MAX_SCALE = 4;

export interface AvatarImageSize {
  width: number;
  height: number;
}

/**
 * scale 1은 사진의 짧은 변이 원 지름과 같은 크기다.
 * x·y는 원 중심에서 사진 중심까지의 거리(원 지름 단위, 오른쪽·아래가 +)다.
 */
export interface AvatarCropView {
  scale: number;
  x: number;
  y: number;
}

/** 짧은 변을 원에 맞추고 가운데 둔 처음 상태 */
export const INITIAL_AVATAR_CROP_VIEW: AvatarCropView = { scale: 1, x: 0, y: 0 };

/** 원 지름 단위로 본 지금 사진 크기 */
export const getDisplayedImageSize = (
  image: AvatarImageSize,
  scale: number,
): AvatarImageSize => {
  const shortSide = Math.min(image.width, image.height);
  return {
    width: (image.width / shortSide) * scale,
    height: (image.height / shortSide) * scale,
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** 크기를 1~4배로, 위치를 원 안에 빈 곳이 생기지 않는 범위로 자른다 */
export const clampAvatarCropView = (
  view: AvatarCropView,
  image: AvatarImageSize,
): AvatarCropView => {
  const scale = clamp(view.scale, AVATAR_CROP_MIN_SCALE, AVATAR_CROP_MAX_SCALE);
  const displayed = getDisplayedImageSize(image, scale);
  const maxX = Math.max(0, (displayed.width - 1) / 2);
  const maxY = Math.max(0, (displayed.height - 1) / 2);
  return {
    scale,
    x: clamp(view.x, -maxX, maxX),
    y: clamp(view.y, -maxY, maxY),
  };
};

/** 원 중심 기준 focal 지점(원 지름 단위)이 제자리에 있도록 크기를 바꾼다 */
export const zoomAvatarCropViewAt = (
  view: AvatarCropView,
  nextScale: number,
  focal: { x: number; y: number },
  image: AvatarImageSize,
): AvatarCropView => {
  const scale = clamp(nextScale, AVATAR_CROP_MIN_SCALE, AVATAR_CROP_MAX_SCALE);
  const ratio = scale / view.scale;
  return clampAvatarCropView(
    {
      scale,
      x: focal.x - (focal.x - view.x) * ratio,
      y: focal.y - (focal.y - view.y) * ratio,
    },
    image,
  );
};

export const isInitialAvatarCropView = (view: AvatarCropView): boolean =>
  Math.abs(view.scale - 1) < 1e-3 &&
  Math.abs(view.x) < 1e-3 &&
  Math.abs(view.y) < 1e-3;

export interface AvatarCropRect {
  x: number;
  y: number;
  size: number;
}

/** 원 안 영역을 원본 사진 픽셀 좌표의 정사각형으로 바꾼다 */
export const getAvatarCropSourceRect = (
  view: AvatarCropView,
  image: AvatarImageSize,
): AvatarCropRect => {
  const clamped = clampAvatarCropView(view, image);
  const shortSide = Math.min(image.width, image.height);
  // 원 지름 1이 원본 몇 px인지
  const size = shortSide / clamped.scale;
  const centerX = image.width / 2 - clamped.x * size;
  const centerY = image.height / 2 - clamped.y * size;
  return {
    x: clamp(centerX - size / 2, 0, image.width - size),
    y: clamp(centerY - size / 2, 0, image.height - size),
    size,
  };
};

/** 저장 크기. 원본 영역이 maxSize보다 작으면 키우지 않는다 */
export const getAvatarCropOutputSize = (sourceSize: number, maxSize: number) =>
  Math.max(1, Math.min(maxSize, Math.round(sourceSize)));
