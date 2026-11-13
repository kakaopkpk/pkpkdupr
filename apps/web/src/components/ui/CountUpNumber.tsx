import React from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { CountUpText } from "./CountUpText";
import { RatingDelta } from "./Delta";

interface CountUpTiming {
  /** 세기 시작 기준(화면이 보이고 마운트된 시점) 뒤 기다리는 시간(ms). 기본 0 */
  delayMs?: number;
  durationMs: number;
}

/** 0부터 value까지 세는 정수. 세는 동안 폭은 최종 값으로 고정한다 */
export const CountUpInteger: React.FC<
  CountUpTiming & { value: number; align?: "start" | "end" }
> = ({ value, delayMs, durationMs, align = "end" }) => {
  const count = useCountUp(value, { delayMs, durationMs });
  return (
    <CountUpText finalContent={value} align={align}>
      {Math.round(count.value)}
    </CountUpText>
  );
};

/** 0.000부터 value까지 세는 평점(소수 셋째 자리) */
export const CountUpRating: React.FC<
  CountUpTiming & { value: number; align?: "start" | "end" }
> = ({ value, delayMs, durationMs, align = "start" }) => {
  const count = useCountUp(value, { delayMs, durationMs });
  return (
    <CountUpText finalContent={value.toFixed(3)} align={align}>
      {count.value.toFixed(3)}
    </CountUpText>
  );
};

/** 0.000부터 value까지 세는 평점 변화량. 부호·색은 처음부터 최종 값을 따른다 */
export const CountUpRatingDelta: React.FC<
  CountUpTiming & { value: number; className?: string }
> = ({ value, delayMs, durationMs, className }) => {
  const count = useCountUp(value, { delayMs, durationMs });
  return (
    <CountUpText
      align="end"
      finalContent={<RatingDelta value={value} className={className} />}
    >
      <RatingDelta value={count.value} signValue={value} className={className} />
    </CountUpText>
  );
};
