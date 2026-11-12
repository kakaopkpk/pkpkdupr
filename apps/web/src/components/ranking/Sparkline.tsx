import React from "react";

export type SparklineTrend = "up" | "down" | "flat";

/** 끝 값과 첫 값의 차이가 이 값 미만이면 보합으로 본다 */
const FLAT_THRESHOLD = 0.005;

const TREND_COLORS: Record<SparklineTrend, string> = {
  up: "#0a7a52",
  down: "#c2253d",
  flat: "#b4bccb",
};

export const getSparklineTrend = (values: readonly number[]): SparklineTrend => {
  if (values.length < 2) return "flat";
  const diff = values[values.length - 1] - values[0];
  if (Math.abs(diff) < FLAT_THRESHOLD) return "flat";
  return diff > 0 ? "up" : "down";
};

export const SPARKLINE_TREND_LABELS: Record<SparklineTrend, string> = {
  up: "상승",
  down: "하락",
  flat: "보합",
};

/** 평점 추이 선. 값이 클수록 위에 그리고, 끝점에 같은 색 점을 찍는다 */
export const Sparkline: React.FC<{
  values: readonly number[];
  width?: number;
  height?: number;
  ariaLabel: string;
}> = ({ values, width = 72, height = 24, ariaLabel }) => {
  if (values.length < 2) return null;

  const color = TREND_COLORS[getSparklineTrend(values)];
  // 끝점 원(r 2.6)이 잘리지 않도록 가장자리에 여백을 둔다
  const padding = 3;
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  const step = (width - padding * 2) / (values.length - 1);
  const toY = (value: number) =>
    range === 0
      ? height / 2
      : padding + (1 - (value - min) / range) * (height - padding * 2);

  const points = values.map((value, index) => [
    padding + index * step,
    toY(value),
  ]);
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="shrink-0"
    >
      <polyline
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={2.6} fill={color} />
    </svg>
  );
};
