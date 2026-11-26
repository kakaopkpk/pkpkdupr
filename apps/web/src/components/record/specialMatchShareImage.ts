import { CHALLENGE_FLAG_ICON_PATHS, FLAME_ICON_PATH, STOP_HAND_ICON_PATHS } from "@/components/ui/Icons";
import {
  getChallengeDefeatedNames,
  getSpecialMatchCaptionParts,
  getSpecialMatchShareDateLabel,
  getSpecialMatchShareFileName,
  getSpecialMatchShareTitle,
  STREAK_END_LABEL,
  type SpecialMatchCaptionPart,
  type SpecialMatchSharePlayer,
  type SpecialMatchShareRankRow,
  type SpecialMatchShareTarget,
  VS_LABEL,
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
  SHARE_WIDTH,
  setLetterSpacing,
  setShadow,
  shareFont,
  withAlpha,
} from "@/lib/shareImageCanvas";
import {
  CHALLENGE_AVATAR,
  CHALLENGE_AVATAR_OVERLAP,
  getChallengeGroupWidth,
} from "./specialMatchCelebration.utils";

/*
 * 특수 매치 공유 이미지(4:5). 틀은 업적 공유 이미지와 같고, 가운데는 큰 연출 끝 화면 그대로
 * 흰 카드 없이 그림 → 제목(26) → 문구다. 빛줄기·후광의 중심은 주인공 얼굴이다.
 * 배치 값은 docs/design.md "특수 매치 공유"와 큰 연출 그림(SpecialMatchCelebrationScenes)을 따른다.
 */
const CONTENT_WIDTH = SHARE_WIDTH - SHARE_EDGE * 2;
const SCENE_TITLE_GAP = 30;
const TITLE_SIZE = 26;
const TITLE_LINE = TITLE_SIZE * 1.5;
const TITLE_CAPTION_GAP = 6;
const CAPTION_SIZE = 15;
const CAPTION_LINE = CAPTION_SIZE * 1.45;
const CAPTION_WEIGHT = 400;
const CAPTION_HIGHLIGHT_WEIGHT = 800;
const MIN_CAPTION_SIZE = 12;
const MIN_CONTENT_TOP = 36;
// 얼굴과 이름 사이
const NAME_GAP = 22;
// 칩·태그 아래 끝이 아바타 아래 끝보다 이만큼 내려온다
const BADGE_DROP = 12;
// 칩·태그와 아바타 사이 바탕색 틈
const BADGE_RING = 3;
const WHITE_78 = "rgba(255, 255, 255, 0.78)";
const WHITE_45 = "rgba(255, 255, 255, 0.45)";

const COLOR_VARS = {
  ink: "--color-pk-ink",
  amber: "--color-pk-hl",
  primary: "--color-pk-primary",
  white: "--color-white",
  sub: "--color-pk-sub",
  neutral: "--color-pk-neutral",
  up: "--color-pk-up",
  down: "--color-pk-down",
  upOnDeep: "--color-pk-up-on-deep",
} as const;

type Colors = Record<keyof typeof COLOR_VARS, string>;
type Avatars = ShareAvatars;

const getPlayers = (target: SpecialMatchShareTarget): SpecialMatchSharePlayer[] => {
  switch (target.kind) {
    case "rival":
      return [target.winner.player, target.passed.player];
    case "streak-break":
      return [target.loser];
    case "king-win":
      return [target.winner, target.loser];
    case "challenge-win":
      return target.defeated;
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
  { gray = false, alpha = 1 }: { gray?: boolean; alpha?: number } = {},
) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawShareAvatar(ctx, avatars, player, { cx, cy, size, ink: colors.ink, gray });
  ctx.restore();
};

/** 바탕색 틈(BADGE_RING)을 두른 알약. 아바타 위에 걸친 태그·칩을 얼굴과 띄운다 */
const fillRingedPill = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  ring: string,
) => {
  const outerHeight = height + BADGE_RING * 2;
  fillRoundRect(ctx, x - BADGE_RING, y - BADGE_RING, width + BADGE_RING * 2, outerHeight, outerHeight / 2, ring);
  fillRoundRect(ctx, x, y, width, height, height / 2, fill);
};

const TAG_HEIGHT = 24;
const TAG_FONT_SIZE = 13;

/** 아바타 아래 끝에 걸친 태그("N연승"·"연승 끝"). bottom은 태그 아래 끝(아바타 아래 + 12), 둘레는 바탕색 틈이다 */
const drawTag = (
  ctx: CanvasRenderingContext2D,
  {
    cx,
    bottom,
    label,
    background,
    color,
    ring,
    flame = false,
  }: {
    cx: number;
    bottom: number;
    label: string;
    background: string;
    color: string;
    ring: string;
    flame?: boolean;
  },
) => {
  ctx.save();
  ctx.font = shareFont(800, TAG_FONT_SIZE);
  setLetterSpacing(ctx, "0px");
  const flameSize = TAG_FONT_SIZE;
  const textWidth = ctx.measureText(label).width;
  const paddingLeft = flame ? 6 : 8;
  const paddingRight = 8;
  const contentWidth = (flame ? flameSize + 1 : 0) + textWidth;
  const width = paddingLeft + contentWidth + paddingRight;
  const height = TAG_HEIGHT;
  const x = cx - width / 2;
  const y = bottom - height;
  fillRingedPill(ctx, x, y, width, height, background, ring);
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

/** 도장: 흰 링 두른 블루 원에 흰 손바닥(연승 저지·최강자전)이나 깃발(도전 성공), -10도 기울임 */
const drawStamp = (
  ctx: CanvasRenderingContext2D,
  {
    cx,
    cy,
    size,
    iconSize,
    ring,
    iconPaths = STOP_HAND_ICON_PATHS,
  }: { cx: number; cy: number; size: number; iconSize: number; ring: number; iconPaths?: readonly string[] },
  colors: Colors,
) => {
  ctx.save();
  setShadow(ctx, withAlpha(colors.primary, 0.35), 24, 10);
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
  iconPaths.forEach((d) => ctx.stroke(new Path2D(d)));
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

/** 연승 테두리: 아바타 밖 gap 틈(투명)에 width 굵기 앰버 원과 바깥 빛 */
const drawStreakRing = (
  ctx: CanvasRenderingContext2D,
  { cx, cy, size, gap, width, blur }: { cx: number; cy: number; size: number; gap: number; width: number; blur: number },
  colors: Colors,
) => {
  ctx.save();
  setShadow(ctx, withAlpha(colors.amber, 0.6), blur);
  ctx.strokeStyle = colors.amber;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + gap + width / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

/** 이름 한 줄. 넘치면 말줄임한다 */
const drawName = (
  ctx: CanvasRenderingContext2D,
  name: string,
  { cx, cy, size, maxWidth, color }: { cx: number; cy: number; size: number; maxWidth: number; color: string },
) => {
  ctx.save();
  ctx.font = shareFont(800, size);
  ctx.fillStyle = color;
  drawCenteredText(ctx, name, cx, cy, maxWidth);
  ctx.restore();
};

// ------------------------------------------------------------------------- 그림 --

interface SceneLayout {
  height: number;
  /** 그림에 그리는 글자. 폰트 글자 묶음을 미리 받는 데 쓴다 */
  texts: string[];
  /** 빛줄기·후광 중심(주인공 얼굴 가운데). y는 그림 위 끝 기준이다 */
  hero: { cx: number; cy: number };
  draw: (ctx: CanvasRenderingContext2D, top: number, avatars: Avatars) => void;
}

const RIVAL_WIDTH = 300;
const RIVAL_COLUMN_GAP = 24;
const RIVAL_AVATAR = 88;
const RIVAL_NAME_LINE = 22;
const CHIP_HEIGHT = 22;
const CHIP_PADDING_X = 8;
const CHIP_GAP = 4;

const getChipTexts = ({ rank, change }: SpecialMatchShareRankRow, isWinner: boolean) => [
  `${rank}위`,
  `${isWinner ? "▲" : "▼"}${change}`,
];

/** 얼굴 아래에 걸친 "N위 ▲n" 칩. 이긴 쪽은 흰 바탕, 넘은 쪽은 회색 바탕이다 */
const drawRankChip = (
  ctx: CanvasRenderingContext2D,
  row: SpecialMatchShareRankRow,
  { cx, bottom, isWinner }: { cx: number; bottom: number; isWinner: boolean },
  colors: Colors,
) => {
  ctx.save();
  ctx.font = shareFont(800, 12);
  setLetterSpacing(ctx, "0px");
  const [rankText, changeText] = getChipTexts(row, isWinner);
  const hasChange = row.change !== 0;
  const rankWidth = ctx.measureText(rankText).width;
  const changeWidth = hasChange ? ctx.measureText(changeText).width : 0;
  const width = CHIP_PADDING_X * 2 + rankWidth + (hasChange ? CHIP_GAP + changeWidth : 0);
  const x = cx - width / 2;
  const y = bottom - CHIP_HEIGHT;
  fillRingedPill(ctx, x, y, width, CHIP_HEIGHT, isWinner ? colors.white : colors.neutral, colors.ink);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isWinner ? colors.ink : colors.sub;
  ctx.fillText(rankText, x + CHIP_PADDING_X, y + CHIP_HEIGHT / 2);
  if (hasChange) {
    ctx.fillStyle = isWinner ? colors.up : colors.down;
    ctx.fillText(changeText, x + CHIP_PADDING_X + rankWidth + CHIP_GAP, y + CHIP_HEIGHT / 2);
  }
  ctx.restore();
};

/** 라이벌전 승리: 두 얼굴(88) 나란히. 왼쪽 이긴 사람(흰 칩 "N위 ▲n"), 오른쪽 넘은 사람(흐린 얼굴·회색 칩 "N위 ▼n") */
const rivalScene = (
  target: Extract<SpecialMatchShareTarget, { kind: "rival" }>,
  colors: Colors,
): SceneLayout => {
  const columnWidth = (RIVAL_WIDTH - RIVAL_COLUMN_GAP) / 2;
  const winCx = (SHARE_WIDTH - RIVAL_WIDTH) / 2 + columnWidth / 2;
  const passCx = SHARE_WIDTH - winCx;
  const avatarCy = RIVAL_AVATAR / 2;
  return {
    height: RIVAL_AVATAR + NAME_GAP + RIVAL_NAME_LINE,
    texts: [
      ...getChipTexts(target.winner, true),
      ...getChipTexts(target.passed, false),
      target.winner.player.username,
      target.passed.player.username,
    ],
    hero: { cx: winCx, cy: avatarCy },
    draw: (ctx, top, avatars) => {
      const avatarBottom = top + RIVAL_AVATAR;
      const nameCy = avatarBottom + NAME_GAP + RIVAL_NAME_LINE / 2;
      drawAvatar(ctx, avatars, target.winner.player, winCx, top + avatarCy, RIVAL_AVATAR, colors);
      drawRankChip(ctx, target.winner, { cx: winCx, bottom: avatarBottom + BADGE_DROP, isWinner: true }, colors);
      drawName(ctx, target.winner.player.username, {
        cx: winCx,
        cy: nameCy,
        size: 17,
        maxWidth: columnWidth,
        color: colors.white,
      });

      drawAvatar(ctx, avatars, target.passed.player, passCx, top + avatarCy, RIVAL_AVATAR, colors, { alpha: 0.55 });
      drawRankChip(ctx, target.passed, { cx: passCx, bottom: avatarBottom + BADGE_DROP, isWinner: false }, colors);
      drawName(ctx, target.passed.player.username, {
        cx: passCx,
        cy: nameCy,
        size: 17,
        maxWidth: columnWidth,
        color: WHITE_78,
      });
    },
  };
};

const STOPPER_AVATAR = 112;
const STOPPER_STAMP = 72;
const STOPPER_NAME_LINE = 26;

/** 연승 저지: 회색 얼굴(112) + 손바닥 도장(72) + "연승 끝" 태그 + 이름 22 */
const streakBreakScene = (
  target: Extract<SpecialMatchShareTarget, { kind: "streak-break" }>,
  colors: Colors,
): SceneLayout => {
  const cx = SHARE_WIDTH / 2;
  return {
    height: STOPPER_AVATAR + NAME_GAP + STOPPER_NAME_LINE,
    texts: [STREAK_END_LABEL, target.loser.username],
    hero: { cx, cy: STOPPER_AVATAR / 2 },
    draw: (ctx, top, avatars) => {
      const avatarBottom = top + STOPPER_AVATAR;
      drawAvatar(ctx, avatars, target.loser, cx, top + STOPPER_AVATAR / 2, STOPPER_AVATAR, colors, { gray: true });
      drawTag(ctx, {
        cx,
        bottom: avatarBottom + BADGE_DROP,
        label: STREAK_END_LABEL,
        background: colors.neutral,
        color: colors.sub,
        ring: colors.ink,
      });
      // 아바타 오른쪽 끝에서 26 밖, 아래 끝에서 18 위에 도장 끝이 오도록
      drawStamp(
        ctx,
        {
          cx: cx + STOPPER_AVATAR / 2 + 26 - STOPPER_STAMP / 2,
          cy: avatarBottom - 18 - STOPPER_STAMP / 2,
          size: STOPPER_STAMP,
          iconSize: 38,
          ring: 4,
        },
        colors,
      );
      drawName(ctx, target.loser.username, {
        cx,
        cy: avatarBottom + NAME_GAP + STOPPER_NAME_LINE / 2,
        size: 22,
        maxWidth: CONTENT_WIDTH,
        color: colors.white,
      });
    },
  };
};

const KING_WIDTH = 310;
const KING_COLUMN_GAP = 12;
const KING_AVATAR = 96;
const KING_STAMP = 54;
const KING_NAME_LINE = 22;
// "VS"(15 굵게, 자간 0.5)의 대략 너비. 두 칸 폭 계산에만 쓴다
const VS_WIDTH = 22;

/** 최강자전 승리: 같은 크기 두 얼굴(96)과 가운데 "VS" 글자. 이긴 쪽 앰버 테두리 + "N연승", 진 쪽 회색·도장(54)·"연승 끝" */
const kingWinScene = (
  target: Extract<SpecialMatchShareTarget, { kind: "king-win" }>,
  colors: Colors,
): SceneLayout => {
  const columnWidth = (KING_WIDTH - VS_WIDTH - KING_COLUMN_GAP * 2) / 2;
  const winCx = (SHARE_WIDTH - KING_WIDTH) / 2 + columnWidth / 2;
  const loseCx = SHARE_WIDTH - winCx;
  const avatarCy = KING_AVATAR / 2;
  const winnerLabel = `${target.winnerStreak}연승`;
  return {
    height: KING_AVATAR + NAME_GAP + KING_NAME_LINE,
    texts: [winnerLabel, STREAK_END_LABEL, VS_LABEL, target.winner.username, target.loser.username],
    hero: { cx: winCx, cy: avatarCy },
    draw: (ctx, top, avatars) => {
      const cy = top + avatarCy;
      const avatarBottom = top + KING_AVATAR;
      const nameCy = avatarBottom + NAME_GAP + KING_NAME_LINE / 2;

      drawStreakRing(ctx, { cx: winCx, cy, size: KING_AVATAR, gap: 3.5, width: 3.5, blur: 18 }, colors);
      drawAvatar(ctx, avatars, target.winner, winCx, cy, KING_AVATAR, colors);
      drawTag(ctx, {
        cx: winCx,
        bottom: avatarBottom + BADGE_DROP,
        label: winnerLabel,
        background: colors.amber,
        color: colors.ink,
        ring: colors.ink,
        flame: true,
      });

      drawAvatar(ctx, avatars, target.loser, loseCx, cy, KING_AVATAR, colors, { gray: true });
      drawTag(ctx, {
        cx: loseCx,
        bottom: avatarBottom + BADGE_DROP,
        label: STREAK_END_LABEL,
        background: colors.neutral,
        color: colors.sub,
        ring: colors.ink,
      });
      // 아바타 오른쪽 끝에서 22 밖, 아래 끝에서 14 위에 도장 끝이 오도록
      drawStamp(
        ctx,
        {
          cx: loseCx + KING_AVATAR / 2 + 22 - KING_STAMP / 2,
          cy: avatarBottom - 14 - KING_STAMP / 2,
          size: KING_STAMP,
          iconSize: 28,
          ring: 3,
        },
        colors,
      );

      ctx.save();
      ctx.font = shareFont(800, 15);
      setLetterSpacing(ctx, "0.5px");
      ctx.fillStyle = WHITE_45;
      drawCenteredText(ctx, VS_LABEL, SHARE_WIDTH / 2, cy, VS_WIDTH * 2);
      ctx.restore();

      drawName(ctx, target.winner.username, { cx: winCx, cy: nameCy, size: 18, maxWidth: columnWidth, color: colors.white });
      drawName(ctx, target.loser.username, { cx: loseCx, cy: nameCy, size: 18, maxWidth: columnWidth, color: WHITE_78 });
    },
  };
};

const CHALLENGE_STAMP = 72;
const CHALLENGE_NAME_LINE = 22;

/** 도전 성공: 진 높은 팀 두 얼굴(104, 24 겹침) + 묶음 오른쪽 아래 깃발 도장(72) + 이름 줄 15("a · b"). 빛줄기 중심은 두 얼굴 가운데다 */
const challengeWinScene = (
  target: Extract<SpecialMatchShareTarget, { kind: "challenge-win" }>,
  colors: Colors,
): SceneLayout => {
  const groupWidth = getChallengeGroupWidth(target.defeated.length);
  const groupLeft = (SHARE_WIDTH - groupWidth) / 2;
  const names = getChallengeDefeatedNames(target.defeated);
  return {
    height: CHALLENGE_AVATAR + NAME_GAP + CHALLENGE_NAME_LINE,
    texts: [names],
    hero: { cx: SHARE_WIDTH / 2, cy: CHALLENGE_AVATAR / 2 },
    draw: (ctx, top, avatars) => {
      const cy = top + CHALLENGE_AVATAR / 2;
      const avatarBottom = top + CHALLENGE_AVATAR;
      target.defeated.forEach((player, index) => {
        // 큰 연출처럼 뒤 얼굴이 앞 얼굴을 덮는다
        const avatarCx = groupLeft + CHALLENGE_AVATAR / 2 + index * (CHALLENGE_AVATAR - CHALLENGE_AVATAR_OVERLAP);
        drawAvatar(ctx, avatars, player, avatarCx, cy, CHALLENGE_AVATAR, colors);
      });
      // 묶음 오른쪽 끝에서 24 밖, 아래 끝에서 8 아래에 도장 끝이 오도록
      drawStamp(
        ctx,
        {
          cx: groupLeft + groupWidth + 24 - CHALLENGE_STAMP / 2,
          cy: avatarBottom + 8 - CHALLENGE_STAMP / 2,
          size: CHALLENGE_STAMP,
          iconSize: 40,
          ring: 4,
          iconPaths: CHALLENGE_FLAG_ICON_PATHS,
        },
        colors,
      );
      drawName(ctx, names, {
        cx: SHARE_WIDTH / 2,
        cy: avatarBottom + NAME_GAP + CHALLENGE_NAME_LINE / 2,
        size: 15,
        maxWidth: CONTENT_WIDTH,
        color: colors.white,
      });
    },
  };
};

const getSceneLayout = (target: SpecialMatchShareTarget, colors: Colors) => {
  switch (target.kind) {
    case "rival":
      return rivalScene(target, colors);
    case "streak-break":
      return streakBreakScene(target, colors);
    case "king-win":
      return kingWinScene(target, colors);
    case "challenge-win":
      return challengeWinScene(target, colors);
  }
};

/**
 * 문구: 15 보통 굵기 흰 78% 글자, 강조 조각만 굵게(800) 색을 입힌다.
 * 한 줄에 안 들어가면 12까지 글자를 줄이고, 그래도 넘치면 아이디를 말줄임한다
 */
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
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const texts = parts.map((part) => part.text);
  const fontOf = (part: SpecialMatchCaptionPart, size: number) =>
    shareFont(part.highlight ? CAPTION_HIGHLIGHT_WEIGHT : CAPTION_WEIGHT, size);
  const measure = (size: number) =>
    texts.map((text, index) => {
      ctx.font = fontOf(parts[index], size);
      return ctx.measureText(text).width;
    });
  let size = CAPTION_SIZE;
  let widths = measure(size);
  while (size > MIN_CAPTION_SIZE && sum(widths) > CONTENT_WIDTH) {
    size -= 1;
    widths = measure(size);
  }
  const overflow = sum(widths) - CONTENT_WIDTH;
  const fitIndex = parts.findIndex((part) => part.fit);
  if (overflow > 0 && fitIndex >= 0) {
    ctx.font = fontOf(parts[fitIndex], size);
    texts[fitIndex] = fitLine(ctx, texts[fitIndex], widths[fitIndex] - overflow);
    widths[fitIndex] = ctx.measureText(texts[fitIndex]).width;
  }
  let x = (SHARE_WIDTH - sum(widths)) / 2;
  parts.forEach((part, index) => {
    ctx.font = fontOf(part, size);
    ctx.fillStyle =
      part.highlight === "up" ? colors.upOnDeep : part.highlight === "amber" ? colors.amber : WHITE_78;
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
  const scene = getSceneLayout(target, colors);
  const [avatars] = await Promise.all([
    loadShareAvatars(getPlayers(target)),
    loadShareFonts(
      [title, ...captionParts.map((part) => part.text), ...scene.texts, target.username, dateLabel],
      [400, 800],
    ),
  ]);

  const { canvas, ctx } = createShareCanvas(colors.ink);
  const blockHeight = scene.height + SCENE_TITLE_GAP + TITLE_LINE + TITLE_CAPTION_GAP + CAPTION_LINE;
  // 묶음은 아래 줄 위 공간에서 세로 가운데에 둔다
  const sceneTop = Math.max(
    MIN_CONTENT_TOP,
    Math.round(SHARE_EDGE + (SHARE_CONTENT_BOTTOM - SHARE_EDGE - blockHeight) / 2),
  );
  const titleTop = sceneTop + scene.height + SCENE_TITLE_GAP;

  drawRays(ctx, scene.hero.cx, sceneTop + scene.hero.cy, colors.amber);
  drawGlow(ctx, scene.hero.cx, sceneTop + scene.hero.cy, colors.amber);

  scene.draw(ctx, sceneTop, avatars);

  ctx.save();
  ctx.font = shareFont(800, TITLE_SIZE);
  setLetterSpacing(ctx, "-0.52px");
  ctx.fillStyle = colors.white;
  drawCenteredText(ctx, title, SHARE_WIDTH / 2, titleTop + TITLE_LINE / 2, CONTENT_WIDTH);
  ctx.restore();

  drawCaption(
    ctx,
    captionParts,
    titleTop + TITLE_LINE + TITLE_CAPTION_GAP + CAPTION_LINE / 2,
    colors,
  );

  drawShareFooter(ctx, { username: target.username, dateLabel, color: colors.white });

  return canvasToPngFile(canvas, getSpecialMatchShareFileName(target));
};
