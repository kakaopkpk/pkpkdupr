import React from "react";
import { cx } from "@/components/ui/cx";
import {
  type SessionWinStreakByPlayer,
  TEAM_AVATAR_OVERLAP,
  TeamAvatars,
} from "@/components/ui/PlayerAvatar";
import { useIsScreenVisible } from "@/context/ScreenVisibilityContext";
import type { MatchInfo } from "@/types/match";

/*
 * 진행 중 경기 팀 줄(경기 상세, 홈 내 경기 카드)의 랠리 연출. 랠리 그림은 장식이라 스크린 리더에서는 숨긴다.
 * 팀 줄(RallyTeamRow)은 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]에 칸 간격 TEAM_ROW_GAP, 가운데 칸 폭 RALLY_NET_COLUMN_WIDTH이고
 * 아바타 쌍(TEAM_ROW_AVATAR_SIZE)을 두 팀 칸 맨 위 가운데에 두며, 이 배치를 전제로 공 경로를 계산한다.
 * 공은 왼쪽 팀 아바타 바깥 가장자리에서 오른쪽 팀 아바타 바깥 가장자리까지 오간다.
 */

/** 팀 줄의 아바타 크기(px). 경기 상세의 끝난 경기 팀 칸도 같은 크기를 쓴다 */
export const TEAM_ROW_AVATAR_SIZE = 32;
const TEAM_ROW_GAP = 8;
const AVATAR_SIZE = TEAM_ROW_AVATAR_SIZE;
/** 가운데 네트 칸 폭(px) */
const RALLY_NET_COLUMN_WIDTH = 28;
/** 아바타 테두리와 공 사이 여백 */
const BALL_GAP = 6;
/** 팀 줄 위쪽 여백(px). 공이 아바타 위로 떠오를 자리 */
const RALLY_TOP_SPACE = 12;
/** 공이 출발하는 높이. 아바타(위 여백 아래 32px) 가운데보다 6px 위 */
const BALL_Y = RALLY_TOP_SPACE + AVATAR_SIZE / 2 - 6;
const NET_HEIGHT = 24;
/** 네트 받침이 아바타 아래 끝보다 1px 아래에 닿는다 */
const NET_TOP = RALLY_TOP_SPACE + AVATAR_SIZE + 1 - NET_HEIGHT;

const halfAvatarGroupWidth = (playerCount: number) =>
  (AVATAR_SIZE * playerCount - TEAM_AVATAR_OVERLAP * Math.max(0, playerCount - 1)) / 2;

/** 공이 오가는 구간. 팀 칸 가운데는 각각 25% - 칸 보정, 75% + 칸 보정에 있다 */
export const getRallyTrack = (leftCount: number, rightCount: number) => {
  // 팀 칸 폭 = (100% - 가운데 칸 - 간격 2개) / 2 이므로 가운데는 25%에서 그 절반 보정만큼 안쪽이다
  const columnOffset = (RALLY_NET_COLUMN_WIDTH + TEAM_ROW_GAP * 2) / 4;
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

const BALL_HOLES = [
  [-1.8, -1.5],
  [1.8, -0.5],
  [-0.2, 2],
] as const;

const Ball: React.FC<{ ringColor: string }> = ({ ringColor }) => (
  <svg
    viewBox="-7 -7 14 14"
    className="absolute top-0 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 overflow-visible"
  >
    {/* 아바타와 겹쳐도 공이 따로 보이도록 바탕색 테두리를 두른다 */}
    <circle r={7} style={{ fill: ringColor }} />
    <circle r={5} className="fill-pk-hl" style={{ stroke: BALL_EDGE }} strokeWidth={1} />
    {BALL_HOLES.map(([cx, cy]) => (
      <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={0.9} style={{ fill: BALL_EDGE }} />
    ))}
  </svg>
);

const LiveMatchRally: React.FC<{
  leftCount: number;
  rightCount: number;
  ringColor: string;
}> = ({ leftCount, rightCount, ringColor }) => {
  const track = getRallyTrack(leftCount, rightCount);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
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
      <span className="absolute" style={{ top: BALL_Y, left: track.left, width: track.width }}>
        <HitEffect side="left" />
        <HitEffect side="right" />
        <span className="pk-rally-x absolute inset-x-0 top-0">
          <span className="pk-rally-y absolute top-0 left-0">
            <Ball ringColor={ringColor} />
          </span>
        </span>
      </span>
    </span>
  );
};

/**
 * 두 팀 칸 사이 네트 칸에 랠리를 겹쳐 그린 팀 줄. 예정 경기(isScheduled)면 랠리 없이 vs 글자만 보인다.
 * 팀 칸마다 아바타 쌍을 맨 위 가운데에 두고 그 아래에 renderNames가 그린 이름을 둔다.
 */
export const RallyTeamRow: React.FC<{
  teams: MatchInfo["teams"];
  isScheduled: boolean;
  /** 팀 줄 바탕색. 아바타 테두리와 공 바깥 테두리를 이 색으로 칠한다 */
  ringColor: string;
  vsClassName: string;
  renderNames: (team: MatchInfo["teams"][number]) => React.ReactNode;
  /** 든 회원 아바타에 세션 연승 링을 두른다(홈 진행 중 세션) */
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({
  teams,
  isScheduled,
  ringColor,
  vsClassName,
  renderNames,
  sessionWinStreaks,
}) => {
  const isVisible = useIsScreenVisible();
  // 홈 카드처럼 버튼 안에도 들어가므로 span으로 쌓는다
  const renderTeam = (side: 0 | 1) => (
    <span className="flex min-w-0 flex-col items-center gap-1.5">
      <span
        className={cx(
          "inline-flex",
          // 친 팀 아바타 쌍이 공 쪽으로 밀린다
          !isScheduled && "pk-rally-lunge",
          !isScheduled && side === 1 && "pk-rally-lunge-reverse",
        )}
      >
        <TeamAvatars
          players={teams[side].players}
          size={AVATAR_SIZE}
          ringColor={ringColor}
          sessionWinStreaks={sessionWinStreaks}
        />
      </span>
      {renderNames(teams[side])}
    </span>
  );
  return (
    <span
      className={cx(
        "relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center",
        !isVisible && "pk-rally-paused",
      )}
      style={{ columnGap: TEAM_ROW_GAP, paddingTop: isScheduled ? undefined : RALLY_TOP_SPACE }}
    >
      {renderTeam(0)}
      {isScheduled ? (
        <span className={vsClassName}>vs</span>
      ) : (
        // 네트 칸. 화면에는 네트(LiveMatchRally)만 보이고 vs는 스크린 리더용으로 남긴다
        <span style={{ width: RALLY_NET_COLUMN_WIDTH }}>
          <span className="sr-only">vs</span>
        </span>
      )}
      {renderTeam(1)}
      {isScheduled ? null : (
        <LiveMatchRally
          leftCount={teams[0].players.length}
          rightCount={teams[1].players.length}
          ringColor={ringColor}
        />
      )}
    </span>
  );
};
