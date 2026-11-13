import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AchievementDefinition } from "@pkpkdupr/shared/achievements";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { PkButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { createConfettiEngine, type ConfettiEngine } from "./confettiEngine";

const BADGE_SIZE = 124;
const CONFETTI_COLOR_VARS = [1, 2, 3, 4, 5, 6].map((n) => `--pk-confetti-${n}`);
// 첫 장은 딤이 깔린 뒤 배지가 나온다. 다음 장부터는 바로 나온다
const FIRST_CARD_DELAY_MS = 150;
const BURST_AFTER_BADGE_MS = 80;
const POPPERS_AFTER_BADGE_MS = 230;
const RAYS_SPIN_MS = 22000;
// 폭죽을 쏘는 아래 모서리 위치(캔버스 가장자리에서 떨어진 거리)
const POPPER_INSET_X = 6;
const POPPER_INSET_BOTTOM = 40;

type Phase = "enter" | "leaving" | "closing";

const ms = (value: number) => `${value}ms`;

export interface AchievementCelebrationProps {
  /** 띄울 업적. 한 장씩 넘긴다 */
  achievements: readonly AchievementDefinition[];
  /** 마운트 후 이만큼 기다렸다가 띄운다 */
  delayMs: number;
  onClose: () => void;
}

/**
 * 새 업적을 받았을 때 화면 전체를 어둡게 덮고 배지를 띄우는 축하 연출.
 * 첫 장은 딤·빛줄기부터, 다음 장부터는 배지·색종이·폭죽·고리만 처음부터 다시 재생한다(장마다 key로 다시 마운트).
 * 확인(또는 배경 누르기·Esc)으로만 닫힌다. 움직임 줄이기면 연출 없이 최종 상태를 바로 보인다.
 */
export default function AchievementCelebration({
  achievements,
  delayMs,
  onClose,
}: AchievementCelebrationProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("enter");
  const [isReducedMotion] = useState(prefersReducedMotion);
  const rootRef = useRef<HTMLDivElement>(null);
  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ConfettiEngine | null>(null);

  const current = achievements[index];
  const isFirst = index === 0;
  const isLast = index >= achievements.length - 1;
  const badgeDelayMs = isFirst ? FIRST_CARD_DELAY_MS : 0;

  const focusButton = useCallback(() => {
    actionsRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setIsOpen(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  // 장마다 배지 중심에서 색종이를, 아래 양쪽 모서리에서 폭죽을 터뜨린다
  useEffect(() => {
    const root = rootRef.current;
    const back = backCanvasRef.current;
    const front = frontCanvasRef.current;
    const badge = badgeRef.current;
    if (!isOpen || isReducedMotion || !root || !back || !front || !badge) return;
    if (!engineRef.current) {
      const style = getComputedStyle(root);
      const colors = CONFETTI_COLOR_VARS.map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
      engineRef.current = createConfettiEngine(back, front, colors);
    }
    const engine = engineRef.current;
    const canvasRect = back.getBoundingClientRect();
    const badgeRect = badge.getBoundingClientRect();
    const centerX = badgeRect.left - canvasRect.left + badgeRect.width / 2;
    const centerY = badgeRect.top - canvasRect.top + badgeRect.height / 2;
    const popperY = canvasRect.height - POPPER_INSET_BOTTOM;
    const timers = [
      window.setTimeout(() => engine.burst(centerX, centerY), badgeDelayMs + BURST_AFTER_BADGE_MS),
      window.setTimeout(() => {
        engine.popper(POPPER_INSET_X, popperY, 1);
        engine.popper(canvasRect.width - POPPER_INSET_X, popperY, -1);
      }, badgeDelayMs + POPPERS_AFTER_BADGE_MS),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [badgeDelayMs, index, isOpen, isReducedMotion]);

  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => engineRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [isOpen]);

  // 열리면 버튼에 포커스를 옮기고, 닫히면(언마운트) 원래 포커스로 돌려준다
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    focusButton();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, [focusButton, isOpen]);

  const close = useCallback(() => {
    if (isReducedMotion) onClose();
    else setPhase("closing");
  }, [isReducedMotion, onClose]);

  const goNext = useCallback(() => {
    setIndex((value) => value + 1);
    setPhase("enter");
  }, []);

  const advance = useCallback(() => {
    if (phase !== "enter") return;
    if (isLast) close();
    else if (isReducedMotion) goNext();
    else setPhase("leaving");
  }, [close, goNext, isLast, isReducedMotion, phase]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      // 버튼 하나뿐이라 Tab으로 뒤 시트에 가지 않게 버튼에 묶어 둔다
      if (event.key === "Tab") {
        event.preventDefault();
        focusButton();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, focusButton, isOpen]);

  if (!isOpen || !current) return null;
  const isLeaving = phase === "leaving";

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`새 업적 ${current.name}`}
      className={cx(
        "pk-celebration fixed inset-0",
        phase === "closing" && "animate-pk-fade-out motion-reduce:animate-none",
      )}
      style={{ zIndex: GLOBAL_LAYER.achievementCelebration }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "pk-fade-out") onClose();
      }}
    >
      {/* 배경을 눌러도 버튼과 같다 */}
      <div
        className="pk-celebration-dim absolute inset-0 animate-pk-fade-in motion-reduce:animate-none"
        style={{ animationDuration: ms(280) }}
        onClick={advance}
      />
      <div className="app-shell-width pointer-events-none absolute inset-y-0 right-0 left-0 mx-auto">
        <canvas ref={backCanvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
        <div className="absolute inset-x-0 top-0 bottom-[calc(96px+env(safe-area-inset-bottom))] flex flex-col items-center justify-center gap-[30px]">
          <div className="relative size-[124px]">
            {/* 회전은 바깥, 퍼짐은 안쪽 요소가 맡아 transform이 겹치지 않는다. 장을 넘겨도 회전은 이어진다 */}
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -mt-[260px] -ml-[260px] size-[520px] animate-pk-spin-slow motion-reduce:animate-none"
              style={{ animationDuration: ms(RAYS_SPIN_MS) }}
            >
              <div
                key={index}
                className={cx(
                  "pk-celebration-rays size-full rounded-full motion-reduce:animate-none",
                  isFirst ? "animate-pk-pop" : "animate-pk-rays-pulse",
                )}
                style={isFirst ? { animationDuration: ms(900) } : undefined}
              />
            </div>
            <div key={index} className="absolute inset-0">
              <div
                aria-hidden="true"
                className="pk-celebration-glow absolute top-1/2 left-1/2 -mt-[150px] -ml-[150px] size-[300px] animate-pk-fade-in rounded-full motion-reduce:animate-none"
                style={{ animationDelay: ms(badgeDelayMs), animationDuration: ms(600) }}
              />
              {/* 한 번만 퍼진다. 시작 전에는 보이지 않게 fill-mode를 forwards로 둔다 */}
              <div
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 -mt-[65px] -ml-[65px] size-[130px] animate-pk-ping rounded-full border-3 border-pk-hl opacity-0 motion-reduce:hidden"
                style={{
                  animationDelay: ms(badgeDelayMs + 150),
                  animationDuration: ms(700),
                  animationIterationCount: 1,
                  animationFillMode: "forwards",
                }}
              />
              <div
                ref={badgeRef}
                className={cx(
                  "absolute inset-0 motion-reduce:animate-none",
                  isLeaving ? "animate-pk-slide-away" : "animate-pk-celebrate-pop",
                )}
                style={isLeaving ? undefined : { animationDelay: ms(badgeDelayMs) }}
                onAnimationEnd={(event) => {
                  // 빠지는 도중 Esc로 닫기 시작했으면 다음 장으로 넘기지 않는다
                  if (event.animationName === "pk-slide-away" && phase === "leaving") goNext();
                }}
              >
                <AchievementBadge achievement={current} earned size={BADGE_SIZE} />
              </div>
            </div>
          </div>
          <div
            key={index}
            className={cx(
              "flex flex-col items-center gap-1.5 px-7 text-center motion-reduce:animate-none",
              isLeaving ? "animate-pk-fade-out" : "animate-pk-fade-up",
            )}
            style={
              isLeaving
                ? { animationDuration: ms(180) }
                : { animationDelay: ms(badgeDelayMs + (isFirst ? 370 : 220)), animationDuration: ms(380) }
            }
          >
            <p className="text-pk-13 font-extrabold tracking-[0.06em] text-pk-hl">새 업적</p>
            <p className="text-pk-26 font-extrabold tracking-[-0.02em] text-white">{current.name}</p>
            <p className="text-pk-15 leading-[1.45] text-white/78">{current.condition}</p>
          </div>
          {achievements.length > 1 ? (
            <div aria-hidden="true" className="flex h-1.5 gap-1.5">
              {achievements.map((achievement, dotIndex) => (
                <span
                  key={achievement.id}
                  className={cx(
                    "h-1.5 rounded-full transition-[width,background-color] duration-250 motion-reduce:transition-none",
                    dotIndex === index ? "w-[18px] bg-white" : "w-1.5 bg-white/35",
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
        <canvas ref={frontCanvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
        <div
          ref={actionsRef}
          className="pointer-events-auto absolute inset-x-4 bottom-[calc(30px+env(safe-area-inset-bottom))] animate-pk-fade-in motion-reduce:animate-none"
          style={{ animationDelay: ms(820), animationDuration: ms(260) }}
        >
          <PkButton size="lg" fullWidth onClick={advance}>
            {isLast ? "확인" : "다음"}
          </PkButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
