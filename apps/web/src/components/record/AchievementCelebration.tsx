import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AchievementDefinition } from "@pkpkdupr/shared/achievements";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { PkButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { createConfettiEngine, type ConfettiEngine } from "./confettiEngine";

const BADGE_SIZE = 124;
const CONFETTI_COLOR_COUNT = 6;
const MOVE_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const RING_EASING = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const RAYS_SPIN_MS = 22000;
const LEAVE_MS = 220;

const FADE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
// 크게 튀어나왔다가 살짝 줄어든 뒤 자리 잡는다
const BADGE_POP: Keyframe[] = [
  { transform: "scale(0.2)", opacity: 0 },
  { transform: "scale(1.18)", opacity: 1, offset: 0.55 },
  { transform: "scale(0.96)", offset: 0.8 },
  { transform: "scale(1)", opacity: 1 },
];
const TEXT_UP: Keyframe[] = [
  { transform: "translateY(14px)", opacity: 0 },
  { transform: "none", opacity: 1 },
];
const RING_SPREAD: Keyframe[] = [
  { transform: "scale(0.6)", opacity: 0.95 },
  { transform: "scale(2.6)", opacity: 0 },
];

export interface AchievementCelebrationProps {
  /** 띄울 업적. 한 장씩 넘긴다 */
  achievements: readonly AchievementDefinition[];
  /** 마운트 후 이만큼 기다렸다가 띄운다. 움직임 줄이기면 기다리지 않는다(앞선 세기 연출이 없다) */
  delayMs: number;
  onClose: () => void;
}

/**
 * 새 업적을 받았을 때 화면 전체를 어둡게 덮고 배지를 띄우는 축하 연출.
 * 첫 장은 딤·빛줄기부터, 다음 장부터는 배지·색종이·폭죽·고리만 처음부터 다시 재생한다.
 * 확인(또는 배경 누르기)으로만 닫힌다.
 */
export default function AchievementCelebration({
  achievements,
  delayMs,
  onClose,
}: AchievementCelebrationProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [isReducedMotion] = useState(prefersReducedMotion);
  const rootRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const raysRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ConfettiEngine | null>(null);
  const animationsRef = useRef<Animation[]>([]);
  const spinRef = useRef<Animation | null>(null);
  const timersRef = useRef<number[]>([]);
  // 다음 장으로 빠지는 중이거나 닫히는 중이면 입력을 무시한다
  const isLeavingRef = useRef(false);

  const animate = useCallback(
    (
      element: Element | null,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ): Animation | null => {
      if (!element || typeof element.animate !== "function") return null;
      const animation = element.animate(keyframes, {
        fill: "both",
        easing: MOVE_EASING,
        ...options,
      });
      animationsRef.current.push(animation);
      return animation;
    },
    [],
  );

  const stopAll = useCallback(() => {
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current = [];
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setIsOpen(true), isReducedMotion ? 0 : delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, isReducedMotion]);

  useEffect(
    () => () => {
      stopAll();
      spinRef.current?.cancel();
    },
    [stopAll],
  );

  // 색종이 엔진. 아래 연출 effect보다 먼저 선언해 같은 커밋에서 먼저 만들어진다
  useLayoutEffect(() => {
    const root = rootRef.current;
    const back = backCanvasRef.current;
    const front = frontCanvasRef.current;
    if (!isOpen || isReducedMotion || !root || !back || !front) return;
    const style = getComputedStyle(root);
    const colors = Array.from({ length: CONFETTI_COLOR_COUNT }, (_, i) =>
      style.getPropertyValue(`--pk-confetti-${i + 1}`).trim(),
    ).filter(Boolean);
    const engine = createConfettiEngine(back, front, colors);
    engineRef.current = engine;
    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      engine.destroy();
      engineRef.current = null;
    };
  }, [isOpen, isReducedMotion]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    stopAll();
    const isFirst = index === 0;

    if (isReducedMotion) {
      // 움직임 없이 서서히 나타나기만 한다
      const fade = { duration: 200 };
      if (isFirst) {
        animate(dimRef.current, FADE_IN, fade);
        animate(raysRef.current, FADE_IN, fade);
        animate(actionsRef.current, FADE_IN, fade);
      }
      animate(glowRef.current, FADE_IN, fade);
      animate(badgeRef.current, FADE_IN, fade);
      animate(textRef.current, FADE_IN, fade);
      return;
    }

    const base = isFirst ? 150 : 0;
    if (isFirst) {
      animate(dimRef.current, FADE_IN, { duration: 280 });
      animate(actionsRef.current, FADE_IN, { duration: 260, delay: 820 });
      animate(
        raysRef.current,
        [
          { opacity: 0, transform: "scale(0.6)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 900 },
      );
      // 회전은 transform과 따로 도는 rotate 속성이라 퍼짐과 겹쳐도 된다. 장을 넘겨도 멈추지 않는다
      spinRef.current?.cancel();
      spinRef.current =
        raysRef.current?.animate([{ rotate: "0deg" }, { rotate: "360deg" }], {
          duration: RAYS_SPIN_MS,
          iterations: Infinity,
        }) ?? null;
    } else {
      animate(
        raysRef.current,
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 1, transform: "scale(1.28)", offset: 0.3 },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 800 },
      );
    }
    animate(badgeRef.current, BADGE_POP, { duration: 560, delay: base, easing: "linear" });
    animate(
      glowRef.current,
      [
        { opacity: 0, transform: "scale(0.5)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 600, delay: base },
    );
    animate(ringRef.current, RING_SPREAD, {
      duration: 700,
      delay: base + 150,
      easing: RING_EASING,
      fill: "forwards",
    });
    animate(textRef.current, TEXT_UP, { duration: 380, delay: base + (isFirst ? 370 : 220) });

    const engine = engineRef.current;
    const badge = badgeRef.current;
    const canvas = backCanvasRef.current;
    if (engine && badge && canvas) {
      const canvasRect = canvas.getBoundingClientRect();
      const badgeRect = badge.getBoundingClientRect();
      const centerX = badgeRect.left - canvasRect.left + badgeRect.width / 2;
      const centerY = badgeRect.top - canvasRect.top + badgeRect.height / 2;
      timersRef.current.push(
        window.setTimeout(() => engine.burst(centerX, centerY, 80, 380, 920), base + 80),
        // 아래 양쪽 모서리에서 안쪽 위로 쏘아 올린다
        window.setTimeout(() => {
          engine.popper(6, engine.height - 40, 1, 38);
          engine.popper(engine.width - 6, engine.height - 40, -1, 38);
        }, base + 230),
      );
    }
  }, [isOpen, index, isReducedMotion, animate, stopAll]);

  // 열리면 버튼에 포커스를 옮기고, 닫히면(언마운트) 원래 포커스로 돌려준다
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    actionsRef.current?.querySelector("button")?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const close = useCallback(() => {
    isLeavingRef.current = true;
    const root = rootRef.current;
    if (!root || typeof root.animate !== "function") {
      onClose();
      return;
    }
    root
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: isReducedMotion ? 1 : LEAVE_MS,
        easing: "ease-out",
        fill: "forwards",
      })
      .finished.then(onClose, () => undefined);
  }, [isReducedMotion, onClose]);

  const advance = useCallback(() => {
    if (isLeavingRef.current) return;
    if (index >= achievements.length - 1) {
      close();
      return;
    }
    isLeavingRef.current = true;
    const duration = isReducedMotion ? 1 : LEAVE_MS;
    const out = animate(
      badgeRef.current,
      [
        { transform: "none", opacity: 1 },
        { transform: "translateX(-90px) scale(0.7)", opacity: 0 },
      ],
      { duration, fill: "forwards" },
    );
    animate(textRef.current, [{ opacity: 1 }, { opacity: 0 }], {
      duration: Math.min(duration, 180),
      fill: "forwards",
    });
    const goNext = () => {
      isLeavingRef.current = false;
      setIndex((current) => current + 1);
    };
    if (out) out.finished.then(goNext, () => undefined);
    else goNext();
  }, [achievements.length, animate, close, index, isReducedMotion]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      // 버튼 하나뿐이라 Tab으로 뒤 시트에 가지 않게 버튼에 묶어 둔다
      if (event.key === "Tab") {
        event.preventDefault();
        actionsRef.current?.querySelector("button")?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isOpen]);

  const current = achievements[index];
  if (!isOpen || !current) return null;
  const isLast = index === achievements.length - 1;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`새 업적 ${current.name}`}
      className="pk-celebration fixed inset-0"
      style={{ zIndex: GLOBAL_LAYER.achievementCelebration }}
    >
      {/* 배경을 눌러도 버튼과 같다 */}
      <div ref={dimRef} className="pk-celebration-dim absolute inset-0" onClick={advance} />
      <div className="app-shell-width pointer-events-none absolute inset-y-0 right-0 left-0 mx-auto">
        <canvas ref={backCanvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
        <div className="absolute inset-x-0 top-0 bottom-[calc(96px+env(safe-area-inset-bottom))] flex flex-col items-center justify-center gap-[30px]">
          <div className="relative size-[124px]">
            <div
              ref={raysRef}
              aria-hidden="true"
              className="pk-celebration-rays absolute top-1/2 left-1/2 -mt-[260px] -ml-[260px] size-[520px] rounded-full"
            />
            <div
              ref={glowRef}
              aria-hidden="true"
              className="pk-celebration-glow absolute top-1/2 left-1/2 -mt-[150px] -ml-[150px] size-[300px] rounded-full"
            />
            <div
              ref={ringRef}
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -mt-[65px] -ml-[65px] size-[130px] rounded-full border-3 border-pk-hl opacity-0"
            />
            <div ref={badgeRef} className="absolute inset-0">
              <AchievementBadge key={current.id} achievement={current} earned size={BADGE_SIZE} />
            </div>
          </div>
          <div ref={textRef} className="flex flex-col items-center gap-1.5 px-7 text-center">
            <p className="text-pk-13 font-extrabold tracking-[0.06em] text-pk-hl">새 업적</p>
            <p className="text-pk-26 font-extrabold tracking-[-0.02em] text-white">
              {current.name}
            </p>
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
          className="pointer-events-auto absolute inset-x-4 bottom-[calc(30px+env(safe-area-inset-bottom))]"
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
