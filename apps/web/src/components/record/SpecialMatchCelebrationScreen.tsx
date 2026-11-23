import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMatchTopLevelType } from "@pkpkdupr/shared/match";
import type { SpecialMatchCelebration } from "@pkpkdupr/shared/specialMatch";
import { buttonPressClassName, PkButton } from "@/components/ui/Button";
import { ShareIcon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { useSpecialMatchShare } from "@/hooks/useSpecialMatchShare";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { cycleFocusWithin } from "@/lib/focus";
import {
  getSpecialMatchCaptionParts,
  getSpecialMatchShareTitle,
  type SpecialMatchCaptionPart,
} from "@/lib/specialMatchShare";
import { useDimmedThemeColor } from "@/lib/themeColor";
import type { MatchInfo } from "@/types/match";
import {
  RivalScene,
  ChampionsScene,
  StreakStopperScene,
} from "./SpecialMatchCelebrationScenes";
import {
  getSceneBeatTimes,
  getSceneEndMs,
  toSpecialMatchShareTarget,
} from "./specialMatchCelebration.utils";

// 딤이 깔린 뒤 카드가 튀어나온다
const CARD_DELAY_MS = 150;
// 버튼이 나타나는 시각. 그 전의 탭(시트 버튼을 누르려던 손가락 등)으로 닫히지 않게 이때부터 입력을 받는다
const ACTIONS_DELAY_MS = 820;
// index.css `.pk-celebration-dim`의 딤 투명도와 같다
const DIM_OPACITY = 0.62;

const ms = (value: number) => `${value}ms`;

const CAPTION_HIGHLIGHT_CLASS_NAMES: Record<NonNullable<SpecialMatchCaptionPart["highlight"]>, string> = {
  up: "text-pk-up-on-deep",
  amber: "text-pk-hl",
};

/** 지나간 박자 수. 열린 뒤부터 센다. 움직임 줄이기면 처음부터 다 지난 값이다 */
const useBeatCount = (beatTimes: readonly number[], isRunning: boolean, isReducedMotion: boolean): number => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isRunning || isReducedMotion) return undefined;
    const ids = beatTimes.map((time, index) =>
      window.setTimeout(() => setCount((value) => Math.max(value, index + 1)), time),
    );
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [beatTimes, isReducedMotion, isRunning]);
  return isReducedMotion ? beatTimes.length : count;
};

export interface SpecialMatchCelebrationScreenProps {
  celebration: SpecialMatchCelebration;
  /** 공유 이미지·랭킹 종류에 쓰는 기록한 경기 */
  match: Pick<MatchInfo, "id" | "type" | "completedAt" | "matchStartsAt" | "session">;
  /** 연출을 본(공유하는) 회원 아이디 */
  username: string;
  /** 마운트 후 이만큼 기다렸다가 띄운다 */
  delayMs: number;
  onClose: () => void;
}

/**
 * 특수 매치(라이벌전 승리·연승 저지·최강자전 승리) 큰 연출. 틀은 업적 축하 연출과 같은 어두운 전체 화면이고,
 * 가운데에 40px 흰 제목 → 흰 카드 그림 → 15 흰 설명 한 줄을 둔다(docs/design.md "특수 매치").
 * 확인(또는 배경 누르기·Esc)으로만 닫히고, "이미지로 공유"는 지금 연출을 공유하며 닫지 않는다.
 * 움직임 줄이기면 연출 없이 마지막 장면을 바로 보인다.
 */
export default function SpecialMatchCelebrationScreen({
  celebration,
  match,
  username,
  delayMs,
  onClose,
}: SpecialMatchCelebrationScreenProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isReducedMotion] = useState(prefersReducedMotion);
  const [isAcceptingInput, setIsAcceptingInput] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const beatTimes = useMemo(() => getSceneBeatTimes(celebration), [celebration]);
  const beatCount = useBeatCount(beatTimes, isOpen, isReducedMotion);
  const sceneEndMs = useMemo(() => getSceneEndMs(celebration), [celebration]);
  const shareTarget = useMemo(
    () => toSpecialMatchShareTarget(celebration, match, username),
    [celebration, match, username],
  );
  const captionParts = useMemo(() => getSpecialMatchCaptionParts(shareTarget), [shareTarget]);
  const title = getSpecialMatchShareTitle(shareTarget.kind);
  // 이미지는 버튼이 나타날 때 만들어 등장 연출과 겹치지 않게 한다
  const shareState = useSpecialMatchShare(isAcceptingInput ? shareTarget : null);
  // 도장이 박히는 순간 카드가 흔들린다
  const isShaking = celebration.kind !== "rival" && beatCount >= 2 && !isReducedMotion;
  useDimmedThemeColor(isOpen && !isClosing, DIM_OPACITY);

  useEffect(() => {
    const id = window.setTimeout(() => setIsOpen(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const id = window.setTimeout(() => setIsAcceptingInput(true), isReducedMotion ? 0 : ACTIONS_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [isOpen, isReducedMotion]);

  // 열리면 확인 버튼에 포커스를 옮기고, 닫히면(언마운트) 원래 포커스로 돌려준다
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement;
    confirmRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const close = useCallback(() => {
    if (isReducedMotion) onClose();
    else setIsClosing(true);
  }, [isReducedMotion, onClose]);

  const confirm = useCallback(() => {
    if (isAcceptingInput && !isClosing) close();
  }, [close, isAcceptingInput, isClosing]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      // Tab으로 뒤 시트에 가지 않게 공유·확인 버튼 사이에서만 돈다
      if (event.key === "Tab") {
        event.preventDefault();
        cycleFocusWithin(actionsRef.current, "button:not(:disabled)", event.shiftKey);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={cx("fixed inset-0", isClosing && "animate-pk-fade-out motion-reduce:animate-none")}
      style={{ zIndex: GLOBAL_LAYER.achievementCelebration }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "pk-fade-out") onClose();
      }}
    >
      {/* 배경을 눌러도 확인과 같다 */}
      <div
        className="pk-celebration-dim absolute inset-0 animate-pk-fade-in motion-reduce:animate-none"
        style={{ animationDuration: ms(280) }}
        onClick={confirm}
      />
      <div className="app-shell-width pointer-events-none absolute inset-y-0 right-0 left-0 mx-auto">
        <div className="absolute inset-x-0 top-0 bottom-[calc(96px+env(safe-area-inset-bottom))] flex flex-col items-center justify-center gap-[18px] px-6">
          <h2
            className="animate-pk-fade-up text-center text-[40px] leading-[1.15] font-extrabold tracking-[-0.02em] text-white motion-reduce:animate-none"
            style={{ animationDuration: ms(380) }}
          >
            {title}
          </h2>
          <div
            className="w-full animate-pk-celebrate-pop motion-reduce:animate-none"
            style={{ animationDelay: ms(CARD_DELAY_MS) }}
          >
            <div
              className={cx(
                "w-full rounded-pk-lg bg-white",
                isShaking && "animate-pk-shake motion-reduce:animate-none",
              )}
            >
              {celebration.kind === "rival" ? (
                <RivalScene
                  celebration={celebration}
                  category={getMatchTopLevelType(match.type)}
                  beatCount={beatCount}
                />
              ) : celebration.kind === "streak_stopper" ? (
                <StreakStopperScene celebration={celebration} beatCount={beatCount} />
              ) : (
                <ChampionsScene celebration={celebration} beatCount={beatCount} />
              )}
            </div>
          </div>
          {/* 장면이 끝나면 떠오른다. 아이디만 넘치면 말줄임한다 */}
          <p
            className="flex w-full animate-pk-fade-up justify-center text-pk-15 leading-[22px] font-bold text-white motion-reduce:animate-none"
            style={{ animationDelay: ms(sceneEndMs), animationDuration: ms(380) }}
          >
            {captionParts.map((part, index) => (
              <span
                key={index}
                className={cx(
                  // 조각 끝 띄어쓰기가 flex 안에서 사라지지 않게 그대로 둔다
                  part.fit ? "min-w-0 truncate" : "shrink-0 whitespace-pre",
                  part.highlight && CAPTION_HIGHLIGHT_CLASS_NAMES[part.highlight],
                )}
              >
                {part.text}
              </span>
            ))}
          </p>
        </div>
        <div
          ref={actionsRef}
          className="pointer-events-auto absolute inset-x-4 bottom-[calc(30px+env(safe-area-inset-bottom))] animate-pk-fade-in motion-reduce:animate-none"
          style={{ animationDelay: ms(ACTIONS_DELAY_MS), animationDuration: ms(260) }}
        >
          <div className="flex flex-col items-center gap-2">
            {shareState.isAvailable ? (
              <button
                type="button"
                disabled={!shareState.canShare}
                onClick={() => {
                  if (isAcceptingInput) shareState.share();
                }}
                className={cx(
                  "inline-flex h-11 items-center gap-1.5 px-4 text-pk-15 font-bold text-white/78 disabled:text-white/40",
                  buttonPressClassName,
                )}
              >
                <ShareIcon />
                이미지로 공유
              </button>
            ) : null}
            <PkButton ref={confirmRef} size="lg" fullWidth onClick={confirm}>
              확인
            </PkButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
