import React, { useId } from "react";

/** 실외용 피클볼 구멍 수 */
const HOLE_COUNT = 40;
const VIEW_SIZE = 190;
const CENTER = VIEW_SIZE / 2;
const BALL_RADIUS = 92;
/** 구멍 하나가 구 중심에서 차지하는 각반지름(rad). 공 지름 74mm에 구멍 약 8.5mm */
const HOLE_ANGULAR_RADIUS = 0.115;
/** 고르게 놓은 구멍이 한 점에 몰려 보이지 않게 공을 기울이는 각도 */
const TILT_X = (23 * Math.PI) / 180;
const TILT_Y = (-31 * Math.PI) / 180;
/** 가장자리에서 거의 옆면만 보이는 구멍도 선으로 남도록 하는 최소 짧은 반지름 */
const MIN_HOLE_MINOR_RADIUS = 0.6;

interface Hole {
  cx: number;
  cy: number;
  /** 반지름 방향(눌리는 쪽) 반지름 */
  rx: number;
  /** 접선 방향 반지름 */
  ry: number;
  /** 화면 중심에서 구멍을 향하는 각도(도) */
  angle: number;
}

/**
 * 구멍을 구 표면에 고르게(피보나치 격자) 놓고 기울인 뒤 앞에서 본 모습으로 투영한다.
 * 구멍 크기는 모두 같고, 가장자리로 갈수록 반지름 방향으로 눌린 타원이 된다. 뒷면 구멍은 뺀다
 */
const computeHoles = (): Hole[] => {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const tangentRadius = BALL_RADIUS * Math.sin(HOLE_ANGULAR_RADIUS);
  const centerDistance = BALL_RADIUS * Math.cos(HOLE_ANGULAR_RADIUS);
  const holes: Hole[] = [];

  for (let i = 0; i < HOLE_COUNT; i++) {
    const y0 = 1 - (2 * (i + 0.5)) / HOLE_COUNT;
    const ring = Math.sqrt(1 - y0 * y0);
    const x0 = ring * Math.cos(goldenAngle * i);
    const z0 = ring * Math.sin(goldenAngle * i);

    const y1 = y0 * Math.cos(TILT_X) - z0 * Math.sin(TILT_X);
    const z1 = y0 * Math.sin(TILT_X) + z0 * Math.cos(TILT_X);
    const x = x0 * Math.cos(TILT_Y) + z1 * Math.sin(TILT_Y);
    const z = -x0 * Math.sin(TILT_Y) + z1 * Math.cos(TILT_Y);
    const y = y1;

    // 테두리에 걸친 구멍까지 남긴다
    if (z <= -Math.sin(HOLE_ANGULAR_RADIUS)) continue;

    holes.push({
      cx: CENTER + centerDistance * x,
      cy: CENTER - centerDistance * y,
      rx: Math.max(tangentRadius * z, MIN_HOLE_MINOR_RADIUS),
      ry: tangentRadius,
      angle: (Math.atan2(-y, x) * 180) / Math.PI,
    });
  }
  return holes;
};

const HOLES = computeHoles();

/**
 * 세션 블루 카드 오른쪽 위에 걸치는 피클볼 장식. 공은 옅은 흰색 구면 음영이고,
 * 구멍은 카드 바탕(pk-primary)으로 채워 뚫린 것처럼 보인다
 */
const PickleballIllustration: React.FC<{ className?: string }> = ({
  className,
}) => {
  const shadeId = useId();
  return (
    <svg
      width={VIEW_SIZE}
      height={VIEW_SIZE}
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      aria-hidden="true"
      className={className}
    >
      <defs>
        <radialGradient id={shadeId} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="white" stopOpacity="0.16" />
          <stop offset="1" stopColor="white" stopOpacity="0.05" />
        </radialGradient>
      </defs>
      <circle cx={CENTER} cy={CENTER} r={BALL_RADIUS} fill={`url(#${shadeId})`} />
      <g className="fill-pk-primary">
        {HOLES.map((hole, index) => (
          <ellipse
            key={index}
            cx={hole.cx}
            cy={hole.cy}
            rx={hole.rx}
            ry={hole.ry}
            transform={`rotate(${hole.angle} ${hole.cx} ${hole.cy})`}
          />
        ))}
      </g>
    </svg>
  );
};

export default PickleballIllustration;
