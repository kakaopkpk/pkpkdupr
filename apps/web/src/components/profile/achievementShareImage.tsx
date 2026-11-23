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
import { getAchievementShareFileName } from "@/lib/achievementShare";
import { formatKstFullDate } from "@/lib/format";
import {
  canvasToPngFile,
  createShareCanvas,
  drawGlow,
  drawRays,
  drawShareFooter,
  loadShareFonts,
  loadShareImage,
  readTokenColors,
  SHARE_LINE_HEIGHT,
  SHARE_WIDTH,
  setLetterSpacing,
  shareFont,
  wrapText,
} from "@/lib/shareImageCanvas";

/*
 * 업적 공유 이미지(4:5). 어두운 카드이며 틀(빛줄기·후광·아래 줄)은 lib/shareImageCanvas와 같다.
 */
const BADGE_SIZE = 124;
const BADGE_TOP = 40;
const BADGE_TEXT_GAP = 24;
const TEXT_GAP = 6;
const TEXT_MAX_WIDTH = SHARE_WIDTH - 56;

const COLOR_VARS = {
  ink: "--color-pk-ink",
  amber: "--color-pk-hl",
  primary: "--color-pk-primary",
  deep: "--color-pk-deep",
  white: "--color-white",
} as const;

/**
 * 화면 배지와 같은 육각형·아이콘을 한 장의 SVG 문자열로 만든다. 숫자 꼬리표는 웹폰트가 필요해 캔버스에 따로 그린다.
 * 이미지로 그리는 SVG에서는 CSS 변수가 풀리지 않아 색을 직접 넣는다. size는 SVG 픽셀 크기다
 */
export const renderBadgeSvg = (
  definition: AchievementDefinition,
  color: string,
  iconColor: string,
  size = BADGE_SIZE,
) => {
  const iconSize = 48 * BADGE_ICON_RATIO;
  const iconOffset = (48 - iconSize) / 2;
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 48 48">
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

export const loadSvgImage = async (markup: string) => {
  const image = await loadShareImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  if (!image) throw new Error("업적 배지를 그리지 못했어요");
  return image;
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
  ctx.font = shareFont(800, 17);
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
    ctx.fillText(line, SHARE_WIDTH / 2, top + lineHeight * index + lineHeight / 2);
  });
  return top + lineHeight * lines.length;
};

export interface AchievementShareTarget {
  definition: AchievementDefinition;
  username: string;
  /** 받은 시각. 없으면 지금 */
  earnedAt: string | null;
}

export const createAchievementShareImage = async ({
  definition,
  username,
  earnedAt,
}: AchievementShareTarget): Promise<File> => {
  const dateLabel = `${formatKstFullDate(earnedAt ?? new Date())} 달성`;
  const headline = "업적 달성";
  const colors = readTokenColors(COLOR_VARS);
  const badgeColor = isLowRatingAchievement(definition.id) ? colors.deep : colors.primary;
  const [badgeImage] = await Promise.all([
    loadSvgImage(renderBadgeSvg(definition, badgeColor, colors.white)),
    loadShareFonts(
      [headline, definition.name, definition.condition, username, dateLabel],
      [400, 800],
    ),
  ]);

  const { canvas, ctx } = createShareCanvas(colors.ink);
  const { white, amber } = colors;
  const cx = SHARE_WIDTH / 2;
  const badgeCenterY = BADGE_TOP + BADGE_SIZE / 2;
  const badgeBottom = BADGE_TOP + BADGE_SIZE;

  drawRays(ctx, cx, badgeCenterY, amber);
  drawGlow(ctx, cx, badgeCenterY, amber);

  ctx.drawImage(badgeImage, cx - BADGE_SIZE / 2, BADGE_TOP, BADGE_SIZE, BADGE_SIZE);
  if (definition.badgeNumber != null) {
    drawBadgeTag(ctx, definition.badgeNumber, cx, badgeBottom, badgeColor);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let top = badgeBottom + BADGE_TEXT_GAP;

  ctx.font = shareFont(800, 13);
  setLetterSpacing(ctx, "0.78px");
  ctx.fillStyle = amber;
  top = drawCenteredLines(ctx, [headline], top, 13 * SHARE_LINE_HEIGHT) + TEXT_GAP;

  ctx.font = shareFont(800, 26);
  setLetterSpacing(ctx, "-0.52px");
  ctx.fillStyle = white;
  const nameLines = wrapText(definition.name, TEXT_MAX_WIDTH, (value) => ctx.measureText(value).width);
  top = drawCenteredLines(ctx, nameLines, top, 26 * SHARE_LINE_HEIGHT) + TEXT_GAP;

  ctx.font = shareFont(400, 15);
  setLetterSpacing(ctx, "0px");
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  const conditionLines = wrapText(
    definition.condition,
    TEXT_MAX_WIDTH,
    (value) => ctx.measureText(value).width,
  );
  drawCenteredLines(ctx, conditionLines, top, 15 * 1.45);

  drawShareFooter(ctx, { username, dateLabel, color: white });

  return canvasToPngFile(canvas, getAchievementShareFileName(definition.id));
};
