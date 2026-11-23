import React from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type {
  SpecialMatchCelebration,
  SpecialMatchCelebrationPlayer,
} from "@pkpkdupr/shared/specialMatch";
import { RankChange } from "@/components/ui/Delta";
import { FlameIcon } from "@/components/ui/Icons";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SpecialMatchIcon } from "@/components/ui/SpecialMatchLabel";
import { cx } from "@/components/ui/cx";
import { getRankingCategoryLabel, STREAK_END_LABEL, VS_LABEL } from "@/lib/specialMatchShare";
import {
  CHALLENGE_SWAP_MS,
  STREAK_RING_FADE_MS,
  getChallengeCountSteps,
} from "./specialMatchCelebration.utils";

/*
 * 특수 매치 큰 연출의 흰 카드 안 그림. beatCount는 지나간 장면 박자 수(getSceneBeatTimes)이고,
 * 움직임 줄이기면 처음부터 박자를 다 지난 값이 들어와 마지막 장면만 보인다.
 * 배치 값은 끝 화면이 같아야 하는 공유 이미지(record/specialMatchShareImage)와 맞춘다.
 */

const ms = (value: number) => `${value}ms`;

// ------------------------------------------------------------------ 도전 성공 --

const RANK_ROW_HEIGHT = 56;
const RANK_ROW_GAP = 4;

const ChallengeRankRow: React.FC<{
  player: SpecialMatchCelebrationPlayer;
  rank: number;
  change: number;
  offset: number;
  isChallenger: boolean;
  /** 한 칸 오를 때마다 순위 숫자가 톡 튄다 */
  isRankChanged: boolean;
  isFinal: boolean;
}> = ({ player, rank, change, offset, isChallenger, isRankChanged, isFinal }) => (
  <div
    className={cx(
      "absolute inset-x-0 top-0 grid grid-cols-[26px_32px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-pk-sm pr-3 pl-2 transition-transform ease-pk-move motion-reduce:transition-none",
      // 자리를 바꿀 때 도전한 쪽 줄이 위로 지나간다
      isChallenger &&
        "z-10 bg-pk-primary-soft shadow-[0_6px_16px_color-mix(in_srgb,var(--color-pk-ink)_12%,transparent)]",
    )}
    style={{
      height: RANK_ROW_HEIGHT,
      transform: `translateY(${offset}px)`,
      transitionDuration: ms(CHALLENGE_SWAP_MS),
    }}
  >
    <span
      key={rank}
      className={cx(
        "text-center text-pk-15 font-extrabold tabular-nums",
        isChallenger && isFinal ? "text-pk-primary" : "text-pk-muted",
        isRankChanged && "animate-pk-pop motion-reduce:animate-none",
      )}
    >
      {rank}
    </span>
    <PlayerAvatar player={player} size={32} />
    <span className="truncate text-pk-15 font-bold text-pk-ink">{player.username}</span>
    <RankChange value={change} className="text-pk-13 font-extrabold" />
  </div>
);

/**
 * 도전 성공: 랭킹 줄 모양 두 줄(지키던 쪽 위, 도전한 쪽 아래). 도전한 쪽 순위가 박자마다 한 칸씩 오르고,
 * 지키던 쪽과 1 차이가 되면 다음 박자에 두 줄이 자리를 바꾸며 두 사람 순위·▲▼가 최종값이 된다
 */
export const ChallengeScene: React.FC<{
  celebration: Extract<SpecialMatchCelebration, { kind: "challenge" }>;
  category: MatchTopLevelType;
  beatCount: number;
}> = ({ celebration, category, beatCount }) => {
  const { challenger, defender } = celebration;
  const steps = getChallengeCountSteps(celebration);
  const isSwapped = beatCount > steps;
  const challengerRank = isSwapped
    ? challenger.rankAfter
    : challenger.rankBefore - Math.min(beatCount, steps);
  const defenderRank = isSwapped ? defender.rankAfter : defender.rankBefore;
  const lowerOffset = RANK_ROW_HEIGHT + RANK_ROW_GAP;

  return (
    <div className="px-2.5 pt-3 pb-2.5">
      <p className="px-2 pb-1 text-pk-12 leading-[18px] font-bold text-pk-muted">
        {getRankingCategoryLabel(category)}
      </p>
      <div className="relative mt-1" style={{ height: RANK_ROW_HEIGHT * 2 + RANK_ROW_GAP }}>
        <ChallengeRankRow
          player={defender.player}
          rank={defenderRank}
          change={defender.rankBefore - defenderRank}
          offset={isSwapped ? lowerOffset : 0}
          isChallenger={false}
          isRankChanged={false}
          isFinal={isSwapped}
        />
        <ChallengeRankRow
          player={challenger.player}
          rank={challengerRank}
          change={challenger.rankBefore - challengerRank}
          offset={isSwapped ? 0 : lowerOffset}
          isChallenger
          isRankChanged={challengerRank !== challenger.rankBefore}
          isFinal={isSwapped}
        />
      </div>
    </div>
  );
};

// ------------------------------------------------------------- 연승 프로필 --

type StampPhase = "hidden" | "falling" | "landed";

interface StampLayout {
  /** 블루 원 지름 */
  size: number;
  /** 흰 링 굵기 */
  ring: number;
  iconSize: number;
  /** 아바타 왼쪽 위 기준 도장 왼쪽 위 */
  left: number;
  top: number;
  phase: StampPhase;
}

const TAG_SIZE = {
  // 아바타 112(연승 저지)
  md: { height: 24, className: "h-6 pr-2 pl-1.5 text-pk-13", flame: 13 },
  // 아바타 80(최강자전)
  sm: { height: 22, className: "h-[22px] pr-[7px] pl-[5px] text-pk-12", flame: 12 },
} as const;
// 태그 아래 끝이 아바타 아래 끝보다 이만큼 내려온다
const TAG_DROP = 12;

/** 글자 없는 꽉 찬 블루 원에 흰 손바닥(SpecialMatchIcon streak_stopper와 같은 그림). 박히는 순간 충격 고리가 퍼진다 */
const StopStamp: React.FC<{ stamp: StampLayout }> = ({ stamp }) => {
  if (stamp.phase === "hidden") return null;
  const box: React.CSSProperties = {
    left: stamp.left,
    top: stamp.top,
    width: stamp.size,
    height: stamp.size,
  };
  return (
    <>
      {stamp.phase === "landed" ? (
        <span
          aria-hidden="true"
          className="absolute animate-pk-ping rounded-full border-3 border-pk-primary opacity-0 motion-reduce:hidden"
          style={{
            ...box,
            animationDuration: ms(650),
            animationIterationCount: 1,
            animationFillMode: "forwards",
          }}
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cx(
          "absolute z-10 inline-flex items-center justify-center rounded-full bg-pk-primary text-white",
          stamp.phase === "falling" && "animate-pk-stamp-drop motion-reduce:animate-none",
        )}
        style={{
          ...box,
          boxShadow: `0 0 0 ${stamp.ring}px var(--color-white), 0 10px 24px color-mix(in srgb, var(--color-pk-primary) 35%, transparent)`,
        }}
      >
        <span className="inline-flex -rotate-10">
          <SpecialMatchIcon kind="streak_stopper" size={stamp.iconSize} />
        </span>
      </span>
    </>
  );
};

/**
 * 연승 회원 큰 아바타. 앰버 연승 테두리(흰 틈 + 링)와 아래 "N연승" 태그를 두른다.
 * isEnded면 테두리가 제자리에서 흐려져 사라지고 얼굴이 회색, 태그가 "연승 끝"이 된다.
 * isFlaring이면 테두리가 한 번 타오른다(빛이 번졌다 사라지고 고리가 퍼짐)
 */
const StreakProfileAvatar: React.FC<{
  player: SpecialMatchCelebrationPlayer;
  size: number;
  ring: { gap: number; width: number };
  tagSize: keyof typeof TAG_SIZE;
  streak: number;
  isEnded: boolean;
  /** 태그 내용이 바뀌면 톡 튀며 바뀐다 */
  animateTag: boolean;
  isFlaring?: boolean;
  /** 테두리 바깥 앰버 빛 */
  glow?: boolean;
  stamp?: StampLayout;
}> = ({ player, size, ring, tagSize, streak, isEnded, animateTag, isFlaring = false, glow = false, stamp }) => {
  const tag = TAG_SIZE[tagSize];
  const outer = ring.gap + ring.width;
  const tagLabel = isEnded ? STREAK_END_LABEL : `${streak}연승`;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {isFlaring ? (
        <span
          aria-hidden="true"
          className="pk-celebration-glow absolute animate-pk-flash rounded-full motion-reduce:hidden"
          style={{ inset: -size * 0.45, animationDuration: ms(900) }}
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cx(
          "absolute rounded-full bg-pk-hl",
          glow && "shadow-[0_0_14px_2px_color-mix(in_srgb,var(--color-pk-hl)_60%,transparent)]",
          isEnded && "animate-pk-fade-out motion-reduce:hidden",
        )}
        style={{ inset: -outer, animationDuration: ms(STREAK_RING_FADE_MS) }}
      />
      <span aria-hidden="true" className="absolute rounded-full bg-white" style={{ inset: -ring.gap }} />
      {isFlaring ? (
        <span
          aria-hidden="true"
          className="absolute animate-pk-ping rounded-full border-3 border-pk-hl opacity-0 motion-reduce:hidden"
          style={{
            inset: -outer,
            animationDuration: ms(700),
            animationIterationCount: 1,
            animationFillMode: "forwards",
          }}
        />
      ) : null}
      <PlayerAvatar player={player} size={size} className={cx("relative", isEnded && "grayscale")} />
      <span className="absolute inset-x-0 flex justify-center" style={{ top: size + TAG_DROP - tag.height }}>
        <span
          key={tagLabel}
          className={cx(
            "inline-flex items-center gap-px rounded-full leading-none font-extrabold whitespace-nowrap tabular-nums shadow-[0_0_0_3px_var(--color-white)]",
            tag.className,
            isEnded ? "bg-pk-neutral text-pk-sub" : "bg-pk-hl text-pk-ink",
            animateTag && "animate-pk-pop motion-reduce:animate-none",
          )}
        >
          {isEnded ? null : <FlameIcon size={tag.flame} />}
          {tagLabel}
        </span>
      </span>
      {stamp ? <StopStamp stamp={stamp} /> : null}
    </span>
  );
};

const getStampPhase = (beatCount: number): StampPhase =>
  beatCount >= 2 ? "landed" : beatCount >= 1 ? "falling" : "hidden";

// ------------------------------------------------------------------ 연승 저지 --

const STOPPER_AVATAR = 112;
const STOPPER_STAMP = 72;

/** 연승 저지: 연승자 큰 프로필과 이름만. 도장이 얼굴 오른쪽 아래에 박히면 연승이 끝난다 */
export const StreakStopperScene: React.FC<{
  celebration: Extract<SpecialMatchCelebration, { kind: "streak_stopper" }>;
  beatCount: number;
}> = ({ celebration, beatCount }) => {
  const { player, streakBefore } = celebration.stopped;
  const isEnded = beatCount >= 2;
  return (
    <div className="flex flex-col items-center px-3.5 pt-[30px] pb-6">
      <StreakProfileAvatar
        player={player}
        size={STOPPER_AVATAR}
        ring={{ gap: 3, width: 5 }}
        tagSize="md"
        streak={streakBefore}
        isEnded={isEnded}
        animateTag={isEnded}
        stamp={{
          size: STOPPER_STAMP,
          ring: 4,
          iconSize: 38,
          // 아바타 오른쪽 끝에서 26 밖, 아래 끝에서 18 위에 도장 끝이 온다
          left: STOPPER_AVATAR + 26 - STOPPER_STAMP,
          top: STOPPER_AVATAR - 18 - STOPPER_STAMP,
          phase: getStampPhase(beatCount),
        }}
      />
      <p className="mt-[22px] max-w-full truncate text-pk-22 leading-[26px] font-extrabold text-pk-ink">
        {player.username}
      </p>
    </div>
  );
};

// ------------------------------------------------------------------ 최강자전 --

const CHAMPIONS_AVATAR = 80;
const CHAMPIONS_STAMP = 46;
const CHAMPIONS_RING = { gap: 3.5, width: 3.5 };

const ChampionsColumn: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => (
  <div className="flex min-w-0 flex-1 flex-col items-center">
    {children}
    <p className="mt-5 max-w-full truncate text-pk-17 leading-[25px] font-extrabold text-pk-ink">{name}</p>
  </div>
);

/**
 * 최강자전 승리: 이긴 쪽(왼쪽)과 진 쪽(오른쪽) 연승 회원이 마주 본다.
 * 진 쪽에 도장이 박혀 연승이 끝나고, 이어서 이긴 쪽 테두리가 타오르며 태그가 N → N+1연승이 된다
 */
export const ChampionsScene: React.FC<{
  celebration: Extract<SpecialMatchCelebration, { kind: "champions" }>;
  beatCount: number;
}> = ({ celebration, beatCount }) => {
  const { winner, loser } = celebration;
  const isLoserEnded = beatCount >= 2;
  const isWinnerFlared = beatCount >= 3;
  return (
    <div className="flex items-start gap-1.5 px-3 pt-[30px] pb-[22px]">
      <ChampionsColumn name={winner.player.username}>
        <StreakProfileAvatar
          player={winner.player}
          size={CHAMPIONS_AVATAR}
          ring={CHAMPIONS_RING}
          tagSize="sm"
          streak={isWinnerFlared ? winner.streakBefore + 1 : winner.streakBefore}
          isEnded={false}
          animateTag={isWinnerFlared}
          isFlaring={isWinnerFlared}
          glow
        />
      </ChampionsColumn>
      {/* 아바타 세로 가운데에 둔다 */}
      <span
        aria-hidden="true"
        className="mt-6 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-pk-bg text-pk-12 font-extrabold text-pk-muted"
      >
        {VS_LABEL}
      </span>
      <ChampionsColumn name={loser.player.username}>
        <StreakProfileAvatar
          player={loser.player}
          size={CHAMPIONS_AVATAR}
          ring={CHAMPIONS_RING}
          tagSize="sm"
          streak={loser.streakBefore}
          isEnded={isLoserEnded}
          animateTag={isLoserEnded}
          stamp={{
            size: CHAMPIONS_STAMP,
            ring: 3,
            iconSize: 24,
            // 아바타 오른쪽 끝에서 18 밖, 위 끝에서 10 아래에 도장 끝이 온다
            left: CHAMPIONS_AVATAR + 18 - CHAMPIONS_STAMP,
            top: 10,
            phase: getStampPhase(beatCount),
          }}
        />
      </ChampionsColumn>
    </div>
  );
};
