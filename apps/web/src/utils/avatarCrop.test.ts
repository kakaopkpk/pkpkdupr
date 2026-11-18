import { describe, expect, it } from "vitest";
import {
  clampAvatarCropView,
  getAvatarCropOutputSize,
  getAvatarCropSourceRect,
  INITIAL_AVATAR_CROP_VIEW,
  isInitialAvatarCropView,
  zoomAvatarCropViewAt,
} from "./avatarCrop";

const landscape = { width: 1200, height: 800 };
const portrait = { width: 600, height: 900 };

describe("getAvatarCropSourceRect", () => {
  it("처음 상태는 가운데 정사각형 자르기와 같다", () => {
    expect(getAvatarCropSourceRect(INITIAL_AVATAR_CROP_VIEW, landscape)).toEqual({
      x: 200,
      y: 0,
      size: 800,
    });
    expect(getAvatarCropSourceRect(INITIAL_AVATAR_CROP_VIEW, portrait)).toEqual({
      x: 0,
      y: 150,
      size: 600,
    });
  });

  it("2배면 원 안 영역이 절반 크기가 되고, 사진을 왼쪽으로 옮기면 오른쪽 영역을 가리킨다", () => {
    const rect = getAvatarCropSourceRect({ scale: 2, x: -0.5, y: 0 }, landscape);
    expect(rect.size).toBe(400);
    expect(rect.x).toBe(600);
    expect(rect.y).toBe(200);
  });

  it("범위를 넘는 위치는 사진 안으로 자른다", () => {
    const rect = getAvatarCropSourceRect({ scale: 1, x: -5, y: 3 }, landscape);
    expect(rect).toEqual({ x: 400, y: 0, size: 800 });
  });
});

describe("clampAvatarCropView", () => {
  it("크기를 1~4배로 자른다", () => {
    expect(clampAvatarCropView({ scale: 0.5, x: 0, y: 0 }, landscape).scale).toBe(1);
    expect(clampAvatarCropView({ scale: 9, x: 0, y: 0 }, landscape).scale).toBe(4);
  });

  it("짧은 변 쪽은 1배에서 움직일 수 없고 긴 변 쪽은 남는 만큼만 움직인다", () => {
    const view = clampAvatarCropView({ scale: 1, x: 2, y: 2 }, landscape);
    expect(view.x).toBeCloseTo(0.25);
    expect(view.y).toBe(0);
  });
});

describe("zoomAvatarCropViewAt", () => {
  it("가운데를 기준으로 키우면 위치가 그대로다", () => {
    const view = zoomAvatarCropViewAt(INITIAL_AVATAR_CROP_VIEW, 2, { x: 0, y: 0 }, landscape);
    expect(view).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it("기준점이 제자리에 있도록 위치를 옮긴다", () => {
    const view = zoomAvatarCropViewAt(INITIAL_AVATAR_CROP_VIEW, 2, { x: 0.25, y: 0.25 }, landscape);
    expect(view.scale).toBe(2);
    expect(view.x).toBeCloseTo(-0.25);
    expect(view.y).toBeCloseTo(-0.25);
  });

  it("줄여서 1배가 되면 원 밖으로 나간 위치를 되돌린다", () => {
    const view = zoomAvatarCropViewAt({ scale: 3, x: 1, y: 1 }, 1, { x: 0, y: 0 }, landscape);
    expect(view.scale).toBe(1);
    expect(view.x).toBeCloseTo(0.25);
    expect(view.y).toBe(0);
  });
});

describe("isInitialAvatarCropView", () => {
  it("처음 상태인지 본다", () => {
    expect(isInitialAvatarCropView(INITIAL_AVATAR_CROP_VIEW)).toBe(true);
    expect(isInitialAvatarCropView({ scale: 1, x: 0.1, y: 0 })).toBe(false);
    expect(isInitialAvatarCropView({ scale: 1.5, x: 0, y: 0 })).toBe(false);
  });
});

describe("getAvatarCropOutputSize", () => {
  it("최대 크기로 줄이고 작은 원본은 키우지 않는다", () => {
    expect(getAvatarCropOutputSize(800, 512)).toBe(512);
    expect(getAvatarCropOutputSize(300.4, 512)).toBe(300);
  });
});
