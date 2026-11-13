import React from "react";
import { formatRatingDelta } from "@/lib/format";
import { cx } from "./cx";

const getDeltaColorClassName = (value: number | null) => {
  if (value === null || value === 0) return "text-pk-muted";
  return value > 0 ? "text-pk-up" : "text-pk-down";
};

const roundDelta = (value: number | null) =>
  value === null ? null : Math.round(value * 1000) / 1000;

/** 부호는 signValue를 따르고 크기는 value를 쓴다(카운트업 중 0.000에도 최종 부호를 붙인다) */
const formatSignedMagnitude = (value: number, signValue: number | null) => {
  const absolute = Math.abs(value).toFixed(3);
  if (signValue !== null && signValue > 0) return `+${absolute}`;
  if (signValue !== null && signValue < 0) return `−${absolute}`;
  return absolute;
};

/**
 * 평점 변화량. 상승 초록, 하락 빨강, 0·null 회색.
 * signValue를 주면 부호·색은 signValue로 정하고 숫자 크기만 value를 보인다(세는 중인 값 표시용)
 */
export const RatingDelta: React.FC<{
  value: number | null;
  signValue?: number | null;
  className?: string;
}> = ({ value, signValue, className }) => {
  // 소수 셋째 자리에서 0이 되는 값은 보합으로 본다
  const rounded = roundDelta(value);
  const roundedSign = signValue === undefined ? rounded : roundDelta(signValue);
  let label = "–";
  if (rounded !== null) {
    label =
      signValue === undefined
        ? formatRatingDelta(rounded)
        : formatSignedMagnitude(rounded, roundedSign);
  }
  return (
    <span
      className={cx(
        "text-pk-15 font-extrabold tabular-nums",
        getDeltaColorClassName(roundedSign),
        className,
      )}
    >
      {label}
    </span>
  );
};

/** 순위 변화. 양수 ▲n 초록, 음수 ▼n 빨강, 0·null "–" 회색 */
export const RankChange: React.FC<{
  value: number | null;
  className?: string;
}> = ({ value, className }) => {
  const label =
    value === null || value === 0
      ? "–"
      : value > 0
        ? `▲${value}`
        : `▼${Math.abs(value)}`;

  return (
    <span
      className={cx(
        "text-pk-12 font-bold tabular-nums",
        getDeltaColorClassName(value),
        className,
      )}
    >
      {label}
    </span>
  );
};
