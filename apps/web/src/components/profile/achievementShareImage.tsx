import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  isLowRatingAchievement,
  type AchievementDefinition,
} from "@pkpkdupr/shared/achievements";
import {
  AchievementBadgeIconPaths,
  BADGE_HEX_POINTS,
  BADGE_ICON_RATIO,
} from "@/components/profile/AchievementBadge";
import { getAchievementShareFileName, wrapText } from "@/lib/achievementShare";
import { formatKstFullDate } from "@/lib/format";

/*
 * 업적 공유 이미지(4:5). 업적 축하 연출을 옮긴 어두운 카드이며, 360×450 배치를 3배로 그려 1080×1350 PNG로 만든다.
 * 빛줄기·후광 크기는 축하 연출의 .pk-celebration-rays(520px 원)·.pk-celebration-glow(300px 원)와 같다.
 */
const WIDTH = 360;
const HEIGHT = 450;
const SCALE = 3;
const BADGE_SIZE = 124;
const BADGE_TOP = 40;
const BADGE_TEXT_GAP = 24;
const TEXT_GAP = 6;
const TEXT_MAX_WIDTH = WIDTH - 56;
const EDGE = 24;
// radial-gradient(circle)의 기본 크기(farthest-corner)는 정사각형 상자 반지름의 √2배다
const RAYS_RADIUS = 260 * Math.SQRT2;
const RAYS_FADE_START = RAYS_RADIUS * 0.12;
const RAYS_FADE_END = RAYS_RADIUS * 0.62;
const RAY_COUNT = 18;
const RAY_DEGREES = 7;
const GLOW_FADE_END = 150 * Math.SQRT2 * 0.62;
const FONT_FAMILY = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, sans-serif';
const LINE_HEIGHT = 1.5;

const COLOR_VARS = {
  ink: "--color-pk-ink",
  amber: "--color-pk-hl",
  primary: "--color-pk-primary",
  deep: "--color-pk-deep",
  white: "--color-white",
} as const;

type ShareColors = Record<keyof typeof COLOR_VARS, string>;

/** 그릴 때 쓰는 pk 토큰 색을 한 번에 읽는다 */
const readColors = (): ShareColors => {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(COLOR_VARS).map(([key, name]) => [key, style.getPropertyValue(name).trim()]),
  ) as ShareColors;
};

/**
 * 화면 배지와 같은 육각형·아이콘을 한 장의 SVG 문자열로 만든다. 숫자 꼬리표는 웹폰트가 필요해 캔버스에 따로 그린다.
 * 이미지로 그리는 SVG에서는 CSS 변수가 풀리지 않아 색을 직접 넣는다
 */
const renderBadgeSvg = (definition: AchievementDefinition, color: string, iconColor: string) => {
  const iconSize = 48 * BADGE_ICON_RATIO;
  const iconOffset = (48 - iconSize) / 2;
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      <svg xmlns="http://www.w3.org/2000/svg" width={BADGE_SIZE} height={BADGE_SIZE} viewBox="0 0 48 48">
        <polygon
          points={BADGE_HEX_POINTS}
          fill={color}
          stroke={color}
          strokeWidth={5}
          strokeLinejoin="round"
        />
        <svg
          x={iconOffset}
          y={iconOffset}
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke={iconColor}
          color={iconColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <AchievementBadgeIconPaths achievement={definition} />
        </svg>
      </svg>,
    );
  });
  const markup = container.innerHTML;
  root.unmount();
  return markup;
};

const loadSvgImage = (markup: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("업적 배지를 그리지 못했어요"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT_FAMILY}`;

const setLetterSpacing = (ctx: CanvasRenderingContext2D, value: string) => {
  // 자간을 못 정하는 브라우저는 기본 자간으로 그린다
  if ("letterSpacing" in ctx) ctx.letterSpacing = value;
};

const drawRays = (ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) => {
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
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
};

const drawGlow = (ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) => {
  ctx.save();
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, GLOW_FADE_END);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, GLOW_FADE_END, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/** AchievementBadge의 큰 숫자 꼬리표(높이 28, 최소 너비 36, 좌우 9px, 테두리 2.5, 배지 아래로 9px 걸침, 17 굵게)와 같다 */
const drawBadgeTag = (
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  badgeBottom: number,
  color: string,
) => {
  ctx.save();
  ctx.font = font(800, 17);
  const width = Math.max(36, ctx.measureText(label).width + 18);
  const height = 28;
  const x = cx - width / 2;
  const y = badgeBottom + 9 - height;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();
  const border = 2.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = border;
  ctx.beginPath();
  ctx.roundRect(x + border / 2, y + border / 2, width - border, height - border, (height - border) / 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, y + height / 2);
  ctx.restore();
};

/** 가운데 정렬 글자 묶음을 그리고 다음 묶음이 시작할 y를 돌려준다 */
const drawCenteredLines = (
  ctx: CanvasRenderingContext2D,
  lines: string[],
  top: number,
  lineHeight: number,
) => {
  lines.forEach((line, index) => {
    ctx.fillText(line, WIDTH / 2, top + lineHeight * index + lineHeight / 2);
  });
  return top + lineHeight * lines.length;
};

/** 한 줄을 maxWidth 안에 넣고 넘치면 말줄임표로 자른다 */
const fitLine = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) {
    chars.pop();
  }
  return `${chars.join("")}…`;
};

export interface AchievementShareTarget {
  definition: AchievementDefinition;
  username: string;
  /** 받은 시각. 없으면 지금 */
  earnedAt: string | null;
}

const loadFonts = async (texts: string[]) => {
  if (!document.fonts) return;
  const sample = texts.join("");
  // 하위 글자 묶음(unicode-range)으로 나뉜 웹폰트라 그릴 글자를 같이 넘겨 필요한 묶음을 받는다
  await Promise.all(
    [400, 800].map((weight) => document.fonts.load(font(weight, 15), sample).catch(() => [])),
  );
};

export const createAchievementShareImage = async ({
  definition,
  username,
  earnedAt,
}: AchievementShareTarget): Promise<File> => {
  const dateLabel = `${formatKstFullDate(earnedAt ?? new Date())} 달성`;
  const headline = "업적 달성";
  const brand = "pkpkdupr";
  const colors = readColors();
  const badgeColor = isLowRatingAchievement(definition.id) ? colors.deep : colors.primary;
  const [badgeImage] = await Promise.all([
    loadSvgImage(renderBadgeSvg(definition, badgeColor, colors.white)),
    loadFonts([headline, definition.name, definition.condition, username, dateLabel, brand]),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = HEIGHT * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 만들지 못했어요");
  ctx.scale(SCALE, SCALE);

  const { white, amber } = colors;
  const cx = WIDTH / 2;
  const badgeCenterY = BADGE_TOP + BADGE_SIZE / 2;
  const badgeBottom = BADGE_TOP + BADGE_SIZE;

  ctx.fillStyle = colors.ink;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawRays(ctx, cx, badgeCenterY, amber);
  drawGlow(ctx, cx, badgeCenterY, amber);

  ctx.drawImage(badgeImage, cx - BADGE_SIZE / 2, BADGE_TOP, BADGE_SIZE, BADGE_SIZE);
  if (definition.badgeNumber != null) {
    drawBadgeTag(ctx, definition.badgeNumber, cx, badgeBottom, badgeColor);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let top = badgeBottom + BADGE_TEXT_GAP;

  ctx.font = font(800, 13);
  setLetterSpacing(ctx, "0.78px");
  ctx.fillStyle = amber;
  top = drawCenteredLines(ctx, [headline], top, 13 * LINE_HEIGHT) + TEXT_GAP;

  ctx.font = font(800, 26);
  setLetterSpacing(ctx, "-0.52px");
  ctx.fillStyle = white;
  const nameLines = wrapText(definition.name, TEXT_MAX_WIDTH, (value) => ctx.measureText(value).width);
  top = drawCenteredLines(ctx, nameLines, top, 26 * LINE_HEIGHT) + TEXT_GAP;

  ctx.font = font(400, 15);
  setLetterSpacing(ctx, "0px");
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  const conditionLines = wrapText(
    definition.condition,
    TEXT_MAX_WIDTH,
    (value) => ctx.measureText(value).width,
  );
  drawCenteredLines(ctx, conditionLines, top, 15 * 1.45);

  // 아래 줄: 왼쪽 아이디·받은 날, 오른쪽 pkpkdupr(아래 끝 맞춤)
  const bottom = HEIGHT - EDGE;
  ctx.textAlign = "right";
  ctx.font = font(800, 13);
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillText(brand, WIDTH - EDGE, bottom - (13 * LINE_HEIGHT) / 2);
  const brandWidth = ctx.measureText(brand).width;

  ctx.textAlign = "left";
  const leftMaxWidth = WIDTH - EDGE * 2 - brandWidth - 16;
  ctx.font = font(400, 12);
  ctx.fillText(dateLabel, EDGE, bottom - (12 * LINE_HEIGHT) / 2);
  ctx.font = font(800, 15);
  ctx.fillStyle = white;
  ctx.fillText(
    fitLine(ctx, username, leftMaxWidth),
    EDGE,
    bottom - 12 * LINE_HEIGHT - 2 - (15 * LINE_HEIGHT) / 2,
  );

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했어요");
  return new File([blob], getAchievementShareFileName(definition.id), { type: "image/png" });
};
