import React from "react";
import { cx } from "@/components/ui/cx";

/*
 * 진행 중 경기 상세 팀 줄 위에 겹쳐 그리는 랠리 연출. 장식이라 스크린 리더에서는 숨긴다.
 * 팀 줄은 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2(8px)이고 가운데 칸 폭이 RALLY_NET_COLUMN_WIDTH,
 * 아바타(32px, 겹침 6px)는 팀 칸 가운데 위에 있다는 전제로 공 경로를 계산한다.
 * 공은 왼쪽 팀 아바타 바깥 가장자리에서 오른쪽 팀 아바타 바깥 가장자리까지 오간다.
 */

const AVATAR_SIZE = 32;
const AVATAR_OVERLAP = 6;
const GRID_GAP = 8;
/** 가운데 네트 칸 폭(px). 팀 줄의 가운데 칸에 같은 폭을 준다 */
export const RALLY_NET_COLUMN_WIDTH = 28;
/** 아바타 테두리와 공 사이 여백 */
const BALL_GAP = 6;
/** 팀 줄 위쪽 여백(px). 공이 아바타 위로 떠오를 자리 */
export const RALLY_TOP_SPACE = 12;
/** 공이 출발하는 높이. 아바타(위 여백 아래 32px) 가운데보다 6px 위 */
const BALL_Y = RALLY_TOP_SPACE + AVATAR_SIZE / 2 - 6;
const NET_HEIGHT = 24;
/** 네트 받침이 아바타 아래 끝보다 1px 아래에 닿는다 */
const NET_TOP = RALLY_TOP_SPACE + AVATAR_SIZE + 1 - NET_HEIGHT;

const halfAvatarGroupWidth = (playerCount: number) =>
  (AVATAR_SIZE * playerCount - AVATAR_OVERLAP * Math.max(0, playerCount - 1)) / 2;

/** 공이 오가는 구간. 팀 칸 가운데는 각각 25% - 칸 보정, 75% + 칸 보정에 있다 */
export const getRallyTrack = (leftCount: number, rightCount: number) => {
  // 팀 칸 폭 = (100% - 가운데 칸 - 간격 2개) / 2 이므로 가운데는 25%에서 그 절반 보정만큼 안쪽이다
  const columnOffset = (RALLY_NET_COLUMN_WIDTH + GRID_GAP * 2) / 4;
  const start = -columnOffset + halfAvatarGroupWidth(leftCount) + BALL_GAP;
  const end = columnOffset - halfAvatarGroupWidth(rightCount) - BALL_GAP;
  const offset = (base: string, px: number) =>
    `calc(${base} ${px < 0 ? "-" : "+"} ${Math.abs(px)}px)`;
  return { left: offset("25%", start), width: offset("50%", end - start) };
};

/** 친 자리에서 휘두르는 패들과 사방으로 퍼지는 충격선. 좌표 원점이 공에 닿는 점이다 */
const HitEffect: React.FC<{ side: "left" | "right" }> = ({ side }) => {
  const late = side === "right" && "pk-rally-late";
  return (
    <svg
      viewBox="-20 -20 40 40"
      className={cx(
        "absolute top-0 size-10 -translate-x-1/2 -translate-y-1/2 overflow-visible",
        side === "left" ? "left-0" : "left-full -scale-x-100",
      )}
    >
      <g className={cx("pk-rally-burst", late)}>
        <path
          d={BURST_PATH}
          className="fill-none stroke-pk-primary"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>
      <g transform="translate(-9 12)">
        <g className={cx("pk-rally-paddle", late)}>
          <rect x={-1.5} y={-5} width={3} height={6} rx={1.5} className="fill-pk-primary" />
          <rect x={-5} y={-17} width={10} height={13} rx={5} className="fill-pk-primary" />
        </g>
      </g>
    </svg>
  );
};

// 공 둘레 반지름 9~14 사이의 짧은 선 6개
const BURST_PATH = [30, 90, 150, 210, 270, 330]
  .map((deg) => {
    const a = (deg * Math.PI) / 180;
    const point = (r: number) =>
      `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
    return `M${point(9)} L${point(14)}`;
  })
  .join(" ");

// 피클볼 구멍과 테두리 색. 공 연두를 잉크 쪽으로 어둡게 섞는다
const BALL_EDGE = "color-mix(in srgb, var(--color-pk-hl) 70%, var(--color-pk-ink))";

const Ball: React.FC = () => (
  <svg
    viewBox="-7 -7 14 14"
    className="absolute top-0 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 overflow-visible"
  >
    {/* 아바타와 겹쳐도 공이 따로 보이도록 바탕색 테두리를 두른다 */}
    <circle r={7} className="fill-pk-bg" />
    <circle r={5} className="fill-pk-hl" style={{ stroke: BALL_EDGE }} strokeWidth={1} />
    <circle cx={-1.8} cy={-1.5} r={0.9} style={{ fill: BALL_EDGE }} />
    <circle cx={1.8} cy={-0.5} r={0.9} style={{ fill: BALL_EDGE }} />
    <circle cx={-0.2} cy={2} r={0.9} style={{ fill: BALL_EDGE }} />
  </svg>
);

export const LiveMatchRally: React.FC<{
  leftCount: number;
  rightCount: number;
}> = ({ leftCount, rightCount }) => {
  const track = getRallyTrack(leftCount, rightCount);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      {/* 기둥과 받침이 이어진 네트. 팀 줄 가운데, 아바타 높이에 선다 */}
      <svg
        viewBox="155 22 18 24"
        className="absolute left-1/2 w-[18px] -translate-x-1/2"
        style={{ top: NET_TOP, height: NET_HEIGHT }}
      >
        <path
          className="fill-pk-quiet"
          d="M162.6 25 Q164 22.6 165.4 25 V38.5 Q166 42 171 42.8 Q172.6 43.2 172.2 44.2 Q171.9 45 170.6 45 H157.4 Q156.1 45 155.8 44.2 Q155.4 43.2 157 42.8 Q162 42 162.6 38.5 Z"
        />
      </svg>
      <div className="absolute" style={{ top: BALL_Y, left: track.left, width: track.width }}>
        <HitEffect side="left" />
        <HitEffect side="right" />
        <div className="pk-rally-x absolute inset-x-0 top-0">
          <div className="pk-rally-y absolute top-0 left-0">
            <Ball />
          </div>
        </div>
      </div>
    </div>
  );
};
