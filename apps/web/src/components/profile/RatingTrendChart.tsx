import React from "react";

export interface RatingTrendPoint {
  rating: number;
  createdAt: Date | string;
}

const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const WIDTH = 326;
const HEIGHT = 120;
const PLOT_LEFT = 30;
const PLOT_RIGHT = 318;
const GRID_YS = [14, 54, 94] as const;
const PLOT_TOP = GRID_YS[0];
const PLOT_BOTTOM = GRID_YS[GRID_YS.length - 1];
const AREA_BOTTOM = 104;
// 변동이 아주 작아도 선이 위아래 끝까지 튀지 않게 하는 최소 세로 범위
const MIN_RATING_SPAN = 0.1;

const kstMonthDayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

/**
 * 최근 90일 평점 영역 차트. 블루 선·8% 영역·가로 격자 3줄·끝점 블루 점.
 * x축은 90일 전부터 지금까지의 시간 비례이고 y 라벨은 없다.
 */
const RatingTrendChart: React.FC<{
  points: readonly RatingTrendPoint[];
  ariaLabel: string;
  now?: Date;
}> = ({ points, ariaLabel, now = new Date() }) => {
  const endMs = now.getTime();
  const startMs = endMs - WINDOW_DAYS * DAY_MS;
  const samples = points
    .map((point) => ({
      rating: point.rating,
      timeMs: new Date(point.createdAt).getTime(),
    }))
    .filter(
      (point) => Number.isFinite(point.rating) && Number.isFinite(point.timeMs),
    )
    .sort((left, right) => left.timeMs - right.timeMs);

  const ratings = samples.map((point) => point.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const span = Math.max(maxRating - minRating, MIN_RATING_SPAN);
  const middle = (minRating + maxRating) / 2;
  const lowRating = middle - span / 2;

  const toX = (timeMs: number) => {
    const ratio = (Math.min(Math.max(timeMs, startMs), endMs) - startMs) /
      (endMs - startMs);
    return PLOT_LEFT + ratio * (PLOT_RIGHT - PLOT_LEFT);
  };
  const toY = (rating: number) =>
    PLOT_BOTTOM - ((rating - lowRating) / span) * (PLOT_BOTTOM - PLOT_TOP);

  // 점이 하나뿐이면 오늘까지 같은 평점으로 이어 그린다
  const coordinates = samples.map((point) => [toX(point.timeMs), toY(point.rating)]);
  if (coordinates.length === 1) {
    coordinates.push([PLOT_RIGHT, coordinates[0][1]]);
  }
  const hasLine = coordinates.length > 1;
  const [firstX] = coordinates[0] ?? [PLOT_LEFT, 0];
  const [lastX, lastY] = coordinates[coordinates.length - 1] ?? [PLOT_RIGHT, 0];
  const linePoints = coordinates.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPath = `M${coordinates
    .map(([x, y]) => `${x} ${y}`)
    .join(" L")} L${lastX} ${AREA_BOTTOM} L${firstX} ${AREA_BOTTOM} Z`;
  const labelProps = {
    y: 118,
    fill: "var(--color-pk-muted)",
    fontSize: 11,
  } as const;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
      className="block h-auto w-full"
    >
      {GRID_YS.map((y) => (
        <line
          key={y}
          x1={PLOT_LEFT}
          y1={y}
          x2={WIDTH}
          y2={y}
          stroke="#e6e9f0"
          strokeWidth={1}
        />
      ))}
      {hasLine ? (
        <>
          <path d={areaPath} fill="var(--color-pk-primary)" fillOpacity={0.08} />
          <polyline
            points={linePoints}
            fill="none"
            stroke="var(--color-pk-primary)"
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={lastX} cy={lastY} r={4} fill="var(--color-pk-primary)" />
        </>
      ) : (
        <text
          x={(PLOT_LEFT + WIDTH) / 2}
          y={58}
          textAnchor="middle"
          fill="var(--color-pk-muted)"
          fontSize={13}
        >
          아직 평점 기록이 없어요
        </text>
      )}
      <text x={PLOT_LEFT} {...labelProps}>
        {kstMonthDayFormatter.format(new Date(startMs))}
      </text>
      <text x={WIDTH} textAnchor="end" {...labelProps}>
        오늘
      </text>
    </svg>
  );
};

export default RatingTrendChart;
