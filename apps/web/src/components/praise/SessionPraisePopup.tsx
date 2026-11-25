import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  SessionPraiseCandidate,
  SessionPraiseResponse,
} from "@pkpkdupr/shared/sessionPraise";
import PickleballIllustration from "@/components/session/PickleballIllustration";
import { getErrorMessage } from "@/components/session/saveError";
import { rowPressClassName } from "@/components/ui/Button";
import { CountUpText } from "@/components/ui/CountUpText";
import { CheckIcon, ThumbUpIcon } from "@/components/ui/Icons";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SheenOverlay } from "@/components/ui/SheenOverlay";
import { cx } from "@/components/ui/cx";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { useDataVersion, useInvalidateData } from "@/context/DataSyncContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useCountUp } from "@/hooks/useCountUp";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { isNetworkError } from "@/lib/errors";
import { cycleFocusWithin } from "@/lib/focus";
import {
  fetchSessionPraise,
  getSessionPraiseCardValue,
  praiseSessionPlayer,
} from "@/lib/sessionPraise";
import { useDimmedThemeColor } from "@/lib/themeColor";
import { SessionPraiseCategoryChip } from "./SessionPraiseParts";

const DEPTH_ID = "session-praise-popup";
// index.css `.pk-celebration-dim`의 딤 투명도와 같다
const DIM_OPACITY = 0.62;
// 다른 회원이 칭찬하면 sessions가 무효화된다(서버 변경 신호)
const LIVE_COUNT_DATA_KINDS = ["sessions"] as const;
// 칭찬이 저장된 뒤 화면 전체가 사라지기 시작하는 시각(탭 후 약 3초)
const AUTO_CLOSE_MS = 2800;
const CLOSE_FADE_MS = 420;
const RAYS_SPIN_MS = 22000;
const ENABLED_CARD_SELECTOR = "button:not(:disabled)";

const ms = (value: number) => `${value}ms`;

type Phase = "idle" | "submitting" | "praised";

/**
 * 카드 상태.
 * - idle: 누를 수 있음
 * - pressing: 고른 카드, 저장 중(눌린 채 기다림)
 * - waiting: 다른 카드를 저장하는 중(누를 수 없음)
 * - picked: 고른 카드, 칭찬 직후 연출(1.1배·앰버 링·빛줄기·흰 빛)
 * - dimmed: 고르지 않은 카드(어두워지고 버튼 비활성)
 */
type CardMode = "idle" | "pressing" | "waiting" | "picked" | "dimmed";

const CARD_MODE_CLASS_NAME: Record<CardMode, string> = {
  idle: rowPressClassName,
  pressing: "scale-95 transition-[scale] duration-[120ms] ease-pk-move",
  waiting: "",
  picked:
    "scale-110 shadow-[0_0_0_2px_var(--color-pk-hl),0_14px_32px_color-mix(in_srgb,var(--color-pk-ink)_40%,transparent)] transition-[scale,box-shadow] duration-[480ms] ease-pk-pop",
  dimmed: "brightness-50 saturate-[.6] transition-[filter] duration-300 ease-pk-move",
};

/** 고른 카드의 칭찬 수: 저장 전 수에서 저장 뒤 수로 센다 */
const PraiseCountUp: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const { value } = useCountUp(to, { from, durationMs: 500, delayMs: 300 });
  return (
    <CountUpText finalContent={to} align="center">
      {Math.round(value)}
    </CountUpText>
  );
};

/** 카드 아래 흰 버튼(높이 44): 엄지 + 받은 칭찬 수. 고른 카드는 체크 + 카운트업, 나머지는 칭찬 뒤 비활성 */
const PraiseCardButton: React.FC<{
  mode: CardMode;
  count: number;
  countFrom: number;
}> = ({ mode, count, countFrom }) => (
  <span
    className={cx(
      "relative mt-auto inline-flex h-11 w-full items-center justify-center gap-1 rounded-pk-sm text-pk-15 font-extrabold tabular-nums",
      mode === "dimmed" ? "bg-white/14 text-white/60" : "bg-white text-pk-primary",
    )}
  >
    {mode === "picked" ? (
      <>
        <CheckIcon size={14} draw />
        <PraiseCountUp from={countFrom} to={count} />
      </>
    ) : (
      <>
        <ThumbUpIcon size={16} />
        {count}
      </>
    )}
  </span>
);

/** 후보 카드: 블루 세션 카드 언어. 위에서부터 분류 칩 → 아바타 64 → 아이디 → 큰 값·설명 줄 → 흰 버튼. 카드 전체가 버튼이다 */
const PraiseCard: React.FC<{
  candidate: SessionPraiseCandidate;
  mode: CardMode;
  count: number;
  countFrom: number;
  onPress: () => void;
}> = ({ candidate, mode, count, countFrom, onPress }) => {
  const isPicked = mode === "picked";
  const cardValue = getSessionPraiseCardValue(candidate);
  return (
    // 고른 카드 묶음(빛줄기 포함)을 양옆 카드보다 위에 둬 빛줄기가 두 카드 위로 지나가게 한다
    <div className={cx("relative min-w-0", isPicked && "z-[3]")}>
      {isPicked ? (
        <>
          <div
            aria-hidden="true"
            className="pk-celebration-glow pointer-events-none absolute top-1/2 left-1/2 -mt-40 -ml-40 size-80 animate-pk-fade-in rounded-full motion-reduce:animate-none"
            style={{ animationDuration: ms(600) }}
          />
          {/* 회전은 바깥, 퍼짐은 안쪽 요소가 맡아 transform이 겹치지 않는다 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 -mt-[260px] -ml-[260px] size-[520px] animate-pk-spin-slow motion-reduce:animate-none"
            style={{ animationDuration: ms(RAYS_SPIN_MS) }}
          >
            <div
              className="pk-celebration-rays size-full animate-pk-pop rounded-full motion-reduce:animate-none"
              style={{ animationDuration: ms(900) }}
            />
          </div>
        </>
      ) : null}
      <button
        type="button"
        disabled={mode !== "idle"}
        aria-label={`${candidate.player.username} 칭찬, 지금 ${count}개`}
        onClick={onPress}
        className={cx(
          "relative flex h-[276px] w-full min-w-0 flex-col items-center gap-1.5 overflow-hidden rounded-pk-lg bg-pk-primary px-2 pt-4 pb-2.5 text-white disabled:cursor-default motion-reduce:transition-none max-[374px]:px-1.5",
          CARD_MODE_CLASS_NAME[mode],
        )}
      >
        <PickleballIllustration className="pointer-events-none absolute -top-[58px] -right-[66px] size-[140px]" />
        <SessionPraiseCategoryChip
          category={candidate.category}
          size="md"
          hideIconWhenNarrow
          className="relative"
        />
        <span className="relative mt-3.5 inline-flex rounded-full shadow-[0_0_0_2px_var(--color-white)]">
          <PlayerAvatar player={candidate.player} size={64} />
        </span>
        <span className="relative mt-2 max-w-full truncate text-pk-15 font-extrabold max-[374px]:text-pk-13">
          {candidate.player.username}
        </span>
        <span className="relative mt-1 flex flex-col items-center gap-1">
          <span className="text-pk-26 leading-none font-extrabold whitespace-nowrap tabular-nums max-[374px]:text-pk-22">
            {cardValue.main}
          </span>
          <span className="text-pk-13 leading-none font-bold whitespace-nowrap text-white/75">
            {cardValue.caption}
          </span>
        </span>
        <PraiseCardButton mode={mode} count={count} countFrom={countFrom} />
        {isPicked ? <SheenOverlay delayMs={250} durationMs={800} /> : null}
      </button>
    </div>
  );
};

export interface SessionPraisePopupProps {
  praise: SessionPraiseResponse;
  /** 뒤로가기로 닫히도록 깊이를 쌓을 탭(띄울 때 보던 탭) */
  tabKey: TabKey;
  /** 칭찬하지 않고 닫았을 때(바깥 어두운 곳·뒤로가기·Esc) */
  onSkip: () => void;
  /** 사라지는 움직임까지 끝났을 때 */
  onExited: () => void;
}

/**
 * 세션이 끝난 뒤 칭찬 후보 카드를 띄우는 전체 화면 팝업. 닫기·확인 버튼이 없고
 * 바깥 어두운 곳·뒤로가기·Esc로 넘긴다. 카드를 누르면 칭찬을 저장하고 고른 카드 연출을 보인 뒤
 * 약 3초에 서서히 사라진다. 움직임 줄이기면 연출 없이 최종 상태를 보이고 같은 시각에 닫힌다
 */
export default function SessionPraisePopup({
  praise,
  tabKey,
  onSkip,
  onExited,
}: SessionPraisePopupProps): React.ReactElement {
  const { closeDepth } = useTabNavigation();
  const invalidateData = useInvalidateData();
  const { showSaveFailure } = useSystemNotice();
  const [isReducedMotion] = useState(prefersReducedMotion);
  const [isDepthRequested, setIsDepthRequested] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pickedPlayerId, setPickedPlayerId] = useState<string | null>(null);
  const [result, setResult] = useState<SessionPraiseResponse | null>(null);
  // 고르기 전 실시간 칭찬 수: 다른 회원이 칭찬해 세션 데이터 버전이 오르면 다시 읽는다
  const [latest, setLatest] = useState(praise);
  const sessionsVersion = useDataVersion(LIVE_COUNT_DATA_KINDS);
  const [error, setError] = useState<string | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>(phase);
  const isClosedRef = useRef(false);
  const callbacksRef = useRef({ onSkip, onExited });
  callbacksRef.current = { onSkip, onExited };

  useDimmedThemeColor(!isClosing, DIM_OPACITY);

  const changePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // 깊이가 닫혔다(뒤로가기·바깥 누르기·자동 닫힘). 여러 번 불려도 한 번만 처리한다
  const handleDepthClose = useCallback(() => {
    if (isClosedRef.current) return;
    isClosedRef.current = true;
    setIsDepthRequested(false);
    // 저장 중에 닫으면 결과를 모르므로 넘김으로 기록하지 않는다(실패했으면 다음에 다시 뜬다)
    if (phaseRef.current === "idle") callbacksRef.current.onSkip();
    if (isReducedMotion) callbacksRef.current.onExited();
    else setIsClosing(true);
  }, [isReducedMotion]);

  useLayerDepth({
    isOpen: isDepthRequested,
    tabKey,
    depthId: DEPTH_ID,
    kind: "dialog",
    onClose: handleDepthClose,
  });

  const requestClose = useCallback(() => {
    if (!closeDepth(tabKey, DEPTH_ID)) handleDepthClose();
  }, [closeDepth, handleDepthClose, tabKey]);

  const showPraised = useCallback(
    (targetPlayerId: string, next: SessionPraiseResponse) => {
      // 칭찬 수·칭찬 업적이 바뀐다(서버 변경 신호와 같은 종류)
      invalidateData(["sessions", "achievements"]);
      if (isClosedRef.current) return;
      setPickedPlayerId(targetPlayerId);
      setResult(next);
      changePhase("praised");
    },
    [changePhase, invalidateData],
  );

  const submit = async (targetPlayerId: string) => {
    if (phaseRef.current !== "idle" || isClosedRef.current) return;
    changePhase("submitting");
    setPickedPlayerId(targetPlayerId);
    setError(null);
    try {
      showPraised(
        targetPlayerId,
        await praiseSessionPlayer(praise.session.id, targetPlayerId),
      );
    } catch (err) {
      changePhase("idle");
      setPickedPlayerId(null);
      if (isNetworkError(err)) {
        showSaveFailure({
          onRetry: async () => {
            const next = await praiseSessionPlayer(praise.session.id, targetPlayerId);
            if (phaseRef.current === "idle") showPraised(targetPlayerId, next);
            else invalidateData(["sessions", "achievements"]);
          },
        });
      } else {
        setError(getErrorMessage(err, "칭찬하지 못했어요."));
      }
    }
  };

  useEffect(() => {
    if (phase !== "praised") return;
    const id = window.setTimeout(requestClose, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [phase, requestClose]);

  // 열리면 대화상자에 포커스를 옮기고(카드에 포커스 테두리가 먼저 보이지 않게), 닫히면(언마운트) 원래 포커스로 돌려준다
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phaseRef.current !== "submitting") requestClose();
      // Tab으로 뒤 화면에 가지 않게 카드 사이에서만 돈다
      if (event.key === "Tab") {
        event.preventDefault();
        cycleFocusWithin(cardsRef.current, ENABLED_CARD_SELECTOR, event.shiftKey);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  // 띄울 때 받은 칭찬은 방금 조회한 것이므로, 버전이 오른 뒤부터 다시 읽는다
  const initialSessionsVersionRef = useRef(sessionsVersion);
  useEffect(() => {
    if (
      sessionsVersion === initialSessionsVersionRef.current ||
      phaseRef.current !== "idle"
    ) {
      return;
    }
    let isCancelled = false;
    fetchSessionPraise(praise.session.id)
      .then((next) => {
        if (!isCancelled && phaseRef.current === "idle") setLatest(next);
      })
      // 실패하면 보던 수를 그대로 둔다
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [praise.session.id, sessionsVersion]);

  const shown = result ?? latest;
  const getMode = (playerId: string): CardMode => {
    if (phase === "idle") return "idle";
    const isPicked = playerId === pickedPlayerId;
    if (phase === "submitting") return isPicked ? "pressing" : "waiting";
    return isPicked ? "picked" : "dimmed";
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${praise.session.name} 칭찬`}
      tabIndex={-1}
      className={cx(
        "fixed inset-0 outline-none",
        isClosing && "animate-pk-fade-out motion-reduce:animate-none",
      )}
      style={{
        zIndex: GLOBAL_LAYER.sessionPraise,
        animationDuration: isClosing ? ms(CLOSE_FADE_MS) : undefined,
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "pk-fade-out") {
          callbacksRef.current.onExited();
        }
      }}
    >
      {/* 바깥 어두운 곳을 누르면 칭찬하지 않고 넘긴다 */}
      <div
        className="pk-celebration-dim absolute inset-0 animate-pk-fade-in motion-reduce:animate-none"
        style={{ animationDuration: ms(280) }}
        onClick={() => {
          if (phaseRef.current !== "submitting") requestClose();
        }}
      />
      <div className="app-shell-width pointer-events-none absolute inset-y-0 right-0 left-0 mx-auto">
        <div className="absolute inset-x-0 top-0 bottom-[calc(96px+env(safe-area-inset-bottom))] flex flex-col items-center justify-center gap-7 px-4">
          <div
            className="flex flex-col items-center gap-1.5 text-center animate-pk-fade-up motion-reduce:animate-none"
            style={{ animationDelay: ms(80), animationDuration: ms(380) }}
          >
            <p className="text-pk-13 font-extrabold tracking-[0.06em] text-pk-hl">세션 종료</p>
            <p className="text-pk-26 font-extrabold tracking-[-0.02em] text-white">
              {praise.session.name}
            </p>
          </div>
          <div
            ref={cardsRef}
            className="pointer-events-auto grid w-full justify-center gap-[var(--praise-card-gap)] animate-pk-fade-up [--praise-card-gap:8px] [--praise-card-width:calc((100%-2*var(--praise-card-gap))/3)] motion-reduce:animate-none max-[374px]:[--praise-card-gap:6px]"
            style={{
              // 카드 폭은 후보 수와 상관없이 3장일 때 폭이다
              gridTemplateColumns: `repeat(${shown.candidates.length}, var(--praise-card-width))`,
              // 2장이면 화면 양 끝과 카드 사이 간격을 같게 둔다(바깥 여백 px-4 양쪽 32px 포함)
              ...(shown.candidates.length === 2
                ? { columnGap: "calc((100% + 32px - 2 * var(--praise-card-width)) / 3)" }
                : {}),
              animationDelay: ms(160),
              animationDuration: ms(380),
            }}
          >
            {shown.candidates.map((candidate) => (
              <PraiseCard
                key={candidate.player.id}
                candidate={candidate}
                mode={getMode(candidate.player.id)}
                count={candidate.praiseCount}
                countFrom={
                  latest.candidates.find(
                    (before) => before.player.id === candidate.player.id,
                  )?.praiseCount ?? candidate.praiseCount
                }
                onPress={() => void submit(candidate.player.id)}
              />
            ))}
          </div>
          {error ? (
            <p role="alert" className="text-center text-pk-13 font-medium text-pk-down-on-deep">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
