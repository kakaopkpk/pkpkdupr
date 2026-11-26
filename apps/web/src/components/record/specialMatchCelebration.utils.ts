import { getMatchTopLevelType, getWinningTeamIndex } from "@pkpkdupr/shared/match";
import type { SpecialMatchCelebration } from "@pkpkdupr/shared/specialMatch";
import type { SpecialMatchShareTarget } from "@/lib/specialMatchShare";
import type { MatchInfo } from "@/types/match";

/*
 * 특수 매치 큰 연출(SpecialMatchCelebrationScreen)의 시각과 공유 대상.
 * 시각(ms)은 연출이 뜬 시점 기준이다. 모양은 docs/design.md "특수 매치"의 큰 연출을 따른다.
 */

/** 얼굴 묶음이 튀어나와 자리 잡은 뒤 잠깐 멈췄다가 장면을 시작한다 */
export const SCENE_START_MS = 900;
/** 라이벌전 승리: 공격 쪽 칩이 한 칸 오르는 박자 */
export const RIVAL_STEP_MS = 500;
/** 라이벌전 승리: 넘어서는 박자에 지키던 쪽 얼굴이 흐려지는 시간 */
export const RIVAL_PASS_MS = 350;
/** 손바닥 도장이 떨어지는 시간. index.css `--animate-pk-stamp-drop` 길이와 같아야 한다 */
const STAMP_DROP_MS = 520;
/** 도장이 박힌 뒤 연승 테두리가 흐려져 사라지는 시간 */
export const STREAK_RING_FADE_MS = 500;
/** 최강자전: 진 쪽에 도장이 박힌 뒤 이긴 쪽 테두리가 타오르기까지 */
const CHAMPIONS_FLARE_AFTER_IMPACT_MS = 600;
const CHAMPIONS_FLARE_MS = 400;

/** 도전 성공: 도장이 박힌 뒤 설명 줄이 떠오르기까지 */
const CHALLENGE_IMPACT_SETTLE_MS = 500;

/** 도장이 박히는 시각 */
const STAMP_IMPACT_MS = SCENE_START_MS + STAMP_DROP_MS;
const CHAMPIONS_FLARE_START_MS = STAMP_IMPACT_MS + CHAMPIONS_FLARE_AFTER_IMPACT_MS;

/** 공격 쪽이 지키던 쪽과 1 차이가 될 때까지 한 칸씩 오르는 횟수. 이미 1 차이 이내면 0 */
export const getRivalCountSteps = (
  celebration: Extract<SpecialMatchCelebration, { kind: "rival" }>,
): number => Math.max(0, celebration.attacker.rankBefore - celebration.defender.rankBefore - 1);

/**
 * 장면 박자 시각. 라이벌전 승리는 한 칸씩 오르는 박자들 뒤 넘어서기 한 번(두 칩이 경기 뒤 순위가 됨),
 * 연승 저지·도전 성공은 도장 떨어지기 시작·박힘, 최강자전은 그 뒤 이긴 쪽 테두리 타오름이다
 */
export const getSceneBeatTimes = (celebration: SpecialMatchCelebration): number[] => {
  switch (celebration.kind) {
    case "rival": {
      const steps = getRivalCountSteps(celebration);
      return Array.from({ length: steps + 1 }, (_, index) => SCENE_START_MS + RIVAL_STEP_MS * index);
    }
    case "streak_stopper":
    case "challenge":
      return [SCENE_START_MS, STAMP_IMPACT_MS];
    case "champions":
      return [SCENE_START_MS, STAMP_IMPACT_MS, CHAMPIONS_FLARE_START_MS];
  }
};

/** 장면이 끝나는 시각. 설명 줄은 이때 떠오른다 */
export const getSceneEndMs = (celebration: SpecialMatchCelebration): number => {
  const beats = getSceneBeatTimes(celebration);
  const lastBeat = beats[beats.length - 1];
  switch (celebration.kind) {
    case "rival":
      return lastBeat + RIVAL_PASS_MS;
    case "streak_stopper":
      return lastBeat + STREAK_RING_FADE_MS;
    // 도전 성공은 흐려질 테두리가 없어 도장 충격 고리가 퍼지는 동안만 기다린다
    case "challenge":
      return lastBeat + CHALLENGE_IMPACT_SETTLE_MS;
    case "champions":
      return lastBeat + CHAMPIONS_FLARE_MS;
  }
};

/** 기록한 회원이 이긴 팀에 있을 때만 큰 연출을 띄운다. 진 팀·경기하지 않은 기록자·승패 없음은 false */
export const isViewerOnWinningTeam = (
  match: Pick<MatchInfo, "teams" | "scores">,
  viewerId: string | null | undefined,
): boolean => {
  if (!viewerId) return false;
  const winningTeamIndex = getWinningTeamIndex(match);
  if (winningTeamIndex == null) return false;
  return match.teams[winningTeamIndex].players.some((player) => player.id === viewerId);
};

/** 큰 연출 데이터를 "이미지로 공유" 대상으로 옮긴다. 순위·연승 수·평점 차는 응답 값만 쓴다 */
export const toSpecialMatchShareTarget = (
  celebration: SpecialMatchCelebration,
  match: Pick<MatchInfo, "id" | "type" | "completedAt" | "matchStartsAt" | "session">,
  username: string,
): SpecialMatchShareTarget => {
  const base = {
    matchId: match.id,
    username,
    playedAt: match.completedAt ?? match.matchStartsAt,
    sessionName: match.session?.name ?? null,
  };
  switch (celebration.kind) {
    case "rival": {
      const { attacker, defender } = celebration;
      return {
        ...base,
        kind: "rival",
        category: getMatchTopLevelType(match.type),
        winner: {
          player: attacker.player,
          rank: attacker.rankAfter,
          change: attacker.rankBefore - attacker.rankAfter,
        },
        passed: {
          player: defender.player,
          rank: defender.rankAfter,
          change: defender.rankAfter - defender.rankBefore,
        },
      };
    }
    case "streak_stopper":
      return {
        ...base,
        kind: "streak-break",
        loser: celebration.stopped.player,
        brokenStreak: celebration.stopped.streakBefore,
      };
    case "champions":
      return {
        ...base,
        kind: "king-win",
        winner: celebration.winner.player,
        winnerStreak: celebration.winner.streakBefore + 1,
        loser: celebration.loser.player,
        brokenStreak: celebration.loser.streakBefore,
      };
    case "challenge":
      return {
        ...base,
        kind: "challenge-win",
        defeated: celebration.defeated,
        ratingGap: celebration.ratingGap,
      };
  }
};
