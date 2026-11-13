import React from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { usePlayOnShow } from "@/hooks/usePlayOnShow";
import { CountUpText } from "./CountUpText";
import { RatingDelta } from "./Delta";
import { cx } from "./cx";

interface CountUpTiming {
  /** 세기 시작 기준(화면이 보이고 마운트된 시점) 뒤 기다리는 시간(ms). 기본 0 */
  delayMs?: number;
  durationMs: number;
}

/**
 * 앱 전체 숫자 카운트업 박자(ms). 화면이 보이고 250ms 뒤 600ms 동안 센다.
 * 평점 차트 선 그리기도 이 박자를 따른다
 */
export const COUNT_UP = { delayMs: 250, durationMs: 600 } as const;

/** 두 박자 화면(점수 → 평점)의 둘째 박자. 첫 박자가 끝나는 순간 시작한다 */
export const COUNT_UP_SECOND = {
  delayMs: COUNT_UP.delayMs + COUNT_UP.durationMs,
  durationMs: COUNT_UP.durationMs,
} as const;

/** 목록 줄마다 세기 시작을 늦추는 시간(ms) */
const COUNT_UP_ROW_STAGGER_MS = 40;

// 이 줄 수 뒤로는 더 늦추지 않는다. 긴 목록 아래쪽이 오래 0으로 남지 않게 한다
const COUNT_UP_ROW_STAGGER_MAX_ROWS = 10;

/** 목록 index번째 줄의 카운트업 박자 */
export const getRowCountUp = (index: number) =>
  ({
    delayMs:
      COUNT_UP.delayMs +
      Math.min(index, COUNT_UP_ROW_STAGGER_MAX_ROWS) * COUNT_UP_ROW_STAGGER_MS,
    durationMs: COUNT_UP.durationMs,
  }) as const;

/** 카운트업이 끝나는 시각(ms). 순위 변동처럼 다 센 뒤 튀어나오는 표시의 지연으로 쓴다 */
export const getCountUpEndMs = (timing: CountUpTiming) =>
  (timing.delayMs ?? 0) + timing.durationMs;

const formatInteger = (value: number) => String(Math.round(value));

/** from(기본 0)부터 value까지 세는 숫자. 기본은 정수이고, 세는 동안 폭은 최종 값으로 고정한다 */
export const CountUpNumber: React.FC<
  CountUpTiming & {
    value: number;
    from?: number;
    format?: (value: number) => string;
  }
> = ({ value, from, format = formatInteger, delayMs, durationMs }) => {
  const count = useCountUp(value, { from, delayMs, durationMs });
  return (
    <CountUpText finalContent={format(value)}>{format(count.value)}</CountUpText>
  );
};

/** 0.000부터 value까지 세는 평점 변화량. 부호·색은 처음부터 최종 값을 따른다 */
export const CountUpRatingDelta: React.FC<
  CountUpTiming & { value: number; className?: string }
> = ({ value, delayMs, durationMs, className }) => {
  const count = useCountUp(value, { delayMs, durationMs });
  return (
    <CountUpText
      finalContent={<RatingDelta value={value} className={className} />}
    >
      <RatingDelta value={count.value} signValue={value} className={className} />
    </CountUpText>
  );
};

/**
 * 화면이 보일 때마다 delayMs 뒤에 한 번 튀어나오는 표시(순위 변동 ▲▼ 등).
 * 기다리는 동안은 보이지 않고 자리만 차지한다. 움직임 줄이기면 처음부터 보인다
 */
export const CountUpPop: React.FC<{
  delayMs: number;
  children: React.ReactNode;
}> = ({ delayMs, children }) => {
  const { isPlaying, finish } = usePlayOnShow();
  return (
    <span
      className={cx(
        "inline-flex",
        isPlaying && "animate-pk-pop motion-reduce:animate-none",
      )}
      style={isPlaying ? { animationDelay: `${delayMs}ms` } : undefined}
      onAnimationEnd={finish}
    >
      {children}
    </span>
  );
};
