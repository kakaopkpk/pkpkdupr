/*
 * 공유 이미지(업적·특수 매치) 공통 틀. 어두운 4:5 카드이며, 360×450 배치를 3배로 그려 1080×1350 PNG로 만든다.
 * 빛줄기·후광 크기는 축하 연출의 .pk-celebration-rays(520px 원)·.pk-celebration-glow(300px 원)와 같다.
 */
export const SHARE_WIDTH = 360;
export const SHARE_HEIGHT = 450;
export const SHARE_SCALE = 3;
export const SHARE_EDGE = 24;
export const SHARE_LINE_HEIGHT = 1.5;
const FONT_FAMILY = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, sans-serif';
// radial-gradient(circle)의 기본 크기(farthest-corner)는 정사각형 상자 반지름의 √2배다
const RAYS_RADIUS = 260 * Math.SQRT2;
const RAYS_FADE_START = RAYS_RADIUS * 0.12;
const RAYS_FADE_END = RAYS_RADIUS * 0.62;
const RAY_COUNT = 18;
const RAY_DEGREES = 7;
const GLOW_FADE_END = 150 * Math.SQRT2 * 0.62;
/** 아래 줄(아이디 15 + 2 + 날짜 12)의 높이 */
const FOOTER_HEIGHT = 15 * SHARE_LINE_HEIGHT + 2 + 12 * SHARE_LINE_HEIGHT;
/** 아래 줄 위 공간의 끝(가운데 묶음을 세로 가운데에 둘 때 쓴다) */
export const SHARE_CONTENT_BOTTOM = SHARE_HEIGHT - SHARE_EDGE - FOOTER_HEIGHT;

/** 그릴 때 쓰는 pk 토큰 색을 한 번에 읽는다 */
export const readTokenColors = <K extends string>(vars: Record<K, string>): Record<K, string> => {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries<string>(vars).map(([key, name]) => [key, style.getPropertyValue(name).trim()]),
  ) as Record<K, string>;
};

export const shareFont = (weight: number, size: number) => `${weight} ${size}px ${FONT_FAMILY}`;

export const setLetterSpacing = (ctx: CanvasRenderingContext2D, value: string) => {
  // 자간을 못 정하는 브라우저는 기본 자간으로 그린다
  if ("letterSpacing" in ctx) ctx.letterSpacing = value;
};

/** 하위 글자 묶음(unicode-range)으로 나뉜 웹폰트라 그릴 글자를 같이 넘겨 필요한 묶음을 받는다 */
export const loadShareFonts = async (texts: string[], weights: number[]) => {
  if (!document.fonts) return;
  const sample = texts.join("");
  await Promise.all(
    weights.map((weight) => document.fonts.load(shareFont(weight, 15), sample).catch(() => [])),
  );
};

/** 360×450 좌표로 그리는 3배 캔버스와 바탕을 만든다 */
export const createShareCanvas = (background: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_WIDTH * SHARE_SCALE;
  canvas.height = SHARE_HEIGHT * SHARE_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들지 못했어요");
  ctx.scale(SHARE_SCALE, SHARE_SCALE);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  return { canvas, ctx };
};

export const canvasToPngFile = async (canvas: HTMLCanvasElement, fileName: string) => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했어요");
  return new File([blob], fileName, { type: "image/png" });
};

/**
 * 같은 색의 완전 투명. 그라데이션 끝을 "transparent"(검정 투명)로 두면 중간이 검게 섞여
 * CSS 빛줄기(색은 그대로, 투명도만 줄어듦)보다 칙칙해진다
 */
export const toTransparent = (color: string) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return "transparent";
  const value = Number.parseInt(hex, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, 0)`;
};

export const drawRays = (ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) => {
  ctx.save();
  ctx.beginPath();
  // conic-gradient(from 0deg)처럼 위쪽부터 시계 방향으로 20도마다 7도씩 칠한다
  for (let index = 0; index < RAY_COUNT; index += 1) {
    const start = ((index * 360) / RAY_COUNT - 90) * (Math.PI / 180);
    const end = start + RAY_DEGREES * (Math.PI / 180);
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, RAYS_FADE_END, start, end);
    ctx.closePath();
  }
  const gradient = ctx.createRadialGradient(cx, cy, RAYS_FADE_START, cx, cy, RAYS_FADE_END);
  ctx.globalAlpha = 0.22;
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, toTransparent(color));
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
};

export const drawGlow = (ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) => {
  ctx.save();
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, GLOW_FADE_END);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, toTransparent(color));
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, GLOW_FADE_END, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/** 한 줄을 maxWidth 안에 넣고 넘치면 말줄임표로 자른다 */
export const fitLine = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) {
    chars.pop();
  }
  return `${chars.join("")}…`;
};

/** 아래 줄: 왼쪽 아이디(15 굵게 흰 글자)·날짜 줄(12, 흰색 70%), 오른쪽 pkpkdupr(아래 끝 맞춤) */
export const drawShareFooter = (
  ctx: CanvasRenderingContext2D,
  { username, dateLabel, white }: { username: string; dateLabel: string; white: string },
) => {
  const bottom = SHARE_HEIGHT - SHARE_EDGE;
  ctx.save();
  ctx.textBaseline = "middle";
  setLetterSpacing(ctx, "0px");
  ctx.textAlign = "right";
  ctx.font = shareFont(800, 13);
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillText(SHARE_BRAND, SHARE_WIDTH - SHARE_EDGE, bottom - (13 * SHARE_LINE_HEIGHT) / 2);
  const brandWidth = ctx.measureText(SHARE_BRAND).width;

  ctx.textAlign = "left";
  const leftMaxWidth = SHARE_WIDTH - SHARE_EDGE * 2 - brandWidth - 16;
  ctx.font = shareFont(400, 12);
  ctx.fillText(fitLine(ctx, dateLabel, leftMaxWidth), SHARE_EDGE, bottom - (12 * SHARE_LINE_HEIGHT) / 2);
  ctx.font = shareFont(800, 15);
  ctx.fillStyle = white;
  ctx.fillText(
    fitLine(ctx, username, leftMaxWidth),
    SHARE_EDGE,
    bottom - 12 * SHARE_LINE_HEIGHT - 2 - (15 * SHARE_LINE_HEIGHT) / 2,
  );
  ctx.restore();
};

export const SHARE_BRAND = "pkpkdupr";
