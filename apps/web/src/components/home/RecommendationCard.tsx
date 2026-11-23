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
  TEAM_AVATAR_OVERLAP,
  type SessionWinStreakByPlayer,
} from "@/components/ui/PlayerAvatar";
import { SpecialMatchIcon } from "@/components/ui/SpecialMatchLabel";
import {
  SessionWinStreakFrame,
  WinStreakAvatarFrame,
} from "@/components/ui/WinStreakAvatarFrame";
import { cx } from "@/components/ui/cx";
import { formatRating } from "@/utils/dupr";

type CellTone = "defending" | "plain";
type CellSide = "left" | "right";

const CELL_BACKGROUND: Record<CellTone, string> = {
  defending: "var(--color-pk-primary-soft)",
  plain: "var(--color-pk-bg)",
};

/** 두 칸을 대각선으로 나눈다. 가운데 2% 폭의 흰 틈을 남긴다 */
const CELL_CLIP_PATH: Record<CellSide, string> = {
  left: "polygon(0 0, 55% 0, 45% 100%, 0 100%)",
  right: "polygon(57% 0, 100% 0, 100% 100%, 47% 100%)",
};

interface CourtCell {
  players: readonly [RecommendationPlayer, RecommendationPlayer];
  /** 앞세울 주인공. 없으면 두 사람을 같은 크기로 둔다 */
  protagonist: RecommendationPlayer | null;
  tone: CellTone;
  /** 순위 칩 모양. 도전 매치 주인공만 있다 */
  rankChip: "defending" | "attacking" | null;
  /** 주인공 아바타에 연승 링을 두르고 평점을 숨긴다(연승 저지·최강자전) */
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
    const tone: CellTone =
      special?.kind === "champions" || isDefending ? "defending" : "plain";
    return {
      players: protagonist
        ? [protagonist, players.find((player) => player !== protagonist)!]
        : players,
      protagonist,
      tone,
      rankChip:
        special?.kind === "challenge" && protagonist
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

/** 세션 연승 링(태그 없음). 들지 않은 회원은 아바타만 */
const SessionAvatar: React.FC<{
  player: RecommendationPlayer;
  size: number;
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({ player, size, sessionWinStreaks }) => (
  <SessionWinStreakFrame winStreak={sessionWinStreaks?.get(player.id)}>
    <PlayerAvatar player={player} size={size} />
  </SessionWinStreakFrame>
);

/** 앞 아바타가 뒤 아바타를 덮고, 칸 바탕색 테로 겹친 곳을 띄운다. 오른쪽 칸은 앞 아바타가 바깥(오른쪽)이다 */
const CellAvatars: React.FC<{
  cell: CourtCell;
  side: CellSide;
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({ cell, side, sessionWinStreaks }) => {
  const [front, back] = cell.players;
  const frontSize = cell.protagonist ? 40 : 32;
  const backSize = cell.protagonist ? 28 : 32;
  const gapColor = CELL_BACKGROUND[cell.tone];
  // 연승 링(WIN_STREAK_DISPLAY_MIN 이상)을 두르는 주인공은 세션 연승 링을 겹쳐 두르지 않는다
  const frontAvatar =
    cell.protagonist &&
    cell.showsStreak &&
    front.winStreak >= WIN_STREAK_DISPLAY_MIN ? (
      <WinStreakAvatarFrame winStreak={front.winStreak} size="sm">
        <PlayerAvatar player={front} size={frontSize} />
      </WinStreakAvatarFrame>
    ) : (
      <SessionAvatar
        player={front}
        size={frontSize}
        sessionWinStreaks={sessionWinStreaks}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center",
        side === "right" && "flex-row-reverse",
      )}
    >
      <span
        className="relative z-10 inline-flex rounded-full"
        style={{ boxShadow: `0 0 0 2px ${gapColor}` }}
      >
        {frontAvatar}
      </span>
      <span
        className="inline-flex rounded-full"
        style={
          side === "left"
            ? { marginLeft: -TEAM_AVATAR_OVERLAP }
            : { marginRight: -TEAM_AVATAR_OVERLAP }
        }
      >
        <SessionAvatar
          player={back}
          size={backSize}
          sessionWinStreaks={sessionWinStreaks}
        />
      </span>
    </span>
  );
};

const RankChip: React.FC<{ rank: number; tone: "defending" | "attacking" }> = ({
  rank,
  tone,
}) => (
  <span
    className={cx(
      "inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-pk-12 leading-none font-bold tabular-nums",
      tone === "defending"
        ? "bg-pk-primary text-white"
        : "bg-white text-pk-sub",
    )}
  >
    {rank}위
  </span>
);

const CourtCellContent: React.FC<{
  cell: CourtCell;
  side: CellSide;
  sessionWinStreaks?: SessionWinStreakByPlayer;
}> = ({ cell, side, sessionWinStreaks }) => {
  const [front, back] = cell.players;
  const alignClassName = side === "left" ? "items-start text-left" : "items-end text-right";
  return (
    <div className={cx("flex min-w-0 flex-col gap-2", alignClassName)}>
      <CellAvatars cell={cell} side={side} sessionWinStreaks={sessionWinStreaks} />
      <div className={cx("flex w-full min-w-0 flex-col", alignClassName)}>
        {cell.protagonist ? (
          <>
            <span className="w-full truncate text-pk-15 leading-[1.35] font-bold text-pk-ink">
              {front.username}
            </span>
            <span className="w-full truncate text-pk-13 leading-[1.35] text-pk-sub">
              {back.username}
            </span>
            {cell.rankChip ? (
              <span
                className={cx(
                  "mt-1 flex max-w-full items-center gap-1",
                  side === "right" && "flex-row-reverse",
                )}
              >
                {front.doublesRank !== null ? (
                  <RankChip rank={front.doublesRank} tone={cell.rankChip} />
                ) : null}
                <span className="truncate text-pk-12 text-pk-muted tabular-nums">
                  {formatRating(front.doublesRating)}
                </span>
              </span>
            ) : null}
          </>
        ) : (
          cell.players.map((player) => (
            <span
              key={player.id}
              className="w-full truncate text-pk-15 leading-[1.35] font-bold text-pk-ink"
            >
              {player.username}
            </span>
          ))
        )}
      </div>
    </div>
  );
};

/**
 * 추천 코트 카드(docs/design.md "특수 매치"의 추천 매칭 카드). 두 팀 칸이 대각선으로 나뉘고
 * 가운데에 블루 VS 원, 특수 유형이면 그 위에 흰 유형 알약, 아래에 전체 폭 "경기 시작" 버튼이다
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
    <article className="overflow-hidden rounded-pk-lg bg-white">
      <div className="relative">
        {(["left", "right"] as const).map((side, index) => (
          <span
            key={side}
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background: CELL_BACKGROUND[cells[index].tone],
              clipPath: CELL_CLIP_PATH[side],
            }}
          />
        ))}
        {/* 가운데 열은 VS 원과 유형 알약 자리다. 양쪽 칸 내용은 이 열을 넘지 않고 말줄임된다 */}
        <div className="relative grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-1 px-4 pt-5 pb-4">
          <CourtCellContent
            cell={cells[0]}
            side="left"
            sessionWinStreaks={sessionWinStreaks}
          />
          <span aria-hidden="true" />
          <CourtCellContent
            cell={cells[1]}
            side="right"
            sessionWinStreaks={sessionWinStreaks}
          />
        </div>
        {/* VS 원은 판 가운데에 고정하고, 유형 알약은 그 바로 위에 띄운다 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="relative inline-flex size-9 items-center justify-center rounded-full bg-pk-primary text-pk-12 font-extrabold text-white shadow-[0_0_0_3px_var(--color-white)]">
            VS
            {kind ? (
              <span className="absolute bottom-full left-1/2 mb-2 inline-flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-white px-2 py-1 text-pk-12 leading-none font-bold whitespace-nowrap text-pk-primary shadow-[0_1px_4px_rgb(0_0_0/0.08)]">
                <SpecialMatchIcon kind={kind} size={13} />
                {specialMatchKindLabels[kind]}
              </span>
            ) : null}
          </span>
        </div>
      </div>
      <button
        type="button"
        disabled={isStartDisabled}
        onClick={onStart}
        className={cx(
          "flex h-12 w-full items-center justify-center bg-pk-primary-soft text-pk-15 font-extrabold text-pk-primary touch-manipulation disabled:cursor-not-allowed disabled:bg-pk-neutral disabled:text-pk-muted",
          buttonPressClassName,
        )}
      >
        {isStarting ? "시작하는 중…" : "경기 시작"}
      </button>
      {error ? (
        <p role="alert" className="px-4 py-2.5 text-pk-13 font-medium text-pk-down">
          {error}
        </p>
      ) : null}
    </article>
  );
};

export default RecommendationCard;
