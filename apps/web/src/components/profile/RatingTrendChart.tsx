import React from "react";
import { toKstDateKey } from "@pkpkdupr/shared/session";
import { COUNT_UP } from "@/components/ui/CountUpNumber";
import { usePlayOnShow } from "@/hooks/usePlayOnShow";

export interface RatingTrendPoint {
  rating: number;
  createdAt: Date | string;
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
const EMPTY_TEXT_Y = 58;
// 격자 눈금 간격 후보(오름차순). 가장 작은 간격 0.025가 세로 범위를 최소 0.05로 막아
// 작은 변동이 차트 높이 전체로 과장되지 않게 한다
const TICK_STEPS = [0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5] as const;
// 0.025 간격 눈금(3.275 등)만 소수 셋째 자리가 필요하다
const FINE_TICK_STEP = 0.025;
// 3.3 / 0.05 같은 나눗셈의 부동소수점 오차로 눈금이 한 칸 내려가지 않게 한다
const TICK_EPSILON = 1e-9;

/**
 * 가로 격자 3줄에 둘 평점 눈금(맨 아래 값 low, 간격 step).
 * 최고·최저가 세 줄 안에 드는 가장 작은 간격을 고르고, 맨 아래 눈금 후보가 둘이면
 * 데이터 가운데가 가운데 줄에 가까운 쪽을 쓴다
 */
export const pickRatingTicks = (minRating: number, maxRating: number) => {
  const middle = (minRating + maxRating) / 2;
  for (const step of TICK_STEPS) {
    const floor = Math.floor(minRating / step + TICK_EPSILON) * step;
    const lows = [floor, floor - step].filter(
      (low) => low + 2 * step >= maxRating - TICK_EPSILON,
    );
    if (lows.length === 0) continue;
    const distance = (low: number) => Math.abs(middle - (low + step));
    const low = lows.reduce((best, candidate) =>
      distance(candidate) < distance(best) ? candidate : best,
    );
    return { low, step };
  }
  // 평점 차가 10을 넘는 일은 없지만 범위를 벗어나지 않게 데이터 범위 그대로 쓴다
  return { low: minRating, step: (maxRating - minRating) / 2 };
};

// 화면이 보일 때의 그리기 모션(ms). 선은 숫자 카운트업(COUNT_UP)과 같은 박자로 그린다.
// 끝점 pop의 onAnimationEnd가 재생 종료를 알리므로 END_DOT_DELAY_MS + END_DOT_POP_MS가
// 선 그리기와 면 페이드(FILL_DELAY_MS + FILL_FADE_MS)보다 늦게 끝나야 한다. 아니면 다른 모션이 끝나기 전에 animate 클래스가 떨어진다
const FILL_DELAY_MS = COUNT_UP.delayMs + 300;
const FILL_FADE_MS = 400;
const END_DOT_DELAY_MS = COUNT_UP.delayMs + COUNT_UP.durationMs - 50;
const END_DOT_POP_MS = 360;

const kstMonthDayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

/**
 * 최근 평점 영역 차트. 블루 선·8% 영역·가로 격자 3줄, 왼쪽에 각 격자의 평점 눈금.
 * x축은 시간 비례가 아니라 경기한 날마다 같은 간격이고, 서버가 하루에 점 하나
 * (그날 마지막 평점)로 내려준다.
 */
const RatingTrendChart: React.FC<{
  points: readonly RatingTrendPoint[];
  ariaLabel: string;
  now?: Date;
}> = ({ points, ariaLabel, now = new Date() }) => {
  // 화면이 보일 때마다 한 번 그리고, 끝나면 animate 클래스를 떼어 같은 보임 안의 점 변경 때는 다시 그리지 않는다
  const { isPlaying, finish } = usePlayOnShow();
  const samples = points
    .map((point) => ({
      rating: point.rating,
      time: new Date(point.createdAt),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.rating) && Number.isFinite(point.time.getTime()),
    )
    .sort((left, right) => left.time.getTime() - right.time.getTime());

  const ratings = samples.map((point) => point.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const { low: lowRating, step: tickStep } = pickRatingTicks(
    minRating,
    maxRating,
  );
  const span = tickStep * 2;

  const toX = (index: number) =>
    samples.length > 1
      ? PLOT_LEFT + (index / (samples.length - 1)) * (PLOT_RIGHT - PLOT_LEFT)
      : PLOT_RIGHT;
  const toY = (rating: number) =>
    PLOT_BOTTOM - ((rating - lowRating) / span) * (PLOT_BOTTOM - PLOT_TOP);

  const coordinates = samples.map((point, index) => ({
    x: toX(index),
    y: toY(point.rating),
  }));
  // 점이 하나뿐이면 왼쪽 끝부터 같은 평점으로 이어 그린다
  const linePath = coordinates.length === 1
    ? [{ x: PLOT_LEFT, y: coordinates[0].y }, coordinates[0]]
    : coordinates;
  const hasLine = linePath.length > 1;
  const first = linePath[0];
  const last = linePath[linePath.length - 1];
  const lineD = `M${linePath.map(({ x, y }) => `${x} ${y}`).join(" L")}`;
  const areaPath = hasLine
    ? `${lineD} L${last.x} ${AREA_BOTTOM} L${first.x} ${AREA_BOTTOM} Z`
    : "";

  const tickDigits = tickStep <= FINE_TICK_STEP ? 3 : 2;
  // GRID_YS(위 → 아래) 순서의 눈금 값
  const tickLabels = GRID_YS.map((_, index) =>
    (lowRating + (GRID_YS.length - 1 - index) * tickStep).toFixed(tickDigits),
  );

  const todayKey = toKstDateKey(now);
  const isToday = (time: Date) => toKstDateKey(time) === todayKey;
  const firstTime = samples[0]?.time;
  const lastTime = samples[samples.length - 1]?.time;
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
          <path
            d={areaPath}
            fill="var(--color-pk-primary)"
            fillOpacity={0.08}
            className={
              isPlaying
                ? "animate-pk-fade-in motion-reduce:animate-none"
                : undefined
            }
            style={
              isPlaying
                ? {
                    animationDelay: `${FILL_DELAY_MS}ms`,
                    animationDuration: `${FILL_FADE_MS}ms`,
                  }
                : undefined
            }
          />
          <path
            d={lineD}
            pathLength={1}
            fill="none"
            stroke="var(--color-pk-primary)"
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={
              isPlaying ? "animate-pk-draw motion-reduce:animate-none" : undefined
            }
            style={
              isPlaying
                ? {
                    animationDelay: `${COUNT_UP.delayMs}ms`,
                    animationDuration: `${COUNT_UP.durationMs}ms`,
                  }
                : undefined
            }
          />
          {/* SVG 요소의 scale 기준점을 점 중심으로 맞추려면 fill-box가 필요하다 */}
          <circle
            cx={last.x}
            cy={last.y}
            r={4}
            fill="var(--color-pk-primary)"
            className={
              isPlaying
                ? "animate-pk-pop motion-reduce:animate-none origin-center [transform-box:fill-box]"
                : undefined
            }
            style={
              isPlaying
                ? {
                    animationDelay: `${END_DOT_DELAY_MS}ms`,
                    animationDuration: `${END_DOT_POP_MS}ms`,
                  }
                : undefined
            }
            onAnimationEnd={finish}
          />
          {GRID_YS.map((y, index) => (
            <text key={y} y={y} {...yLabelProps}>
              {tickLabels[index]}
            </text>
          ))}
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
