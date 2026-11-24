import React from "react";
import type {
  SpecialMatchCelebration,
  SpecialMatchCelebrationPlayer,
} from "@pkpkdupr/shared/specialMatch";
import { RankChange } from "@/components/ui/Delta";
import { FlameIcon } from "@/components/ui/Icons";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SpecialMatchIcon } from "@/components/ui/SpecialMatchLabel";
import { cx } from "@/components/ui/cx";
import { STREAK_END_LABEL, VS_LABEL } from "@/lib/specialMatchShare";
import {
  RIVAL_PASS_MS,
  STREAK_RING_FADE_MS,
  getRivalCountSteps,
} from "./specialMatchCelebration.utils";

/*
 * 특수 매치 큰 연출의 그림(얼굴·칩·이름). 흰 카드 없이 어두운 딤 위에 바로 놓고, 주인공 얼굴 뒤에 앰버 빛줄기·후광을 깐다.
 * beatCount는 지나간 장면 박자 수(getSceneBeatTimes)이고, 움직임 줄이기면 처음부터 박자를 다 지난 값이 들어와 마지막 장면만 보인다.
 * 배치 값은 끝 화면이 같아야 하는 공유 이미지(record/specialMatchShareImage)와 맞춘다.
 */

const ms = (value: number) => `${value}ms`;

// 딤이 깔린 뒤 얼굴·칩 묶음이 튀어나온다
const GRAPHIC_DELAY_MS = 150;
const NAME_DELAY_MS = 300;
const NAME_FADE_MS = 380;
const RAYS_IN_DELAY_MS = 100;
const RAYS_SPIN_MS = 24000;

/**
 * 주인공 얼굴 뒤 빛줄기·후광. 얼굴 크기 상자 안에 두면 그 가운데가 중심이다.
 * 튀어나오는 얼굴 묶음 밖에 둬서 같이 커지지 않고, 서서히 번지며 나타난 뒤 천천히 돈다. isPulsing이면 한 번 크게 퍼진다
 */
const SceneRays: React.FC<{ isPulsing?: boolean }> = ({ isPulsing = false }) => (
  <>
    {/* 회전은 바깥, 나타남·퍼짐은 안쪽 요소가 맡아 transform이 겹치지 않는다 */}
    <span
      aria-hidden="true"
      className="absolute top-1/2 left-1/2 -mt-[260px] -ml-[260px] size-[520px] animate-pk-spin-slow motion-reduce:animate-none"
      style={{ animationDuration: ms(RAYS_SPIN_MS) }}
    >
      <span
        className={cx(
          "pk-celebration-rays block size-full rounded-full motion-reduce:animate-none",
          isPulsing ? "animate-pk-rays-pulse" : "animate-pk-rays-in",
        )}
        style={isPulsing ? undefined : { animationDelay: ms(RAYS_IN_DELAY_MS) }}
      />
    </span>
    <span
      aria-hidden="true"
      className="pk-celebration-glow absolute top-1/2 left-1/2 -mt-[150px] -ml-[150px] size-[300px] animate-pk-glow-in rounded-full motion-reduce:animate-none"
      style={{ animationDelay: ms(RAYS_IN_DELAY_MS) }}
    />
  </>
);

/** 얼굴·칩 묶음. 딤이 깔린 뒤 튀어나온다 */
const PopIn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    className="relative inline-flex animate-pk-celebrate-pop motion-reduce:animate-none"
    style={{ animationDelay: ms(GRAPHIC_DELAY_MS) }}
  >
    {children}
  </span>
);

/** 얼굴 아래 이름. 묶음보다 조금 늦게 떠오른다. relative는 앞의 빛줄기보다 위에 그리기 위해서다 */
const SceneName: React.FC<{ name: string; className: string }> = ({ name, className }) => (
  <p
    className={cx(
      "relative max-w-full animate-pk-fade-up truncate font-extrabold motion-reduce:animate-none",
      className,
    )}
    style={{ animationDelay: ms(NAME_DELAY_MS), animationDuration: ms(NAME_FADE_MS) }}
  >
    {name}
  </p>
);

// ------------------------------------------------------------------ 라이벌전 승리 --

const RIVAL_AVATAR = 88;

/** 얼굴 아래에 걸친 "N위" 칩. 이긴 쪽은 흰 바탕, 넘은 쪽은 회색 바탕이다. change가 0이면 ▲▼를 쓰지 않는다 */
const RankChip: React.FC<{ rank: number; change: number; isWinner: boolean; animate: boolean }> = ({
  rank,
  change,
  isWinner,
  animate,
}) => (
  <span
    className={cx(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-pk-12 leading-[18px] font-extrabold whitespace-nowrap tabular-nums",
      isWinner ? "bg-white text-pk-ink" : "bg-pk-neutral text-pk-sub",
      animate && "animate-pk-pop motion-reduce:animate-none",
    )}
  >
    {rank}위
    {change !== 0 ? <RankChange value={change} className="text-pk-12 font-extrabold" /> : null}
  </span>
);

/**
 * 라이벌전 승리: 이긴 사람(공격 쪽, 왼쪽)과 넘은 사람(지키던 쪽, 오른쪽) 얼굴이 나란히 선다.
 * 두 칩은 경기 전 순위로 시작해 공격 쪽 칩이 박자마다 한 칸씩 오르고(▲ 함께 증가),
 * 마지막 박자에 두 칩이 경기 뒤 순위가 되며 지키던 쪽 얼굴이 흐려지고 빛줄기가 한 번 크게 퍼진다
 */
export const RivalScene: React.FC<{
  celebration: Extract<SpecialMatchCelebration, { kind: "rival" }>;
  beatCount: number;
}> = ({ celebration, beatCount }) => {
  const { attacker, defender } = celebration;
  const steps = getRivalCountSteps(celebration);
  const isPassed = beatCount > steps;
  const attackerRank = isPassed
    ? attacker.rankAfter
    : attacker.rankBefore - Math.min(beatCount, steps);
  const defenderRank = isPassed ? defender.rankAfter : defender.rankBefore;
  const avatarBox = { width: RIVAL_AVATAR, height: RIVAL_AVATAR };

  return (
    <div className="grid w-full max-w-[300px] grid-cols-2 gap-6">
      <div className="flex min-w-0 flex-col items-center gap-[22px]">
        <span className="relative inline-flex" style={avatarBox}>
          <SceneRays isPulsing={isPassed} />
          <PopIn>
            {isPassed ? (
              <span
                aria-hidden="true"
                className="absolute -inset-1 animate-pk-ping rounded-full border-3 border-pk-hl opacity-0 motion-reduce:hidden"
                style={{ animationDuration: ms(700), animationIterationCount: 1, animationFillMode: "forwards" }}
              />
            ) : null}
            <PlayerAvatar player={attacker.player} size={RIVAL_AVATAR} className="relative" />
            <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2">
              <RankChip
                key={`${attackerRank}-${isPassed}`}
                rank={attackerRank}
                change={attacker.rankBefore - attackerRank}
                isWinner
                animate={attackerRank !== attacker.rankBefore}
              />
            </span>
          </PopIn>
        </span>
        <SceneName name={attacker.player.username} className="text-pk-17 leading-[22px] text-white" />
      </div>
      <div className="flex min-w-0 flex-col items-center gap-[22px]">
        <PopIn>
          <span
            className={cx(
              "relative inline-flex transition-opacity ease-pk-move motion-reduce:transition-none",
              isPassed && "opacity-55",
            )}
            style={{ transitionDuration: ms(RIVAL_PASS_MS) }}
          >
            <PlayerAvatar player={defender.player} size={RIVAL_AVATAR} />
          </span>
          <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2">
            <RankChip
              key={`${defenderRank}-${isPassed}`}
              rank={defenderRank}
              change={defender.rankBefore - defenderRank}
              isWinner={false}
              animate={isPassed}
            />
          </span>
        </PopIn>
        <SceneName name={defender.player.username} className="text-pk-17 leading-[22px] text-white/78" />
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

interface StreakRing {
  /** 얼굴과 테두리 사이 투명 틈 */
  gap: number;
  width: number;
  /** 테두리 바깥 앰버 빛 */
  glowClassName: string;
}

const TAG_HEIGHT = 24;
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
 * 연승 회원 큰 아바타. 투명 틈을 두고 앰버 연승 테두리를 두르고, 아래에 "N연승" 태그를 건다.
 * isEnded면 테두리가 제자리에서 흐려져 사라지고 얼굴이 회색, 태그가 "연승 끝"이 된다.
 * isFlaring이면 테두리가 한 번 타오른다(빛이 번졌다 사라지고 고리가 퍼짐)
 */
const StreakProfileAvatar: React.FC<{
  player: SpecialMatchCelebrationPlayer;
  size: number;
  ring: StreakRing;
  streak: number;
  isEnded: boolean;
  /** 태그 내용이 바뀌면 톡 튀며 바뀐다 */
  animateTag: boolean;
  isFlaring?: boolean;
  stamp?: StampLayout;
}> = ({ player, size, ring, streak, isEnded, animateTag, isFlaring = false, stamp }) => {
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
          "absolute rounded-full border-pk-hl",
          ring.glowClassName,
          isEnded && "animate-pk-fade-out motion-reduce:hidden",
        )}
        style={{ inset: -outer, borderWidth: ring.width, animationDuration: ms(STREAK_RING_FADE_MS) }}
      />
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
      <span className="absolute inset-x-0 flex justify-center" style={{ top: size + TAG_DROP - TAG_HEIGHT }}>
        <span
          key={tagLabel}
          className={cx(
            "inline-flex h-6 items-center gap-px rounded-full text-pk-13 leading-none font-extrabold whitespace-nowrap tabular-nums",
            isEnded ? "bg-pk-neutral px-2 text-pk-sub" : "bg-pk-hl pr-2 pl-1.5 text-pk-ink",
            animateTag && "animate-pk-pop motion-reduce:animate-none",
          )}
        >
          {isEnded ? null : <FlameIcon size={13} />}
          {tagLabel}
        </span>
      </span>
      {stamp ? <StopStamp stamp={stamp} /> : null}
    </span>
  );
};

const getStampPhase = (beatCount: number): StampPhase =>
  beatCount >= 2 ? "landed" : beatCount >= 1 ? "falling" : "hidden";

/** 도장이 박히면 그 얼굴 묶음만 흔들린다(빛줄기는 제자리) */
const ShakeOnImpact: React.FC<{ isShaking: boolean; children: React.ReactNode }> = ({ isShaking, children }) => (
  <span className={cx("relative inline-flex", isShaking && "animate-pk-shake motion-reduce:animate-none")}>
    {children}
  </span>
);

// ------------------------------------------------------------------ 연승 저지 --

const STOPPER_AVATAR = 112;
const STOPPER_STAMP = 72;
const STOPPER_RING: StreakRing = {
  gap: 3,
  width: 5,
  glowClassName: "shadow-[0_0_14px_2px_color-mix(in_srgb,var(--color-pk-hl)_50%,transparent)]",
};

/** 연승 저지: 연승자 큰 프로필과 이름만. 도장이 얼굴 오른쪽 아래에 박히면 연승이 끝난다 */
export const StreakStopperScene: React.FC<{
  celebration: Extract<SpecialMatchCelebration, { kind: "streak_stopper" }>;
  beatCount: number;
}> = ({ celebration, beatCount }) => {
  const { player, streakBefore } = celebration.stopped;
  const isEnded = beatCount >= 2;
  return (
    <div className="flex w-full flex-col items-center gap-[22px]">
      <span className="relative inline-flex" style={{ width: STOPPER_AVATAR, height: STOPPER_AVATAR }}>
        <SceneRays />
        <PopIn>
          <ShakeOnImpact isShaking={isEnded}>
            <StreakProfileAvatar
              player={player}
              size={STOPPER_AVATAR}
              ring={STOPPER_RING}
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
          </ShakeOnImpact>
        </PopIn>
      </span>
      <SceneName name={player.username} className="text-pk-22 leading-[26px] text-white" />
    </div>
  );
};

// ------------------------------------------------------------------ 최강자전 --

const CHAMPIONS_AVATAR = 96;
const CHAMPIONS_STAMP = 54;
const CHAMPIONS_RING: StreakRing = {
  gap: 3.5,
  width: 3.5,
  glowClassName: "shadow-[0_0_18px_color-mix(in_srgb,var(--color-pk-hl)_60%,transparent)]",
};
// 최강자전 이름 글자 크기(docs/design.md "특수 매치"). 글자 크기 예외다
const CHAMPIONS_NAME_CLASS_NAME = "text-[18px] leading-[22px]";

/**
 * 최강자전 승리: 이긴 쪽(왼쪽)과 진 쪽(오른쪽) 연승 회원이 같은 크기로 마주 본다.
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
    <div className="flex w-full max-w-[310px] items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-[22px]">
        <span className="relative inline-flex" style={{ width: CHAMPIONS_AVATAR, height: CHAMPIONS_AVATAR }}>
          <SceneRays />
          <PopIn>
            <StreakProfileAvatar
              player={winner.player}
              size={CHAMPIONS_AVATAR}
              ring={CHAMPIONS_RING}
              streak={isWinnerFlared ? winner.streakBefore + 1 : winner.streakBefore}
              isEnded={false}
              animateTag={isWinnerFlared}
              isFlaring={isWinnerFlared}
            />
          </PopIn>
        </span>
        <SceneName name={winner.player.username} className={cx(CHAMPIONS_NAME_CLASS_NAME, "text-white")} />
      </div>
      {/* 글자 세로 가운데를 아바타 세로 가운데(48)에 맞춘다 */}
      <span
        aria-hidden="true"
        className="relative mt-[37px] shrink-0 text-pk-15 leading-[22px] font-extrabold tracking-[0.5px] text-white/45"
      >
        {VS_LABEL}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-[22px]">
        <PopIn>
          <ShakeOnImpact isShaking={isLoserEnded}>
            <StreakProfileAvatar
              player={loser.player}
              size={CHAMPIONS_AVATAR}
              ring={CHAMPIONS_RING}
              streak={loser.streakBefore}
              isEnded={isLoserEnded}
              animateTag={isLoserEnded}
              stamp={{
                size: CHAMPIONS_STAMP,
                ring: 3,
                iconSize: 28,
                // 아바타 오른쪽 끝에서 22 밖, 아래 끝에서 14 위에 도장 끝이 온다
                left: CHAMPIONS_AVATAR + 22 - CHAMPIONS_STAMP,
                top: CHAMPIONS_AVATAR - 14 - CHAMPIONS_STAMP,
                phase: getStampPhase(beatCount),
              }}
            />
          </ShakeOnImpact>
        </PopIn>
        <SceneName name={loser.player.username} className={cx(CHAMPIONS_NAME_CLASS_NAME, "text-white/78")} />
      </div>
    </div>
  );
};
