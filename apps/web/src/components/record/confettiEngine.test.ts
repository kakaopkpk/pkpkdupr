import { describe, expect, it } from "vitest";
import { stepConfettiPiece, type ConfettiPiece } from "./confettiEngine";

const basePiece = (overrides: Partial<ConfettiPiece> = {}): ConfettiPiece => ({
  x: 100,
  y: 100,
  vx: 0,
  vy: 0,
  t: 0,
  life: 2,
  gravity: 900,
  drag: 1,
  maxFallSpeed: 520,
  rotation: 0,
  rotationSpeed: 0,
  flip: 0,
  flipSpeed: 0,
  sway: 0,
  swaySpeed: 0,
  swayAmount: 0,
  width: 6,
  height: 4,
  isRound: false,
  color: "#2346a8",
  isFront: true,
  ...overrides,
});

describe("stepConfettiPiece", () => {
  it("기다리는 중(t < 0)이면 움직이지 않고 살아 있다", () => {
    const piece = basePiece({ t: -0.1 });
    expect(stepConfettiPiece(piece, 0.016, 800)).toBe(true);
    expect(piece.y).toBe(100);
  });

  it("중력으로 떨어지되 최대 낙하 속도를 넘지 않는다", () => {
    const piece = basePiece({ vy: 510 });
    stepConfettiPiece(piece, 0.033, 800);
    expect(piece.vy).toBe(520);
    expect(piece.y).toBeGreaterThan(100);
  });

  it("수명이 다하면 지운다", () => {
    const piece = basePiece({ t: 1.99 });
    expect(stepConfettiPiece(piece, 0.02, 800)).toBe(false);
  });

  it("화면 아래로 벗어나면 지운다", () => {
    const piece = basePiece({ y: 870, vy: 400 });
    expect(stepConfettiPiece(piece, 0.016, 800)).toBe(false);
  });
});
