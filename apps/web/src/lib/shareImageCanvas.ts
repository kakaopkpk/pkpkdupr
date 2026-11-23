/*
 * 공유 이미지(업적·특수 매치·세션 리포트) 공통 틀. 너비 360 배치를 3배로 그려 1080px 너비 PNG로 만든다.
 * 업적·특수 매치는 어두운 4:5 카드(360×450 → 1080×1350)이고, 세션 리포트는 흰 바탕에 높이가 내용을 따른다.
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
export const SHARE_FOOTER_HEIGHT = 15 * SHARE_LINE_HEIGHT + 2 + 12 * SHARE_LINE_HEIGHT;
/** 아래 줄 위 공간의 끝(가운데 묶음을 세로 가운데에 둘 때 쓴다) */
export const SHARE_CONTENT_BOTTOM = SHARE_HEIGHT - SHARE_EDGE - SHARE_FOOTER_HEIGHT;
const SHARE_BRAND = "pkpkdupr";

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

/**
 * 하위 글자 묶음(unicode-range)으로 나뉜 웹폰트라 그릴 글자를 같이 넘겨 필요한 묶음을 받는다.
 * 아래 줄의 pkpkdupr는 여기서 더한다
 */
export const loadShareFonts = async (texts: string[], weights: number[]) => {
  if (!document.fonts) return;
  const sample = [...texts, SHARE_BRAND].join("");
  await Promise.all(
    weights.map((weight) => document.fonts.load(shareFont(weight, 15), sample).catch(() => [])),
  );
};

/**
 * 이미지를 불러온다. 못 불러오거나 timeoutMs가 지나면 null이다.
 * 다른 출처 사진은 crossOrigin을 줘야 캔버스가 더럽혀지지 않아(toBlob 가능) PNG로 만들 수 있다
 */
export const loadShareImage = (
  src: string | undefined,
  { crossOrigin = false, timeoutMs }: { crossOrigin?: boolean; timeoutMs?: number } = {},
) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    const timer = timeoutMs === undefined ? undefined : window.setTimeout(() => resolve(null), timeoutMs);
    const settle = (value: HTMLImageElement | null) => {
      window.clearTimeout(timer);
      resolve(value);
    };
    if (crossOrigin) image.crossOrigin = "anonymous";
    image.onload = () => settle(image);
    image.onerror = () => settle(null);
    image.src = src;
  });

/** 360×height(기본 450) 좌표로 그리는 3배 캔버스와 바탕을 만든다 */
export const createShareCanvas = (background: string, height = SHARE_HEIGHT) => {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_WIDTH * SHARE_SCALE;
  canvas.height = Math.round(height * SHARE_SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들지 못했어요");
  ctx.scale(SHARE_SCALE, SHARE_SCALE);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SHARE_WIDTH, height);
  return { canvas, ctx };
};

export const canvasToPngFile = async (canvas: HTMLCanvasElement, fileName: string) => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했어요");
  return new File([blob], fileName, { type: "image/png" });
};

/** #rrggbb 색의 완전 투명. 그 밖의 표기는 "transparent"(검정 투명) */
export const toTransparent = (color: string) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return "transparent";
  const value = Number.parseInt(hex, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, 0)`;
};

/**
 * 그라데이션 끝에 쓸 같은 색의 완전 투명. "transparent"(검정 투명)로 두면 중간이 검게 섞여
 * CSS 빛줄기(색은 그대로, 투명도만 줄어듦)보다 칙칙해진다. 불투명 색은 캔버스가 #rrggbb로 맞춰 준다
 */
const transparentOf = (ctx: CanvasRenderingContext2D, color: string) => {
  ctx.save();
  ctx.fillStyle = color;
  const normalized = String(ctx.fillStyle);
  ctx.restore();
  return toTransparent(normalized);
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
  gradient.addColorStop(1, transparentOf(ctx, color));
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
};

export const drawGlow = (ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) => {
  ctx.save();
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, GLOW_FADE_END);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, transparentOf(ctx, color));
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, GLOW_FADE_END, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/**
 * 글자를 maxWidth 안에 들어가게 줄로 나눈다. 띄어쓰기 단위로 나누고,
 * 띄어쓰기 없이 한 줄을 넘는 낱말은 글자 단위로 자른다
 */
export const wrapText = (
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] => {
  const lines: string[] = [];
  let line = "";
  const pushWord = (word: string) => {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = "";
    if (measure(word) <= maxWidth) {
      line = word;
      return;
    }
    for (const char of Array.from(word)) {
      if (line && measure(line + char) > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  };
  text.split(/\s+/).filter(Boolean).forEach(pushWord);
  if (line) lines.push(line);
  return lines;
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

/**
 * 아래 줄: 왼쪽 이름(15 굵게)·날짜 줄(12), 오른쪽 pkpkdupr(13 굵게, 아래 끝 맞춤).
 * 어두운 카드는 이름 흰색, 날짜·pkpkdupr 흰색 70%이고, 흰 바탕은 이름 잉크, 날짜·pkpkdupr `pk-muted`다
 */
export const drawShareFooter = (
  ctx: CanvasRenderingContext2D,
  {
    username,
    dateLabel,
    color,
    secondary = "rgba(255, 255, 255, 0.7)",
    height = SHARE_HEIGHT,
  }: {
    username: string;
    dateLabel: string;
    color: string;
    secondary?: string;
    /** 캔버스 높이. 아래 끝에서 SHARE_EDGE 위에 맞춘다 */
    height?: number;
  },
) => {
  const bottom = height - SHARE_EDGE;
  ctx.save();
  ctx.textBaseline = "middle";
  setLetterSpacing(ctx, "0px");
  ctx.textAlign = "right";
  ctx.font = shareFont(800, 13);
  ctx.fillStyle = secondary;
  ctx.fillText(SHARE_BRAND, SHARE_WIDTH - SHARE_EDGE, bottom - (13 * SHARE_LINE_HEIGHT) / 2);
  const brandWidth = ctx.measureText(SHARE_BRAND).width;

  ctx.textAlign = "left";
  const leftMaxWidth = SHARE_WIDTH - SHARE_EDGE * 2 - brandWidth - 16;
  ctx.font = shareFont(400, 12);
  ctx.fillText(fitLine(ctx, dateLabel, leftMaxWidth), SHARE_EDGE, bottom - (12 * SHARE_LINE_HEIGHT) / 2);
  ctx.font = shareFont(800, 15);
  ctx.fillStyle = color;
  ctx.fillText(
    fitLine(ctx, username, leftMaxWidth),
    SHARE_EDGE,
    bottom - 12 * SHARE_LINE_HEIGHT - 2 - (15 * SHARE_LINE_HEIGHT) / 2,
  );
  ctx.restore();
};

export const fillRoundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
};

export const fillCircle = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
};
