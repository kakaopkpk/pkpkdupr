/** 색종이 한 장. 좌표·속도는 캔버스 CSS 픽셀, 시간은 초 */
export interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 지난 시간. 음수면 그만큼 기다렸다 나타난다 */
  t: number;
  life: number;
  gravity: number;
  /** 60fps 한 프레임당 속도 감쇠 비율 */
  drag: number;
  maxFallSpeed: number;
  rotation: number;
  rotationSpeed: number;
  /** 종이가 뒤집히는 위상. 세로 폭을 cos(flip)로 줄여 그린다 */
  flip: number;
  flipSpeed: number;
  sway: number;
  swaySpeed: number;
  swayAmount: number;
  width: number;
  height: number;
  isRound: boolean;
  color: string;
  /** true면 배지 앞 캔버스, false면 배지 뒤 캔버스에 그린다 */
  isFront: boolean;
}

/** 사라지기 전 서서히 투명해지는 시간(초) */
const FADE_OUT_SECONDS = 0.5;
/** 화면 아래로 이만큼 벗어나면 지운다 */
const OFFSCREEN_MARGIN = 60;

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];

function createPiece(
  colors: readonly string[],
  overrides: Pick<ConfettiPiece, "x" | "y" | "vx" | "vy"> & Partial<ConfettiPiece>,
): ConfettiPiece {
  const isBig = Math.random() < 0.25;
  return {
    t: 0,
    life: random(2.2, 3.2),
    gravity: 900,
    drag: 0.965,
    maxFallSpeed: 520,
    rotation: random(0, Math.PI * 2),
    rotationSpeed: random(-9, 9),
    flip: random(0, Math.PI * 2),
    flipSpeed: random(6, 14),
    sway: random(0, Math.PI * 2),
    swaySpeed: random(3, 6),
    swayAmount: random(10, 40),
    width: isBig ? random(9, 12) : random(5, 8),
    height: random(3, 5),
    isRound: Math.random() < 0.2,
    color: pick(colors),
    isFront: Math.random() < 0.55,
    ...overrides,
  };
}

/** 한 조각을 dt초만큼 움직인다. 수명이 다했거나 화면 아래로 벗어났으면 false */
export function stepConfettiPiece(
  piece: ConfettiPiece,
  dt: number,
  viewportHeight: number,
): boolean {
  piece.t += dt;
  if (piece.t < 0) return true;
  const decay = Math.pow(piece.drag, dt * 60);
  piece.vx *= decay;
  piece.vy = Math.min(piece.vy * decay + piece.gravity * dt, piece.maxFallSpeed);
  piece.sway += dt * piece.swaySpeed;
  piece.x += (piece.vx + Math.sin(piece.sway) * piece.swayAmount) * dt;
  piece.y += piece.vy * dt;
  piece.rotation += piece.rotationSpeed * dt;
  piece.flip += piece.flipSpeed * dt;
  return piece.t < piece.life && piece.y < viewportHeight + OFFSCREEN_MARGIN;
}

function drawPiece(context: CanvasRenderingContext2D, piece: ConfettiPiece) {
  const remaining = piece.life - piece.t;
  context.save();
  context.globalAlpha = remaining < FADE_OUT_SECONDS ? Math.max(0, remaining / FADE_OUT_SECONDS) : 1;
  context.translate(piece.x, piece.y);
  context.rotate(piece.rotation);
  context.scale(1, Math.cos(piece.flip));
  context.fillStyle = piece.color;
  if (piece.isRound) {
    context.beginPath();
    context.arc(0, 0, piece.width / 2.4, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
  }
  context.restore();
}

export interface ConfettiEngine {
  readonly width: number;
  readonly height: number;
  /** 캔버스 크기를 지금 화면 크기에 맞춘다 */
  resize: () => void;
  /** (x, y)에서 사방으로 터진다 */
  burst: (x: number, y: number, count: number, minSpeed: number, maxSpeed: number) => void;
  /** (x, y)에서 위쪽으로 쏘아 올린다. direction 1은 오른쪽 위, -1은 왼쪽 위 */
  popper: (x: number, y: number, direction: 1 | -1, count: number) => void;
  destroy: () => void;
}

/**
 * 배지 뒤(back)·앞(front) 두 캔버스에 색종이를 그린다.
 * 조각이 하나라도 있는 동안만 requestAnimationFrame을 돌린다.
 */
export function createConfettiEngine(
  back: HTMLCanvasElement,
  front: HTMLCanvasElement,
  colors: readonly string[],
): ConfettiEngine {
  const backContext = back.getContext("2d");
  const frontContext = front.getContext("2d");
  let pieces: ConfettiPiece[] = [];
  let frameId = 0;
  let lastTime = 0;
  let width = 0;
  let height = 0;

  const resize = () => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    width = back.clientWidth;
    height = back.clientHeight;
    for (const [canvas, context] of [
      [back, backContext],
      [front, frontContext],
    ] as const) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  };

  const tick = (now: number) => {
    // 첫 프레임의 rAF 시각이 add() 때 잰 시각보다 이를 수 있어 0 아래로는 자른다
    const dt = Math.max(0, Math.min(0.033, (now - lastTime) / 1000));
    lastTime = now;
    backContext?.clearRect(0, 0, width, height);
    frontContext?.clearRect(0, 0, width, height);
    pieces = pieces.filter((piece) => {
      const isAlive = stepConfettiPiece(piece, dt, height);
      const context = piece.isFront ? frontContext : backContext;
      if (isAlive && piece.t >= 0 && context) drawPiece(context, piece);
      return isAlive;
    });
    frameId = pieces.length > 0 ? requestAnimationFrame(tick) : 0;
  };

  const add = (piece: ConfettiPiece) => {
    if (colors.length === 0) return;
    pieces.push(piece);
    if (frameId === 0) {
      lastTime = performance.now();
      frameId = requestAnimationFrame(tick);
    }
  };

  resize();

  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    resize,
    burst(x, y, count, minSpeed, maxSpeed) {
      for (let i = 0; i < count; i += 1) {
        const angle = random(0, Math.PI * 2);
        const speed = random(minSpeed, maxSpeed);
        add(
          createPiece(colors, {
            x,
            y,
            vx: Math.cos(angle) * speed,
            // 위쪽으로 조금 더 튀어 오르게 한다
            vy: Math.sin(angle) * speed - 180,
            t: -random(0, 0.04),
          }),
        );
      }
    },
    popper(x, y, direction, count) {
      for (let i = 0; i < count; i += 1) {
        const angle = -Math.PI / 2 + direction * random(0.22, 0.62);
        const speed = random(780, 1150);
        add(
          createPiece(colors, {
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            drag: 0.955,
            t: -random(0, 0.08),
            isFront: Math.random() < 0.7,
          }),
        );
      }
    },
    destroy() {
      if (frameId !== 0) cancelAnimationFrame(frameId);
      frameId = 0;
      pieces = [];
    },
  };
}
