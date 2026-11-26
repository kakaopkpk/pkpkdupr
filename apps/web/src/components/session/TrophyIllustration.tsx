import React, { useId } from "react";

const VIEW_SIZE = 190;
const CENTER = VIEW_SIZE / 2;
const CIRCLE_RADIUS = 92;
/**
 * 트로피(80×83 격자)를 놓는 자리와 기울기. 카드 오른쪽 위 -top-[62px] -right-[54px]에 걸리므로
 * 카드 안에 보이는 원 부분(왼쪽 아래)에 두고 왼쪽으로 12° 기울인다
 */
const TROPHY_TRANSFORM = "translate(46 70) rotate(-12 40 50)";

/**
 * 대회 세션 카드 오른쪽 위에 걸치는 장식. 피클볼 장식과 같은 자리·크기의 옅은 흰 구면 원(구멍 없음) 위에
 * 아주 연한 금색 트로피를 그린다. 트로피는 한 그룹 투명도로 그려 몸통·손잡이가 겹친 곳이 진해지지 않는다
 */
const TrophyIllustration: React.FC<{ className?: string }> = ({
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
      <circle cx={CENTER} cy={CENTER} r={CIRCLE_RADIUS} fill={`url(#${shadeId})`} />
      <g opacity={0.16} transform={TROPHY_TRANSFORM}>
        <g className="fill-pk-gold">
          <path d="M14 0h52v34a26 26 0 0 1-52 0z" />
          <rect x={34} y={58} width={12} height={16} rx={2} />
          <rect x={20} y={72} width={40} height={11} rx={3} />
        </g>
        <g
          fill="none"
          className="stroke-pk-gold"
          strokeWidth={7}
          strokeLinecap="round"
        >
          <path d="M14 8H6a9 9 0 0 0 0 18h9" />
          <path d="M66 8h8a9 9 0 0 1 0 18h-9" />
        </g>
      </g>
    </svg>
  );
};

// 늘 같은 모양이라 캐러셀 넘김·분 단위 재렌더 때 다시 그리지 않는다
export default React.memo(TrophyIllustration);
