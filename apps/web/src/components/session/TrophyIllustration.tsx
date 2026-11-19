import React, { useId } from "react";

const VIEW_SIZE = 190;
const CENTER = VIEW_SIZE / 2;
const CIRCLE_RADIUS = 92;
/** 24 격자 트로피를 키우는 배율 */
const TROPHY_SCALE = 3;
/**
 * 트로피 중심. 카드 오른쪽 위 -top-[62px] -right-[54px]에 걸리므로
 * 카드 안에 보이는 원 부분(왼쪽 아래)으로 옮긴다
 */
const TROPHY_CENTER_X = 82;
const TROPHY_CENTER_Y = 112;
const TROPHY_TRANSFORM = `translate(${TROPHY_CENTER_X - 12 * TROPHY_SCALE} ${
  TROPHY_CENTER_Y - 12 * TROPHY_SCALE
}) scale(${TROPHY_SCALE})`;

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
      <g
        opacity={0.16}
        transform={TROPHY_TRANSFORM}
        className="fill-pk-gold stroke-pk-gold"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
        <path
          d="M8 6H5.5a2.5 2.5 0 0 0 2.5 4M16 6h2.5a2.5 2.5 0 0 1-2.5 4"
          fill="none"
        />
        <path d="M11 12.5h2V17h-2z" />
        <path d="M8.5 18.5h7v2h-7z" />
      </g>
    </svg>
  );
};

// 늘 같은 모양이라 캐러셀 넘김·분 단위 재렌더 때 다시 그리지 않는다
export default React.memo(TrophyIllustration);
