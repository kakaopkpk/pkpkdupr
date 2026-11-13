import React from "react";
import { toKstDateKey } from "@pkpkdupr/shared/session";

export interface RatingTrendPoint {
  rating: number;
  createdAt: Date | string;
  /** `anchor`는 기간 시작 직전 평점이라 경기한 날 점을 찍지 않는다 */
  source?: "match" | "current" | "anchor";
}

const WIDTH = 326;
const HEIGHT = 120;
const PLOT_LEFT = 34;
const PLOT_RIGHT = 318;
const GRID_YS = [14, 54, 94] as const;
const PLOT_TOP = GRID_YS[0];
const PLOT_BOTTOM = GRID_YS[GRID_YS.length - 1];
const AREA_BOTTOM = 104;
const X_LABEL_Y = 118;
const Y_LABEL_X = PLOT_LEFT - 6;
// 최고·최저 라벨이 이보다 가까우면 겹치므로 최고만 보인다
const Y_LABEL_MIN_GAP = 12;
const EMPTY_TEXT_Y = 58;
// 작은 변동이 차트 높이 전체로 과장되지 않게 하는 최소 세로 범위
const MIN_RATING_SPAN = 0.3;

const kstMonthDayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

/**
 * 최근 평점 영역 차트. 블루 선·8% 영역·가로 격자 3줄, 왼쪽에 최고·최저 값.
 * x축은 시간 비례가 아니라 경기한 날마다 같은 간격이고, 서버가 하루에 점 하나
 * (그날 마지막 평점)로 내려준다.
 */
const RatingTrendChart: React.FC<{
  points: readonly RatingTrendPoint[];
  ariaLabel: string;
  now?: Date;
}> = ({ points, ariaLabel, now = new Date() }) => {
  const samples = points
    .map((point) => ({
      rating: point.rating,
      time: new Date(point.createdAt),
      isAnchor: point.source === "anchor",
    }))
    .filter(
      (point) =>
        Number.isFinite(point.rating) && Number.isFinite(point.time.getTime()),
    )
    .sort((left, right) => left.time.getTime() - right.time.getTime());

  const ratings = samples.map((point) => point.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const span = Math.max(maxRating - minRating, MIN_RATING_SPAN);
  const lowRating = (minRating + maxRating) / 2 - span / 2;

  const toX = (index: number) =>
    samples.length > 1
      ? PLOT_LEFT + (index / (samples.length - 1)) * (PLOT_RIGHT - PLOT_LEFT)
      : PLOT_RIGHT;
  const toY = (rating: number) =>
    PLOT_BOTTOM - ((rating - lowRating) / span) * (PLOT_BOTTOM - PLOT_TOP);

  const coordinates = samples.map((point, index) => ({
    x: toX(index),
    y: toY(point.rating),
    isAnchor: point.isAnchor,
  }));
  // 점이 하나뿐이면 왼쪽 끝부터 같은 평점으로 이어 그린다
  const linePath = coordinates.length === 1
    ? [{ x: PLOT_LEFT, y: coordinates[0].y }, coordinates[0]]
    : coordinates;
  const hasLine = linePath.length > 1;
  const first = linePath[0];
  const last = linePath[linePath.length - 1];
  const linePoints = linePath.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPath = hasLine
    ? `M${linePath.map(({ x, y }) => `${x} ${y}`).join(" L")} L${last.x} ${AREA_BOTTOM} L${first.x} ${AREA_BOTTOM} Z`
    : "";

  const maxLabel = maxRating.toFixed(2);
  const minLabel = minRating.toFixed(2);
  // 세로 범위가 0.3 이상이라 간격이 넉넉하면 두 라벨 값도 서로 다르다
  const showMinLabel = toY(minRating) - toY(maxRating) >= Y_LABEL_MIN_GAP;

  const todayKey = toKstDateKey(now);
  const isToday = (time: Date) => toKstDateKey(time) === todayKey;
  const firstTime = samples[0]?.time;
  const lastTime = samples.at(-1)?.time;
  // 점이 하나면 그 평점이 오늘까지 이어지는 선이라 오른쪽은 "오늘"이고,
  // 그 점이 오늘이면 왼쪽 날짜 라벨은 겹치므로 숨긴다
  const startLabel =
    firstTime && !(samples.length === 1 && isToday(firstTime))
      ? kstMonthDayFormatter.format(firstTime)
      : null;
  const endLabel =
    lastTime && samples.length > 1 && !isToday(lastTime)
      ? kstMonthDayFormatter.format(lastTime)
      : "오늘";

  const xLabelProps = {
    y: X_LABEL_Y,
    fill: "var(--color-pk-muted)",
    fontSize: 11,
  } as const;
  const yLabelProps = {
    x: Y_LABEL_X,
    textAnchor: "end",
    dominantBaseline: "middle",
    fill: "var(--color-pk-muted)",
    fontSize: 10,
    className: "tabular-nums",
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
          stroke="var(--color-pk-divider)"
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
          {coordinates.slice(0, -1).map(({ x, y, isAnchor }) =>
            isAnchor ? null : (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r={2.5}
                fill="var(--color-pk-primary)"
              />
            ),
          )}
          <circle cx={last.x} cy={last.y} r={4} fill="var(--color-pk-primary)" />
          <text y={toY(maxRating)} {...yLabelProps}>
            {maxLabel}
          </text>
          {showMinLabel ? (
            <text y={toY(minRating)} {...yLabelProps}>
              {minLabel}
            </text>
          ) : null}
        </>
      ) : (
        <text
          x={(PLOT_LEFT + WIDTH) / 2}
          y={EMPTY_TEXT_Y}
          textAnchor="middle"
          fill="var(--color-pk-muted)"
          fontSize={13}
        >
          아직 평점 기록이 없어요
        </text>
      )}
      {startLabel ? (
        <text x={PLOT_LEFT} {...xLabelProps}>
          {startLabel}
        </text>
      ) : null}
      <text x={WIDTH} textAnchor="end" {...xLabelProps}>
        {endLabel}
      </text>
    </svg>
  );
};

export default RatingTrendChart;
