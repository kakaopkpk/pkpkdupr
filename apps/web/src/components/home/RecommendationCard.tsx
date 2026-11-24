import React from "react";
import type {
  RecommendationPlayer,
  RecommendedCourt,
} from "@pkpkdupr/shared/matchmaking";
import {
  specialMatchKindLabels,
  type SpecialMatch,
} from "@pkpkdupr/shared/specialMatch";
import { WIN_STREAK_DISPLAY_MIN } from "@pkpkdupr/shared/streak";
import { buttonPressClassName } from "@/components/ui/Button";
import {
  PlayerAvatar,
  TeamAvatars,
  type SessionWinStreakByPlayer,
} from "@/components/ui/PlayerAvatar";
import { SpecialMatchIcon } from "@/components/ui/SpecialMatchLabel";
import {
  SessionWinStreakFrame,
  WinStreakAvatarFrame,
} from "@/components/ui/WinStreakAvatarFrame";
import { cx } from "@/components/ui/cx";
import { formatRating } from "@/utils/dupr";

/** highlight: 연한 파랑 칸(지키는 쪽, 최강자전은 두 칸 모두). plain: 회색 칸 */
type CellTone = "highlight" | "plain";

const CELL_BACKGROUND: Record<CellTone, string> = {
  highlight: "var(--color-pk-primary-soft)",
  plain: "var(--color-pk-bg)",
};

const PROTAGONIST_AVATAR_SIZE = 40;
const PROTAGONIST_TEAMMATE_AVATAR_SIZE = 28;
/** 주인공 없는 칸의 두 아바타 크기 */
const PLAIN_AVATAR_SIZE = 32;
const CELL_AVATAR_OVERLAP = 8;

/** 두 칸을 104° 사선으로 나누고 가운데에 0.8% 폭의 흰 틈을 남긴다 */
const getBoardBackground = ([left, right]: [CourtCell, CourtCell]) =>
  `linear-gradient(104deg, ${CELL_BACKGROUND[left.tone]} 0 49.6%, var(--color-white) 49.6% 50.4%, ${CELL_BACKGROUND[right.tone]} 50.4% 100%)`;

interface CourtCell {
  players: readonly [RecommendationPlayer, RecommendationPlayer];
  /** 앞세울 주인공. 없으면 두 사람을 같은 크기로 둔다 */
  protagonist: RecommendationPlayer | null;
  tone: CellTone;
  /** 순위 칩 모양. 라이벌전 주인공만 있다 */
  rankChip: "defending" | "attacking" | null;
  /** 주인공 아바타에 연승 링을 두르고 평점을 숨긴다(연승 매치·최강자전) */
  showsStreak: boolean;
}

/**
 * 서버가 준 protagonistIds·defendingTeamIndex만으로 두 칸을 만든다(웹이 다시 판정하지 않는다).
 * 지키는 쪽 팀을 왼쪽에 둔다
 */
const buildCells = (court: RecommendedCourt): [CourtCell, CourtCell] => {
  const special: SpecialMatch | null = court.specialMatch;
  const toCell = (teamIndex: 0 | 1): CourtCell => {
    const players = court.teams[teamIndex].players;
    const protagonistId = special?.protagonistIds[teamIndex] ?? null;
    const protagonist =
      players.find((player) => player.id === protagonistId) ?? null;
    const isDefending = special?.defendingTeamIndex === teamIndex;
    // 최강자전은 지키는 쪽이 없어도 두 칸 모두 연한 파랑이다
    const tone: CellTone =
      special?.kind === "champions" || isDefending ? "highlight" : "plain";
    const [first, second] = players;
    return {
      // 주인공을 앞(첫 번째)에 둔다
      players: protagonist === second ? [second, first] : players,
      protagonist,
      tone,
      rankChip:
        special?.kind === "rival" && protagonist
          ? isDefending
            ? "defending"
            : "attacking"
          : null,
      showsStreak:
        special?.kind === "streak_stopper" || special?.kind === "champions",
    };
  };
  return special?.defendingTeamIndex === 1
    ? [toCell(1), toCell(0)]
    : [toCell(0), toCell(1)];
};

/** 세션 연승 링(태그 없음). winStreak이 없으면 아바타만 */
const SessionAvatar: React.FC<{
  player: RecommendationPlayer;
  size: number;
  winStreak: number | undefined;
}> = ({ player, size, winStreak }) => (
  <SessionWinStreakFrame winStreak={winStreak}>
    <PlayerAvatar player={player} size={size} />
  </SessionWinStreakFrame>
);

/**
 * 두 칸 모두 앞 아바타가 왼쪽이고 뒤 아바타가 오른쪽으로 겹친다. 칸 바탕색 테로 겹친 곳을 띄운다.
 * 주인공이 있으면 주인공이 앞에서 뒤 아바타를 덮고, 두 아바타의 아래 끝을 맞춘다
 */
const CellAvatars: React.FC<{
  cell: CourtCell;
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({ cell, sessionWinStreaks }) => {
  const [front, back] = cell.players;
  const gapShadow = { boxShadow: `0 0 0 2px ${CELL_BACKGROUND[cell.tone]}` };
  if (!cell.protagonist) {
    return (
      <span className="mt-0.5 inline-flex">
        <TeamAvatars
          players={cell.players}
          size={PLAIN_AVATAR_SIZE}
          ringColor={CELL_BACKGROUND[cell.tone]}
          overlap={CELL_AVATAR_OVERLAP}
          sessionWinStreaks={sessionWinStreaks}
        />
      </span>
    );
  }
  // 연승 링(WIN_STREAK_DISPLAY_MIN 이상)을 두르는 주인공은 세션 연승 링을 겹쳐 두르지 않는다.
  // 링 아래 숫자 태그만큼 띄워 뒤 아바타와 아래 끝을 맞춘다. 그보다 짧은 연승 주인공은 세션 연승 링을 두른다
  const frontAvatar =
    cell.showsStreak && front.winStreak >= WIN_STREAK_DISPLAY_MIN ? (
      <span className="relative z-10 mb-1 inline-flex">
        <WinStreakAvatarFrame winStreak={front.winStreak} size="sm">
          <PlayerAvatar player={front} size={PROTAGONIST_AVATAR_SIZE} />
        </WinStreakAvatarFrame>
      </span>
    ) : (
      <span
        className="relative z-10 inline-flex rounded-full"
        style={gapShadow}
      >
        <SessionAvatar
          player={front}
          size={PROTAGONIST_AVATAR_SIZE}
          // 아직 세션 경기를 안 뛰어 세션 연승에 없는 연승 주인공도 링을 두른다
          winStreak={
            sessionWinStreaks?.get(front.id) ??
            (cell.showsStreak ? front.winStreak : undefined)
          }
        />
      </span>
    );
  return (
    <span aria-hidden="true" className="mt-0.5 inline-flex shrink-0 items-end">
      {frontAvatar}
      <span
        className="inline-flex rounded-full"
        style={{ ...gapShadow, marginLeft: -CELL_AVATAR_OVERLAP }}
      >
        <SessionAvatar
          player={back}
          size={PROTAGONIST_TEAMMATE_AVATAR_SIZE}
          winStreak={sessionWinStreaks?.get(back.id)}
        />
      </span>
    </span>
  );
};

const RankChip: React.FC<{
  rank: number;
  tone: "defending" | "attacking";
}> = ({ rank, tone }) => (
  <span
    className={cx(
      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-pk-12 font-extrabold whitespace-nowrap tabular-nums",
      tone === "defending"
        ? "bg-pk-primary text-white"
        : "bg-white text-pk-sub",
    )}
  >
    {rank}위
  </span>
);

/** 칸 내용은 가운데 정렬이다. 주인공 없는 칸은 세로로도 가운데다 */
const CourtCellContent: React.FC<{
  cell: CourtCell;
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({ cell, sessionWinStreaks }) => {
  const [front, back] = cell.players;
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col items-center gap-1 px-2 py-2.5 text-center",
        !cell.protagonist && "justify-center",
      )}
    >
      <CellAvatars cell={cell} sessionWinStreaks={sessionWinStreaks} />
      {cell.protagonist ? (
        <>
          <span className="flex max-w-full flex-col items-center">
            <span className="max-w-full truncate text-pk-15 font-extrabold text-pk-ink">
              {front.username}
            </span>
            <span className="max-w-full truncate text-pk-13 font-medium text-pk-sub">
              {back.username}
            </span>
          </span>
          {cell.rankChip ? (
            <span className="inline-flex max-w-full items-center gap-1.5">
              {front.doublesRank !== null ? (
                <RankChip rank={front.doublesRank} tone={cell.rankChip} />
              ) : null}
              <span className="truncate text-pk-13 font-bold text-pk-sub tabular-nums">
                {formatRating(front.doublesRating)}
              </span>
            </span>
          ) : null}
        </>
      ) : (
        cell.players.map((player) => (
          <span
            key={player.id}
            className="max-w-full truncate text-pk-15 font-bold text-pk-ink"
          >
            {player.username}
          </span>
        ))
      )}
    </div>
  );
};

/**
 * 추천 코트 카드(docs/design.md "특수 매치"의 추천 매칭 카드). 흰 카드 안에 두 팀 칸이 사선으로 나뉜
 * 둥근 판과 둥근 "경기 시작" 버튼을 둔다. 판 가운데에 블루 VS 원, 특수 유형이면 그 위에 흰 유형 알약이다
 */
const RecommendationCard: React.FC<{
  court: RecommendedCourt;
  isStarting: boolean;
  isStartDisabled: boolean;
  error: string | null;
  sessionWinStreaks?: SessionWinStreakByPlayer;
  onStart: () => void;
}> = ({
  court,
  isStarting,
  isStartDisabled,
  error,
  sessionWinStreaks,
  onStart,
}) => {
  const cells = buildCells(court);
  const kind = court.specialMatch?.kind;
  return (
    <article className="flex flex-col gap-2.5 rounded-pk-lg bg-white p-3">
      <div
        className="relative grid grid-cols-2 overflow-hidden rounded-pk-sm"
        style={{ background: getBoardBackground(cells) }}
      >
        {cells.map((cell, index) => (
          <CourtCellContent
            key={index}
            cell={cell}
            sessionWinStreaks={sessionWinStreaks}
          />
        ))}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 inline-flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-pk-primary text-pk-12 font-extrabold text-white shadow-[0_0_0_3px_var(--color-white)]"
        >
          VS
        </span>
        {/* 유형 알약은 아래 끝을 VS 원 중심에서 24px 위에 둔다 */}
        {kind ? (
          <span className="pointer-events-none absolute top-[calc(50%-24px)] left-1/2 inline-flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full bg-white px-[9px] py-[3px] text-pk-12 font-extrabold whitespace-nowrap text-pk-primary shadow-[0_1px_4px_rgb(15_23_38/0.08)]">
            <SpecialMatchIcon kind={kind} size={12} />
            {specialMatchKindLabels[kind]}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        disabled={isStartDisabled}
        onClick={onStart}
        className={cx(
          "flex h-10 w-full items-center justify-center rounded-pk-sm bg-pk-primary-soft text-pk-15 font-extrabold text-pk-primary touch-manipulation disabled:cursor-not-allowed disabled:bg-pk-neutral disabled:text-pk-muted",
          buttonPressClassName,
        )}
      >
        {isStarting ? "시작하는 중…" : "경기 시작"}
      </button>
      {error ? (
        <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
          {error}
        </p>
      ) : null}
    </article>
  );
};

export default RecommendationCard;
