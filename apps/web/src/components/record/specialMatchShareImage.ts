import { FLAME_ICON_PATH, STOP_HAND_ICON_PATHS } from "@/components/ui/Icons";
import {
  getRankingCategoryLabel,
  getSpecialMatchCaptionParts,
  getSpecialMatchShareDateLabel,
  getSpecialMatchShareFileName,
  getSpecialMatchShareTitle,
  type SpecialMatchCaptionPart,
  type SpecialMatchSharePlayer,
  type SpecialMatchShareRankRow,
  type SpecialMatchShareTarget,
} from "@/lib/specialMatchShare";
import {
  drawShareAvatar,
  loadShareAvatars,
  type ShareAvatars,
} from "@/lib/shareImageAvatar";
import {
  canvasToPngFile,
  createShareCanvas,
  drawGlow,
  drawRays,
  drawShareFooter,
  fillCircle,
  fillRoundRect,
  fitLine,
  loadShareFonts,
  readTokenColors,
  SHARE_CONTENT_BOTTOM,
  SHARE_EDGE,
  SHARE_SCALE,
  SHARE_WIDTH,
  setLetterSpacing,
  shareFont,
} from "@/lib/shareImageCanvas";

/*
 * 특수 매치 공유 이미지(4:5). 틀은 업적 공유 이미지와 같고, 가운데는 큰 연출 끝 화면 그대로
 * 제목(34) → 흰 카드 → 문구다. 배치 값은 docs/design.md "특수 매치 공유"와 큰 연출 카드(EC1·EL10·KW1)를 따른다.
 */
const CARD_X = SHARE_EDGE;
const CARD_WIDTH = SHARE_WIDTH - SHARE_EDGE * 2;
const CARD_RADIUS = 20;
const TITLE_SIZE = 34;
const TITLE_LINE = 37;
const TITLE_CARD_GAP = 18;
const CARD_CAPTION_GAP = 16;
const CAPTION_SIZE = 15;
const CAPTION_LINE = 22;
const MIN_CAPTION_SIZE = 12;
const MIN_CONTENT_TOP = 36;
const STREAK_END_LABEL = "연승 끝";
const VS_LABEL = "VS";

const COLOR_VARS = {
  ink: "--color-pk-ink",
  amber: "--color-pk-hl",
  primary: "--color-pk-primary",
  primarySoft: "--color-pk-primary-soft",
  white: "--color-white",
  sub: "--color-pk-sub",
  muted: "--color-pk-muted",
  neutral: "--color-pk-neutral",
  bg: "--color-pk-bg",
  up: "--color-pk-up",
  down: "--color-pk-down",
  upOnDeep: "--color-pk-up-on-deep",
} as const;

type Colors = Record<keyof typeof COLOR_VARS, string>;
type Avatars = ShareAvatars;

const getPlayers = (target: SpecialMatchShareTarget): SpecialMatchSharePlayer[] => {
  switch (target.kind) {
    case "challenge":
      return [target.winner.player, target.passed.player];
    case "streak-break":
      return [target.loser];
    case "king-win":
      return [target.winner, target.loser];
  }
};

const drawAvatar = (
  ctx: CanvasRenderingContext2D,
  avatars: ShareAvatars,
  player: SpecialMatchSharePlayer,
  cx: number,
  cy: number,
  size: number,
  colors: Colors,
  gray = false,
) => drawShareAvatar(ctx, avatars, player, { cx, cy, size, ink: colors.ink, gray });

/** 캔버스 그림자는 변환 배율을 받지 않아 3배 캔버스에서는 값에 배율을 곱한다 */
const setShadow = (
  ctx: CanvasRenderingContext2D,
  color: string,
  blur: number,
  offsetY = 0,
) => {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * SHARE_SCALE;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = offsetY * SHARE_SCALE;
};

/** 아바타 아래 끝에 걸친 태그("N연승"·"연승 끝"). bottom은 태그 아래 끝(아바타 아래 + 12) */
const drawTag = (
  ctx: CanvasRenderingContext2D,
  {
    cx,
    bottom,
    label,
    size,
    background,
    color,
    ring,
    flame = false,
  }: {
    cx: number;
    bottom: number;
    label: string;
    size: number;
    background: string;
    color: string;
    ring: string;
    flame?: boolean;
  },
) => {
  ctx.save();
  ctx.font = shareFont(800, size);
  setLetterSpacing(ctx, "0px");
  const flameSize = size - 1;
  const textWidth = ctx.measureText(label).width;
  const paddingLeft = flame ? 6 : 9;
  const paddingRight = flame ? 8 : 9;
  const contentWidth = (flame ? flameSize + 1 : 0) + textWidth;
  const width = paddingLeft + contentWidth + paddingRight;
  const height = size * 1.5 + 4;
  const x = cx - width / 2;
  const y = bottom - height;
  fillRoundRect(ctx, x - 3, y - 3, width + 6, height + 6, (height + 6) / 2, ring);
  fillRoundRect(ctx, x, y, width, height, height / 2, background);
  let contentX = x + paddingLeft;
  if (flame) {
    ctx.save();
    ctx.translate(contentX, y + (height - flameSize) / 2);
    ctx.scale(flameSize / 24, flameSize / 24);
    ctx.fillStyle = color;
    ctx.fill(new Path2D(FLAME_ICON_PATH));
    ctx.restore();
    contentX += flameSize + 1;
  }
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, contentX, y + height / 2);
  ctx.restore();
};

/** 손바닥 도장: 흰 링 두른 블루 원에 흰 손바닥, -10도 기울임 */
const drawStamp = (
  ctx: CanvasRenderingContext2D,
  { cx, cy, size, iconSize, ring }: { cx: number; cy: number; size: number; iconSize: number; ring: number },
  colors: Colors,
) => {
  ctx.save();
  setShadow(ctx, "rgba(35, 70, 168, 0.35)", 24, 10);
  fillCircle(ctx, cx, cy, size / 2 + ring, colors.white);
  ctx.restore();

  ctx.save();
  fillCircle(ctx, cx, cy, size / 2, colors.primary);
  ctx.translate(cx, cy);
  ctx.rotate((-10 * Math.PI) / 180);
  ctx.scale(iconSize / 24, iconSize / 24);
  ctx.translate(-12, -12);
  ctx.strokeStyle = colors.white;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  STOP_HAND_ICON_PATHS.forEach((d) => ctx.stroke(new Path2D(d)));
  ctx.restore();
};

const drawCenteredText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
) => {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fitLine(ctx, text, maxWidth), cx, cy);
};

// ------------------------------------------------------------------------- 카드 --

interface CardLayout {
  height: number;
  /** 카드에 그리는 글자. 폰트 글자 묶음을 미리 받는 데 쓴다 */
  texts: string[];
  draw: (ctx: CanvasRenderingContext2D, top: number, avatars: Avatars) => void;
}

/** 라이벌전 승리: 랭킹 이름표 + 앱 랭킹 줄 두 개(순위·아바타 32·아이디·▲▼). 평점은 넣지 않는다 */
const challengeCard = (
  target: Extract<SpecialMatchShareTarget, { kind: "challenge" }>,
  colors: Colors,
): CardLayout => {
  const paddingTop = 12;
  const labelHeight = 18 + 4;
  const rowGap = 4;
  const rowHeight = 56;
  const rowX = CARD_X + 10;
  const rowWidth = CARD_WIDTH - 20;
  const drawRow = (
    ctx: CanvasRenderingContext2D,
    avatars: Avatars,
    y: number,
    { player, rank, change }: SpecialMatchShareRankRow,
    isWinner: boolean,
  ) => {
    if (isWinner) {
      ctx.save();
      setShadow(ctx, "rgba(15, 23, 38, 0.12)", 16, 6);
      fillRoundRect(ctx, rowX, y, rowWidth, rowHeight, 12, colors.primarySoft);
      ctx.restore();
    }
    const cy = y + rowHeight / 2;
    ctx.font = shareFont(800, 15);
    ctx.fillStyle = isWinner ? colors.primary : colors.muted;
    drawCenteredText(ctx, String(rank), rowX + 8 + 13, cy, 26);

    const avatarX = rowX + 8 + 26 + 10;
    drawAvatar(ctx, avatars, player, avatarX + 16, cy, 32, colors);

    const changeLabel = `${isWinner ? "▲" : "▼"}${change}`;
    ctx.font = shareFont(800, 13);
    ctx.fillStyle = isWinner ? colors.up : colors.down;
    ctx.textAlign = "right";
    ctx.fillText(changeLabel, rowX + rowWidth - 12, cy);
    const changeWidth = ctx.measureText(changeLabel).width;

    const nameX = avatarX + 32 + 10;
    ctx.font = shareFont(700, 15);
    ctx.fillStyle = colors.ink;
    ctx.textAlign = "left";
    ctx.fillText(
      fitLine(ctx, player.username, rowX + rowWidth - 12 - changeWidth - 10 - nameX),
      nameX,
      cy,
    );
  };
  const label = getRankingCategoryLabel(target.category);
  return {
    height: paddingTop + labelHeight + rowGap + rowHeight + rowGap + rowHeight + 10,
    texts: [
      label,
      ...[target.winner, target.passed].map((row) => `${row.rank}${row.player.username}▲▼${row.change}`),
    ],
    draw: (ctx, top, avatars) => {
      ctx.save();
      ctx.textBaseline = "middle";
      ctx.font = shareFont(700, 12);
      ctx.fillStyle = colors.muted;
      ctx.textAlign = "left";
      ctx.fillText(label, rowX + 8, top + paddingTop + 9);
      const firstRowY = top + paddingTop + labelHeight + rowGap;
      drawRow(ctx, avatars, firstRowY, target.winner, true);
      drawRow(ctx, avatars, firstRowY + rowHeight + rowGap, target.passed, false);
      ctx.restore();
    },
  };
};

/** 연승 저지: 회색 얼굴(112) + 손바닥 도장(72) + "연승 끝" 태그 + 아이디 22 */
const streakBreakCard = (
  target: Extract<SpecialMatchShareTarget, { kind: "streak-break" }>,
  colors: Colors,
): CardLayout => {
  const paddingTop = 30;
  const avatarSize = 112;
  const nameGap = 22;
  const nameLine = 26;
  const stampSize = 72;
  return {
    height: paddingTop + avatarSize + nameGap + nameLine + 24,
    texts: [STREAK_END_LABEL, target.loser.username],
    draw: (ctx, top, avatars) => {
      ctx.save();
      const cx = SHARE_WIDTH / 2;
      const avatarTop = top + paddingTop;
      const avatarBottom = avatarTop + avatarSize;
      drawAvatar(ctx, avatars, target.loser, cx, avatarTop + avatarSize / 2, avatarSize, colors, true);
      drawTag(ctx, {
        cx,
        bottom: avatarBottom + 12,
        label: STREAK_END_LABEL,
        size: 13,
        background: colors.neutral,
        color: colors.sub,
        ring: colors.white,
      });
      // 아바타 오른쪽 끝에서 26 밖, 아래 끝에서 18 위에 도장 끝이 오도록
      drawStamp(
        ctx,
        {
          cx: cx + avatarSize / 2 + 26 - stampSize / 2,
          cy: avatarBottom - 18 - stampSize / 2,
          size: stampSize,
          iconSize: 38,
          ring: 4,
        },
        colors,
      );
      ctx.font = shareFont(800, 22);
      ctx.fillStyle = colors.ink;
      drawCenteredText(ctx, target.loser.username, cx, avatarBottom + nameGap + nameLine / 2, CARD_WIDTH - 28);
      ctx.restore();
    },
  };
};

/** 최강자전 승리: 두 프로필(80)과 VS. 이긴 쪽 앰버 테두리 + "N연승", 진 쪽 회색·도장(46)·"연승 끝" */
const kingWinCard = (
  target: Extract<SpecialMatchShareTarget, { kind: "king-win" }>,
  colors: Colors,
): CardLayout => {
  const paddingTop = 30;
  const paddingX = 12;
  const avatarSize = 80;
  const nameGap = 20;
  const nameLine = 25.5;
  const vsSize = 32;
  const columnGap = 6;
  const columnWidth = (CARD_WIDTH - paddingX * 2 - vsSize - columnGap * 2) / 2;
  const stampSize = 46;
  const winnerLabel = `${target.winnerStreak}연승`;
  return {
    height: Math.round(paddingTop + avatarSize + nameGap + nameLine + 22),
    texts: [winnerLabel, STREAK_END_LABEL, VS_LABEL, target.winner.username, target.loser.username],
    draw: (ctx, top, avatars) => {
      ctx.save();
      const columnTop = top + paddingTop;
      const avatarCy = columnTop + avatarSize / 2;
      const avatarBottom = avatarCy + avatarSize / 2;
      const nameCy = avatarBottom + nameGap + nameLine / 2;
      const winCx = CARD_X + paddingX + columnWidth / 2;
      const loseCx = SHARE_WIDTH - CARD_X - paddingX - columnWidth / 2;

      // 이긴 쪽: 아바타 밖 7px에 3.5px 앰버 테두리와 빛
      drawAvatar(ctx, avatars, target.winner, winCx, avatarCy, avatarSize, colors);
      ctx.save();
      setShadow(ctx, "rgba(255, 182, 39, 0.6)", 16);
      ctx.strokeStyle = colors.amber;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(winCx, avatarCy, avatarSize / 2 + 7 - 1.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawTag(ctx, {
        cx: winCx,
        bottom: avatarBottom + 12,
        label: winnerLabel,
        size: 12,
        background: colors.amber,
        color: colors.ink,
        ring: colors.white,
        flame: true,
      });

      drawAvatar(ctx, avatars, target.loser, loseCx, avatarCy, avatarSize, colors, true);
      drawTag(ctx, {
        cx: loseCx,
        bottom: avatarBottom + 12,
        label: STREAK_END_LABEL,
        size: 12,
        background: colors.neutral,
        color: colors.sub,
        ring: colors.white,
      });
      // 아바타 오른쪽 끝에서 18 밖, 위 끝에서 10 아래에 도장 끝이 오도록
      drawStamp(
        ctx,
        {
          cx: loseCx + avatarSize / 2 + 18 - stampSize / 2,
          cy: columnTop + 10 + stampSize / 2,
          size: stampSize,
          iconSize: 24,
          ring: 3,
        },
        colors,
      );

      // VS: 프로필 묶음(아바타 + 이름) 세로 가운데에서 아래 여백 36만큼 올린 자리
      const columnHeight = avatarSize + nameGap + nameLine;
      const vsCy = columnTop + (columnHeight - vsSize - 36) / 2 + vsSize / 2;
      fillCircle(ctx, SHARE_WIDTH / 2, vsCy, vsSize / 2, colors.bg);
      ctx.font = shareFont(800, 12);
      ctx.fillStyle = colors.muted;
      drawCenteredText(ctx, VS_LABEL, SHARE_WIDTH / 2, vsCy, vsSize);

      ctx.font = shareFont(800, 17);
      ctx.fillStyle = colors.ink;
      drawCenteredText(ctx, target.winner.username, winCx, nameCy, columnWidth);
      drawCenteredText(ctx, target.loser.username, loseCx, nameCy, columnWidth);
      ctx.restore();
    },
  };
};

const getCardLayout = (target: SpecialMatchShareTarget, colors: Colors) => {
  switch (target.kind) {
    case "challenge":
      return challengeCard(target, colors);
    case "streak-break":
      return streakBreakCard(target, colors);
    case "king-win":
      return kingWinCard(target, colors);
  }
};

/** 문구: 15 굵게 흰 글자, 강조 조각만 색. 한 줄에 안 들어가면 12까지 글자를 줄이고, 그래도 넘치면 아이디를 말줄임한다 */
const drawCaption = (
  ctx: CanvasRenderingContext2D,
  parts: SpecialMatchCaptionPart[],
  cy: number,
  colors: Colors,
) => {
  ctx.save();
  setLetterSpacing(ctx, "0px");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const partFont = (part: SpecialMatchCaptionPart, size: number) =>
    shareFont(part.highlight ? 800 : 700, size);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const texts = parts.map((part) => part.text);
  const measure = (size: number) =>
    parts.map((part, index) => {
      ctx.font = partFont(part, size);
      return ctx.measureText(texts[index]).width;
    });
  let size = CAPTION_SIZE;
  let widths = measure(size);
  while (size > MIN_CAPTION_SIZE && sum(widths) > CARD_WIDTH) {
    size -= 1;
    widths = measure(size);
  }
  const overflow = sum(widths) - CARD_WIDTH;
  const fitIndex = parts.findIndex((part) => part.fit);
  if (overflow > 0 && fitIndex >= 0) {
    ctx.font = partFont(parts[fitIndex], size);
    texts[fitIndex] = fitLine(ctx, texts[fitIndex], widths[fitIndex] - overflow);
    widths[fitIndex] = ctx.measureText(texts[fitIndex]).width;
  }
  let x = (SHARE_WIDTH - sum(widths)) / 2;
  parts.forEach((part, index) => {
    ctx.font = partFont(part, size);
    ctx.fillStyle =
      part.highlight === "up" ? colors.upOnDeep : part.highlight === "amber" ? colors.amber : colors.white;
    ctx.fillText(texts[index], x, cy);
    x += widths[index];
  });
  ctx.restore();
};

export const createSpecialMatchShareImage = async (target: SpecialMatchShareTarget): Promise<File> => {
  const colors = readTokenColors(COLOR_VARS);
  const title = getSpecialMatchShareTitle(target.kind);
  const captionParts = getSpecialMatchCaptionParts(target);
  const dateLabel = getSpecialMatchShareDateLabel(target.playedAt, target.sessionName);
  const card = getCardLayout(target, colors);
  const [avatars] = await Promise.all([
    loadShareAvatars(getPlayers(target)),
    loadShareFonts(
      [title, ...captionParts.map((part) => part.text), ...card.texts, target.username, dateLabel],
      [400, 700, 800],
    ),
  ]);

  const { canvas, ctx } = createShareCanvas(colors.ink);
  const blockHeight = TITLE_LINE + TITLE_CARD_GAP + card.height + CARD_CAPTION_GAP + CAPTION_LINE;
  // 묶음은 아래 줄 위 공간에서 세로 가운데에 둔다
  const titleTop = Math.max(
    MIN_CONTENT_TOP,
    Math.round(SHARE_EDGE + (SHARE_CONTENT_BOTTOM - SHARE_EDGE - blockHeight) / 2),
  );
  const cardTop = titleTop + TITLE_LINE + TITLE_CARD_GAP;
  const cardCy = cardTop + card.height / 2;

  drawRays(ctx, SHARE_WIDTH / 2, cardCy, colors.amber);
  drawGlow(ctx, SHARE_WIDTH / 2, cardCy, colors.amber);

  ctx.save();
  ctx.font = shareFont(800, TITLE_SIZE);
  setLetterSpacing(ctx, "-0.68px");
  ctx.fillStyle = colors.white;
  drawCenteredText(ctx, title, SHARE_WIDTH / 2, titleTop + TITLE_LINE / 2, CARD_WIDTH);
  ctx.restore();

  fillRoundRect(ctx, CARD_X, cardTop, CARD_WIDTH, card.height, CARD_RADIUS, colors.white);
  card.draw(ctx, cardTop, avatars);

  drawCaption(
    ctx,
    captionParts,
    cardTop + card.height + CARD_CAPTION_GAP + CAPTION_LINE / 2,
    colors,
  );

  drawShareFooter(ctx, { username: target.username, dateLabel, color: colors.white });

  return canvasToPngFile(canvas, getSpecialMatchShareFileName(target));
};
