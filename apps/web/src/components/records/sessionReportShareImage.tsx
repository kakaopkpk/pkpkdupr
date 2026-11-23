import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  isLowRatingAchievement,
  type AchievementDefinition,
} from "@pkpkdupr/shared/achievements";
import {
  SESSION_PRAISE_CATEGORY_LABEL,
  type SessionPraiseCategory,
} from "@pkpkdupr/shared/sessionPraise";
import { SessionPraiseCategoryIcon } from "@/components/praise/SessionPraiseParts";
import { loadSvgImage, renderBadgeSvg } from "@/components/profile/achievementShareImage";
import { ThumbUpIcon } from "@/components/ui/Icons";
import { getAchievementDefinition } from "@/lib/achievements";
import { formatRatingDelta } from "@/lib/format";
import {
  formatSessionPraiseValue,
  isSessionPraiseValueRising,
} from "@/lib/sessionPraise";
import {
  formatRiserRecord,
  getSessionReportShareFileName,
  getSessionShareDateLabel,
  getSessionShareMetaLabel,
  SESSION_SHARE_ACHIEVEMENT_LIMIT,
  SESSION_SHARE_CLUB_NAME,
  type MyRecordShareTarget,
  type SessionReportSharePlayer,
  type SessionReportShareSession,
  type SessionReportShareTarget,
  type SessionSummaryShareTarget,
} from "@/lib/sessionReportShare";
import {
  drawShareAvatar,
  loadShareAvatars,
  type ShareAvatars,
} from "@/lib/shareImageAvatar";
import {
  canvasToPngFile,
  createShareCanvas,
  drawShareFooter,
  fillCircle,
  fillRoundRect,
  fitLine,
  loadShareFonts,
  readTokenColors,
  SHARE_EDGE,
  SHARE_FOOTER_HEIGHT,
  SHARE_HEIGHT,
  SHARE_LINE_HEIGHT,
  SHARE_SCALE,
  SHARE_WIDTH,
  setLetterSpacing,
  shareFont,
  wrapText,
} from "@/lib/shareImageCanvas";
import { formatRating } from "@/utils/dupr";

/*
 * 세션 리포트 공유 이미지. 흰 바탕에 너비 360 배치를 3배로 그린 1080px 너비 PNG이고, 높이는 내용을 따른다(최소 450).
 * 배치 값은 docs/design.md "세션 리포트 공유"를 따르며, 부품 모양은 앱의 순위 원(RankBadge)·칭찬 알약(SessionPraisePill)·
 * 칭찬 배지(PraisedAvatarFrame)·업적 배지(AchievementBadge)와 같다.
 */
const PADDING_TOP = 36;
const CONTENT_X = SHARE_EDGE;
const CONTENT_WIDTH = SHARE_WIDTH - SHARE_EDGE * 2;
const CONTENT_RIGHT = CONTENT_X + CONTENT_WIDTH;
const BLOCK_GAP = 20;
/** 마지막 묶음과 아래 줄 사이에 더하는 여백(묶음 간격 20 위에) */
const FOOTER_GAP = 8;
const BOX_RADIUS = 12;
const NUM_FONT_FAMILY = '"Barlow Condensed", sans-serif';
const BIG_RATING_SIZE = 56;
const RANK_COLORS = ["gold", "silver", "bronze"] as const;

const COLOR_VARS = {
  ink: "--color-pk-ink",
  sub: "--color-pk-sub",
  muted: "--color-pk-muted",
  bg: "--color-pk-bg",
  divider: "--color-pk-divider",
  up: "--color-pk-up",
  down: "--color-pk-down",
  primary: "--color-pk-primary",
  primarySoft: "--color-pk-primary-soft",
  deep: "--color-pk-deep",
  amber: "--color-pk-hl",
  gold: "--color-pk-gold",
  silver: "--color-pk-silver",
  bronze: "--color-pk-bronze",
  white: "--color-white",
} as const;

type Colors = Record<keyof typeof COLOR_VARS, string>;

/** 먼저 불러 둔 아이콘·배지 그림 */
type Icons = Map<string, HTMLImageElement>;

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  colors: Colors;
  icons: Icons;
  avatars: ShareAvatars;
}

/** 높이가 정해진 세로 묶음. top부터 그린다 */
interface Block {
  height: number;
  draw: (draw: DrawContext, top: number) => void;
}

const lineHeight = (size: number) => size * SHARE_LINE_HEIGHT;

// ------------------------------------------------------------------- 아이콘 --

/** 앱 아이콘 컴포넌트를 3배 크기 SVG 문자열로 만든다. 이미지로 그리는 SVG라 색을 직접 넣는다 */
const renderIconSvg = (icon: React.ReactElement, size: number, color: string) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size * SHARE_SCALE}
        height={size * SHARE_SCALE}
        viewBox={`0 0 ${size} ${size}`}
        color={color}
      >
        {icon}
      </svg>,
    );
  });
  const markup = container.innerHTML;
  root.unmount();
  return markup;
};

const THUMB_BADGE_SIZE = 11;
const THUMB_PILL_SIZE = 15;
const THUMB_CIRCLE_SIZE = 18;
const CATEGORY_ICON_SIZE = 11;
const ACHIEVEMENT_BADGE_SIZE = 36;

const iconKey = {
  thumbBadge: "thumb-badge",
  thumbPill: "thumb-pill",
  thumbCircle: "thumb-circle",
  category: (category: SessionPraiseCategory) => `category-${category}`,
  badge: (achievementId: string) => `badge-${achievementId}`,
};

const loadIcons = async (
  colors: Colors,
  categories: SessionPraiseCategory[],
  achievements: AchievementDefinition[],
): Promise<Icons> => {
  const sources: [string, string][] = [
    [iconKey.thumbBadge, renderIconSvg(<ThumbUpIcon size={THUMB_BADGE_SIZE} strokeWidth={2.6} />, THUMB_BADGE_SIZE, colors.ink)],
    [iconKey.thumbPill, renderIconSvg(<ThumbUpIcon size={THUMB_PILL_SIZE} />, THUMB_PILL_SIZE, colors.primary)],
    [iconKey.thumbCircle, renderIconSvg(<ThumbUpIcon size={THUMB_CIRCLE_SIZE} strokeWidth={2.6} />, THUMB_CIRCLE_SIZE, colors.ink)],
    ...[...new Set(categories)].map(
      (category): [string, string] => [
        iconKey.category(category),
        renderIconSvg(
          <SessionPraiseCategoryIcon category={category} size={CATEGORY_ICON_SIZE} />,
          CATEGORY_ICON_SIZE,
          colors.ink,
        ),
      ],
    ),
    ...achievements.map(
      (definition): [string, string] => [
        iconKey.badge(definition.id),
        renderBadgeSvg(
          definition,
          isLowRatingAchievement(definition.id) ? colors.deep : colors.primary,
          colors.white,
          ACHIEVEMENT_BADGE_SIZE * SHARE_SCALE,
        ),
      ],
    ),
  ];
  const images = await Promise.all(sources.map(([, markup]) => loadSvgImage(markup)));
  return new Map(sources.map(([key], index) => [key, images[index]]));
};

const drawIcon = (
  { ctx, icons }: DrawContext,
  key: string,
  cx: number,
  cy: number,
  size: number,
) => {
  const image = icons.get(key);
  if (image) ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
};

// ------------------------------------------------------------------- 글자 --

const setText = (
  ctx: CanvasRenderingContext2D,
  weight: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
) => {
  ctx.font = shareFont(weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  setLetterSpacing(ctx, "0px");
};

const fillDivider = ({ ctx, colors }: DrawContext, x: number, y: number, width: number) => {
  ctx.fillStyle = colors.divider;
  ctx.fillRect(x, y, width, 1);
};

const getDeltaColor = (colors: Colors, value: number | null) => {
  const rounded = value === null ? 0 : Math.round(value * 1000) / 1000;
  if (rounded > 0) return colors.up;
  if (rounded < 0) return colors.down;
  return colors.muted;
};

/** 섹션 이름표(12 굵게 `pk-muted`). 줄 높이 18 */
const SECTION_LABEL_HEIGHT = lineHeight(12);
const drawSectionLabel = (draw: DrawContext, label: string, top: number) => {
  setText(draw.ctx, 700, 12, draw.colors.muted);
  draw.ctx.fillText(label, CONTENT_X, top + SECTION_LABEL_HEIGHT / 2);
};

// ---------------------------------------------------------------- 공통 묶음 --

/** 세션 이름(26 굵게, 길면 여러 줄) → 6 → 날짜·장소(13 `pk-muted`), 가운데 정렬 */
const headerBlock = (
  measure: CanvasRenderingContext2D,
  session: SessionReportShareSession,
): Block => {
  measure.font = shareFont(800, 26);
  setLetterSpacing(measure, "-0.52px");
  const nameLines = wrapText(session.name, CONTENT_WIDTH, (value) => measure.measureText(value).width);
  const nameLine = lineHeight(26);
  const meta = getSessionShareMetaLabel(session);
  return {
    height: nameLine * nameLines.length + 6 + lineHeight(13),
    draw: ({ ctx, colors }, top) => {
      setText(ctx, 800, 26, colors.ink, "center");
      setLetterSpacing(ctx, "-0.52px");
      nameLines.forEach((line, index) => {
        ctx.fillText(line, SHARE_WIDTH / 2, top + nameLine * index + nameLine / 2);
      });
      setText(ctx, 400, 13, colors.muted, "center");
      ctx.fillText(
        fitLine(ctx, meta, CONTENT_WIDTH),
        SHARE_WIDTH / 2,
        top + nameLine * nameLines.length + 6 + lineHeight(13) / 2,
      );
    },
  };
};

/** 칭찬 분류 줄(13 굵게 `pk-sub`): 앰버 원 18 안 분류 아이콘 → 분류 이름 → · → 값. 세 조각 사이 6 */
const drawPraiseCategoryLine = (
  draw: DrawContext,
  { category, value }: { category: SessionPraiseCategory; value: number },
  x: number,
  cy: number,
) => {
  const { ctx, colors } = draw;
  fillCircle(ctx, x + 9, cy, 9, colors.amber);
  drawIcon(draw, iconKey.category(category), x + 9, cy, CATEGORY_ICON_SIZE);
  let cursor = x + 18 + 6;
  const parts: [string, string][] = [
    [SESSION_PRAISE_CATEGORY_LABEL[category], colors.sub],
    ["·", colors.muted],
    [
      formatSessionPraiseValue(category, value),
      isSessionPraiseValueRising(category, value) ? colors.up : colors.sub,
    ],
  ];
  parts.forEach(([text, color]) => {
    setText(ctx, 700, 13, color);
    ctx.fillText(text, cursor, cy);
    cursor += ctx.measureText(text).width + 6;
  });
};

// ---------------------------------------------------------------- 세션 요약 --

/** "N명 참여 | N 경기" 두 칸 상자(`pk-bg`, 칸 사이 구분선) */
const statsBlock = (target: SessionSummaryShareTarget): Block => {
  const valueLine = lineHeight(22);
  const labelLine = lineHeight(12);
  const height = 12 + valueLine + 2 + labelLine + 12;
  const cells = [
    { value: `${target.participantCount}명`, label: "참여" },
    { value: String(target.matchCount), label: "경기" },
  ];
  return {
    height,
    draw: (draw, top) => {
      const { ctx, colors } = draw;
      fillRoundRect(ctx, CONTENT_X, top, CONTENT_WIDTH, height, BOX_RADIUS, colors.bg);
      ctx.fillStyle = colors.divider;
      ctx.fillRect(SHARE_WIDTH / 2, top, 1, height);
      cells.forEach((cell, index) => {
        const cx = CONTENT_X + (CONTENT_WIDTH / 4) * (index * 2 + 1);
        setText(ctx, 800, 22, colors.ink, "center");
        ctx.fillText(cell.value, cx, top + 12 + valueLine / 2);
        setText(ctx, 400, 12, colors.muted, "center");
        ctx.fillText(cell.label, cx, top + 12 + valueLine + 2 + labelLine / 2);
      });
    },
  };
};

/** "평점 상승 TOP 3": 줄 높이 56, 줄 사이 구분선. 순위 원 24 → 아바타 36 → 아이디·"전 → 후 · N경기 N승" → 상승폭 */
const risersBlock = (target: SessionSummaryShareTarget): Block => {
  const rowHeight = 56;
  return {
    height: SECTION_LABEL_HEIGHT + rowHeight * target.risers.length,
    draw: (draw, top) => {
      const { ctx, colors, avatars } = draw;
      drawSectionLabel(draw, "평점 상승 TOP 3", top);
      target.risers.forEach((riser, index) => {
        const rowTop = top + SECTION_LABEL_HEIGHT + rowHeight * index;
        // 둘째 줄부터 위 테두리 1px만큼 내용이 내려간다
        const cy = index === 0 ? rowTop + rowHeight / 2 : rowTop + 1 + (rowHeight - 1) / 2;
        if (index > 0) fillDivider(draw, CONTENT_X, rowTop, CONTENT_WIDTH);

        fillCircle(ctx, CONTENT_X + 12, cy, 12, colors[RANK_COLORS[index]]);
        setText(ctx, 800, 13, colors.ink, "center");
        ctx.fillText(String(index + 1), CONTENT_X + 12, cy);

        const avatarX = CONTENT_X + 24 + 12;
        drawShareAvatar(ctx, avatars, riser.player, { cx: avatarX + 18, cy, size: 36, ink: colors.ink });

        const delta = formatRatingDelta(riser.ratingDelta);
        setText(ctx, 800, 17, colors.up, "right");
        ctx.fillText(delta, CONTENT_RIGHT, cy);
        const textX = avatarX + 36 + 12;
        const textMaxWidth = CONTENT_RIGHT - ctx.measureText(delta).width - 12 - textX;

        const columnTop = cy - (lineHeight(15) + lineHeight(12)) / 2;
        setText(ctx, 700, 15, colors.ink);
        ctx.fillText(fitLine(ctx, riser.player.username, textMaxWidth), textX, columnTop + lineHeight(15) / 2);
        setText(ctx, 400, 12, colors.muted);
        ctx.fillText(
          fitLine(
            ctx,
            `${formatRating(riser.ratingBefore)} → ${formatRating(riser.ratingAfter)} · ${formatRiserRecord(riser)}`,
            textMaxWidth,
          ),
          textX,
          columnTop + lineHeight(15) + lineHeight(12) / 2,
        );
      });
    },
  };
};

/** 아바타 오른쪽 아래 앰버 엄지 배지(지름 19, 흰 링 2). PraisedAvatarFrame과 같이 오른쪽 5·아래 4 밖으로 걸친다 */
const drawPraiseBadge = (draw: DrawContext, avatarRight: number, avatarBottom: number) => {
  const cx = avatarRight + 5 - 19 / 2;
  const cy = avatarBottom + 4 - 19 / 2;
  fillCircle(draw.ctx, cx, cy, 19 / 2 + 2, draw.colors.white);
  fillCircle(draw.ctx, cx, cy, 19 / 2, draw.colors.amber);
  drawIcon(draw, iconKey.thumbBadge, cx, cy, THUMB_BADGE_SIZE);
};

/** 칭찬 알약(높이 36, 최소 너비 56, 좌우 12): `pk-primary-soft` 바탕에 블루 엄지 15 + 수. right가 오른쪽 끝 */
const drawPraisePill = (draw: DrawContext, count: number, right: number, cy: number) => {
  const { ctx, colors } = draw;
  setText(ctx, 800, 15, colors.primary);
  const label = String(count);
  const contentWidth = THUMB_PILL_SIZE + 4 + ctx.measureText(label).width;
  const width = Math.max(56, contentWidth + 24);
  const x = right - width;
  fillRoundRect(ctx, x, cy - 18, width, 36, 18, colors.primarySoft);
  const contentX = x + (width - contentWidth) / 2;
  drawIcon(draw, iconKey.thumbPill, contentX + THUMB_PILL_SIZE / 2, cy, THUMB_PILL_SIZE);
  setText(ctx, 800, 15, colors.primary);
  ctx.fillText(label, contentX + THUMB_PILL_SIZE + 4, cy);
  return width;
};

/** "칭찬": 한 상자(`pk-bg`) 안 줄 목록. 아바타 44 + 엄지 배지 → 아이디·분류 줄 → 칭찬 알약 */
const praisedBlock = (target: SessionSummaryShareTarget): Block => {
  const paddingY = 14;
  const paddingX = 16;
  const columnHeight = lineHeight(15) + 4 + lineHeight(13);
  const rowHeight = paddingY * 2 + Math.max(44, columnHeight);
  const boxHeight = rowHeight * target.praised.length + (target.praised.length - 1);
  return {
    height: SECTION_LABEL_HEIGHT + 8 + boxHeight,
    draw: (draw, top) => {
      const { ctx, colors, avatars } = draw;
      drawSectionLabel(draw, "칭찬", top);
      const boxTop = top + SECTION_LABEL_HEIGHT + 8;
      fillRoundRect(ctx, CONTENT_X, boxTop, CONTENT_WIDTH, boxHeight, BOX_RADIUS, colors.bg);
      target.praised.forEach((item, index) => {
        const rowTop = boxTop + (rowHeight + 1) * index;
        if (index > 0) fillDivider(draw, CONTENT_X, rowTop - 1, CONTENT_WIDTH);
        const cy = rowTop + rowHeight / 2;
        const avatarX = CONTENT_X + paddingX;
        drawShareAvatar(ctx, avatars, item.player, { cx: avatarX + 22, cy, size: 44, ink: colors.ink });
        drawPraiseBadge(draw, avatarX + 44, cy + 22);

        const pillWidth = drawPraisePill(draw, item.praiseCount, CONTENT_RIGHT - paddingX, cy);
        const textX = avatarX + 44 + 12;
        const textMaxWidth = CONTENT_RIGHT - paddingX - pillWidth - 12 - textX;
        const columnTop = cy - columnHeight / 2;
        setText(ctx, 800, 15, colors.ink);
        ctx.fillText(fitLine(ctx, item.player.username, textMaxWidth), textX, columnTop + lineHeight(15) / 2);
        drawPraiseCategoryLine(draw, item, textX, columnTop + lineHeight(15) + 4 + lineHeight(13) / 2);
      });
    },
  };
};

const getSummaryBlocks = (measure: CanvasRenderingContext2D, target: SessionSummaryShareTarget) => [
  headerBlock(measure, target.session),
  statsBlock(target),
  ...(target.risers.length > 0 ? [risersBlock(target)] : []),
  ...(target.praised.length > 0 ? [praisedBlock(target)] : []),
];

// ------------------------------------------------------------------ 내 기록 --

/** 큰 평점 글자의 줄 상자(줄 높이 = 글자 크기) 안 기준선 위치 */
const getBaselineOffset = (ctx: CanvasRenderingContext2D, text: string, size: number, line: number) => {
  const metrics = ctx.measureText(text);
  const ascent = metrics.fontBoundingBoxAscent || size * 0.8;
  const descent = metrics.fontBoundingBoxDescent || size * 0.2;
  return (line - (ascent + descent)) / 2 + ascent;
};

/** "복식 평점"(13 굵게 `pk-sub`) → 2 → 큰 평점(font-num 56) + 변화량(17 굵게) → 10 → 랭킹·승패 알약 */
const ratingBlock = (measure: CanvasRenderingContext2D, target: MyRecordShareTarget): Block => {
  const labelLine = lineHeight(13);
  const rating = target.ratingAfter === null ? "–" : formatRating(target.ratingAfter);
  const delta =
    target.ratingAfter === null
      ? null
      : target.ratingDelta === null
        ? "–"
        : formatRatingDelta(target.ratingDelta);
  const numFont = `700 ${BIG_RATING_SIZE}px ${NUM_FONT_FAMILY}`;
  measure.font = numFont;
  setLetterSpacing(measure, "0px");
  const ratingBaseline = getBaselineOffset(measure, rating, BIG_RATING_SIZE, BIG_RATING_SIZE);
  measure.font = shareFont(800, 17);
  const deltaLine = lineHeight(17);
  const deltaBaseline = getBaselineOffset(measure, delta ?? "0", 17, deltaLine);
  // 변화량 줄 상자가 큰 평점 줄 상자 밖으로 나가는 만큼 줄 높이가 늘어난다(items-baseline)
  const deltaTop = ratingBaseline - deltaBaseline;
  const rowTop = Math.min(0, deltaTop);
  const rowHeight = Math.max(BIG_RATING_SIZE, deltaTop + deltaLine) - rowTop;
  const pillHeight = 8 + lineHeight(15) + 8;
  const height = labelLine + 2 + rowHeight + 10 + pillHeight;

  return {
    height,
    draw: (draw, top) => {
      const { ctx, colors } = draw;
      const cx = SHARE_WIDTH / 2;
      setText(ctx, 700, 13, colors.sub, "center");
      ctx.fillText("복식 평점", cx, top + labelLine / 2);

      const baselineY = top + labelLine + 2 - rowTop + ratingBaseline;
      ctx.font = numFont;
      const ratingWidth = ctx.measureText(rating).width;
      ctx.font = shareFont(800, 17);
      const deltaWidth = delta === null ? 0 : ctx.measureText(delta).width;
      const rowWidth = ratingWidth + (delta === null ? 0 : 8 + deltaWidth);
      let x = cx - rowWidth / 2;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.font = numFont;
      ctx.fillStyle = colors.ink;
      ctx.fillText(rating, x, baselineY);
      if (delta !== null) {
        x += ratingWidth + 8;
        ctx.font = shareFont(800, 17);
        ctx.fillStyle = getDeltaColor(colors, target.ratingDelta);
        ctx.fillText(delta, x, baselineY);
      }

      // 알약: 좌우 14·위아래 8, `pk-bg` 바탕, 15 굵게. 랭킹 알약은 순위 변동을 6 띄워 붙인다
      const pills: { parts: [string, string][] }[] = [];
      if (target.rankAfter !== null) {
        const parts: [string, string][] = [[`랭킹 ${target.rankAfter}위`, colors.ink]];
        if (target.rankChange !== null && target.rankChange !== 0) {
          parts.push([
            target.rankChange > 0 ? `▲${target.rankChange}` : `▼${Math.abs(target.rankChange)}`,
            target.rankChange > 0 ? colors.up : colors.down,
          ]);
        }
        pills.push({ parts });
      }
      pills.push({ parts: [[`${target.wins}승 ${target.losses}패`, colors.ink]] });
      setText(ctx, 800, 15, colors.ink);
      const widths = pills.map(
        ({ parts }) =>
          28 +
          parts.reduce((sum, [text]) => sum + ctx.measureText(text).width, 0) +
          6 * (parts.length - 1),
      );
      const pillTop = top + labelLine + 2 + rowHeight + 10;
      const pillCy = pillTop + pillHeight / 2;
      let pillX = cx - (widths.reduce((sum, width) => sum + width, 0) + 8 * (pills.length - 1)) / 2;
      pills.forEach(({ parts }, index) => {
        fillRoundRect(ctx, pillX, pillTop, widths[index], pillHeight, pillHeight / 2, colors.bg);
        let textX = pillX + 14;
        parts.forEach(([text, color]) => {
          setText(ctx, 800, 15, color);
          ctx.fillText(text, textX, pillCy);
          textX += ctx.measureText(text).width + 6;
        });
        pillX += widths[index] + 8;
      });
    },
  };
};

/** 칭찬 상자(`pk-bg`, 위아래 12·좌우 14): 앰버 원 36 엄지 → "칭찬 N개를 받았어요"·분류 줄 */
const myPraiseBlock = (praise: NonNullable<MyRecordShareTarget["praise"]>): Block => {
  const columnHeight = lineHeight(15) + 3 + lineHeight(13);
  const height = 12 * 2 + Math.max(36, columnHeight);
  return {
    height,
    draw: (draw, top) => {
      const { ctx, colors } = draw;
      fillRoundRect(ctx, CONTENT_X, top, CONTENT_WIDTH, height, BOX_RADIUS, colors.bg);
      const cy = top + height / 2;
      const circleX = CONTENT_X + 14;
      fillCircle(ctx, circleX + 18, cy, 18, colors.amber);
      drawIcon(draw, iconKey.thumbCircle, circleX + 18, cy, THUMB_CIRCLE_SIZE);
      const textX = circleX + 36 + 12;
      const columnTop = cy - columnHeight / 2;
      setText(ctx, 800, 15, colors.ink);
      ctx.fillText(`칭찬 ${praise.praiseCount}개를 받았어요`, textX, columnTop + lineHeight(15) / 2);
      drawPraiseCategoryLine(draw, praise, textX, columnTop + lineHeight(15) + 3 + lineHeight(13) / 2);
    },
  };
};

/** 작은 업적 배지 숫자 꼬리표(높이 17, 최소 너비 20, 좌우 5, 테두리 1.5, 배지 아래로 5 걸침, 12 굵게) */
const drawSmallBadgeTag = (
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  badgeBottom: number,
  color: string,
  white: string,
) => {
  ctx.save();
  setText(ctx, 800, 12, color, "center");
  const width = Math.max(20, ctx.measureText(label).width + 10);
  const height = 17;
  const x = cx - width / 2;
  const y = badgeBottom + 5 - height;
  fillRoundRect(ctx, x, y, width, height, height / 2, white);
  const border = 1.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = border;
  ctx.beginPath();
  ctx.roundRect(x + border / 2, y + border / 2, width - border, height - border, (height - border) / 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(label, cx, y + height / 2);
  ctx.restore();
};

/** "새 업적 N개": 줄(위아래 10, 줄 사이 구분선)마다 배지 36 → 업적 이름·조건. 넘치면 "외 N개" 줄 */
const achievementsBlock = (definitions: AchievementDefinition[]): Block => {
  const shown = definitions.slice(0, SESSION_SHARE_ACHIEVEMENT_LIMIT);
  const hiddenCount = definitions.length - shown.length;
  const columnHeight = lineHeight(15) + lineHeight(13);
  const rowHeight = 10 * 2 + columnHeight;
  const moreHeight = hiddenCount > 0 ? 4 + lineHeight(13) : 0;
  return {
    height: SECTION_LABEL_HEIGHT + rowHeight * shown.length + (shown.length - 1) + moreHeight,
    draw: (draw, top) => {
      const { ctx, colors } = draw;
      drawSectionLabel(draw, `새 업적 ${definitions.length}개`, top);
      const textX = CONTENT_X + ACHIEVEMENT_BADGE_SIZE + 12;
      const textMaxWidth = CONTENT_RIGHT - textX;
      let rowTop = top + SECTION_LABEL_HEIGHT;
      shown.forEach((definition, index) => {
        if (index > 0) {
          fillDivider(draw, CONTENT_X, rowTop, CONTENT_WIDTH);
          rowTop += 1;
        }
        const cy = rowTop + rowHeight / 2;
        const badgeCx = CONTENT_X + ACHIEVEMENT_BADGE_SIZE / 2;
        drawIcon(draw, iconKey.badge(definition.id), badgeCx, cy, ACHIEVEMENT_BADGE_SIZE);
        if (definition.badgeNumber != null) {
          drawSmallBadgeTag(
            ctx,
            definition.badgeNumber,
            badgeCx,
            cy + ACHIEVEMENT_BADGE_SIZE / 2,
            isLowRatingAchievement(definition.id) ? colors.deep : colors.primary,
            colors.white,
          );
        }
        const columnTop = cy - columnHeight / 2;
        setText(ctx, 700, 15, colors.ink);
        ctx.fillText(fitLine(ctx, definition.name, textMaxWidth), textX, columnTop + lineHeight(15) / 2);
        setText(ctx, 400, 13, colors.muted);
        ctx.fillText(
          fitLine(ctx, definition.condition, textMaxWidth),
          textX,
          columnTop + lineHeight(15) + lineHeight(13) / 2,
        );
        rowTop += rowHeight;
      });
      if (hiddenCount > 0) {
        setText(ctx, 400, 13, colors.muted);
        ctx.fillText(`외 ${hiddenCount}개`, textX, rowTop + 4 + lineHeight(13) / 2);
      }
    },
  };
};

const getMineBlocks = (
  measure: CanvasRenderingContext2D,
  target: MyRecordShareTarget,
  achievements: AchievementDefinition[],
) => [
  headerBlock(measure, target.session),
  ratingBlock(measure, target),
  ...(target.praise ? [myPraiseBlock(target.praise)] : []),
  ...(achievements.length > 0 ? [achievementsBlock(achievements)] : []),
];

// -------------------------------------------------------------------- 만들기 --

const getAchievementDefinitions = (target: SessionReportShareTarget) =>
  target.kind === "mine"
    ? target.achievementIds.flatMap((id) => {
        const definition = getAchievementDefinition(id);
        return definition ? [definition] : [];
      })
    : [];

const getPlayers = (target: SessionReportShareTarget): SessionReportSharePlayer[] =>
  target.kind === "summary"
    ? [...target.risers.map((riser) => riser.player), ...target.praised.map((item) => item.player)]
    : [];

const getCategories = (target: SessionReportShareTarget): SessionPraiseCategory[] =>
  target.kind === "summary"
    ? target.praised.map((item) => item.category)
    : target.praise
      ? [target.praise.category]
      : [];

/** 폰트 글자 묶음을 미리 받을 글자. 정확히 그릴 글자가 아니어도 같은 묶음이면 된다 */
const getTexts = (target: SessionReportShareTarget, achievements: AchievementDefinition[]) => [
  target.session.name,
  getSessionShareMetaLabel(target.session),
  getSessionShareDateLabel(target.session),
  "0123456789.+−–→·▲▼명참여경기평점상승TOP칭찬복식랭킹위승패개를받았어요새업적외",
  ...getCategories(target).map((category) => SESSION_PRAISE_CATEGORY_LABEL[category]),
  ...getPlayers(target).map((player) => player.username),
  ...achievements.flatMap((definition) => [definition.name, definition.condition]),
  target.kind === "summary" ? SESSION_SHARE_CLUB_NAME : target.username,
];

const loadNumFont = async (text: string) => {
  if (!document.fonts) return;
  await document.fonts.load(`700 ${BIG_RATING_SIZE}px ${NUM_FONT_FAMILY}`, text).catch(() => []);
};

export const createSessionReportShareImage = async (
  target: SessionReportShareTarget,
): Promise<File> => {
  const colors = readTokenColors(COLOR_VARS);
  const achievements = getAchievementDefinitions(target);
  const [icons, avatars] = await Promise.all([
    loadIcons(colors, getCategories(target), achievements),
    loadShareAvatars(getPlayers(target)),
    loadShareFonts(getTexts(target, achievements), [400, 700, 800]),
    loadNumFont("0123456789.–"),
  ]);

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("이미지를 만들지 못했어요");
  const blocks =
    target.kind === "summary"
      ? getSummaryBlocks(measure, target)
      : getMineBlocks(measure, target, achievements);
  const contentHeight =
    blocks.reduce((sum, block) => sum + block.height, 0) + BLOCK_GAP * (blocks.length - 1);
  const height = Math.ceil(
    Math.max(
      SHARE_HEIGHT,
      PADDING_TOP + contentHeight + BLOCK_GAP + FOOTER_GAP + SHARE_FOOTER_HEIGHT + SHARE_EDGE,
    ),
  );

  const { canvas, ctx } = createShareCanvas(colors.white, height);
  const draw: DrawContext = { ctx, colors, icons, avatars };
  let top = PADDING_TOP;
  blocks.forEach((block) => {
    ctx.save();
    block.draw(draw, top);
    ctx.restore();
    top += block.height + BLOCK_GAP;
  });

  drawShareFooter(ctx, {
    username: target.kind === "summary" ? SESSION_SHARE_CLUB_NAME : target.username,
    dateLabel: getSessionShareDateLabel(target.session),
    color: colors.ink,
    secondary: colors.muted,
    height,
  });

  return canvasToPngFile(canvas, getSessionReportShareFileName(target));
};
