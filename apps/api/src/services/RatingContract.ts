import type { MatchScore, MatchType } from "@pkpkdupr/shared/match";
import type {
  PlayerDuprCategory,
  StoredPlayerDupr,
} from "@pkpkdupr/shared/player";

export interface MatchParticipantRatingInput {
  playerId: string;
  teamIndex: 0 | 1;
  /** 해당 경기를 처리하기 직전의 레이팅과 confidence 스냅샷 */
  state: StoredPlayerDupr;
}

/**
 * 한 경기를 재생하기 위한 알고리즘 공통 입력입니다.
 *
 * AuthService는 완료 경기를 시간순으로 정렬하고, 직전 경기의 출력 상태를
 * 다음 경기의 입력 상태로 전달합니다. 구현체는 전달받은 값을 직접 수정하지
 * 않고 참가자별 새 상태를 반환해야 합니다.
 */
export interface MatchReplayInput {
  type: MatchType;
  winnerTeamIndex: 0 | 1;
  participants: MatchParticipantRatingInput[];
  scores?: MatchScore[];
  inactiveElapsedMsByPlayerId?: Record<string, number>;
}

/**
 * 평점 알고리즘 구현체가 AuthService에 제공해야 하는 최소 계약입니다.
 *
 * AuthService의 전체 경기 재생, 공식 DUPR 보정, 미리보기 흐름은 이 계약만
 * 의존하므로 테스트에서는 계산식을 대역으로 바꿔 끼울 수 있습니다.
 */
export interface RatingServiceContract {
  /** 내부 레이팅이 공식 DUPR과 얼마나 가까운지 0~100으로 환산합니다. */
  getAccuracy(internalRating: number, officialRating: number): number;
  /** 공식값 반영 전 accuracy를 후속 경기 보정 가중치로 변환합니다. */
  getCorrectionWeight(preUpdateAccuracy: number | null): number;
  /** 한 경기의 모든 참가자를 같은 경기 전 상태에서 계산해 새 상태로 반환합니다. */
  replayMatch(
    match: MatchReplayInput,
    correctionWeightByPlayerId?: Record<string, number>,
  ): Record<string, StoredPlayerDupr>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 마지막 경기 후 14일까지는 confidence를 유지합니다. */
const CONFIDENCE_DECAY_GRACE_PERIOD_MS = 14 * DAY_MS;
/** 유예기간 이후 미참여 하루마다 감소하는 confidence입니다. */
const CONFIDENCE_DECAY_PER_DAY = 1.5;
const CONFIDENCE_DECAY_FLOOR = 0;

/**
 * 장기간 경기가 없었던 선수의 confidence를 경기 직전에 감쇠합니다.
 *
 * 저장된 confidence 자체를 매일 갱신하지 않고, 다음 경기를 재생하는 순간
 * 경과일을 계산하기 때문에 배치 작업 없이도 동일한 결과를 재현할 수 있습니다.
 */
export const getDecayedConfidenceByInactivity = (
  confidence: number,
  elapsedMs?: number,
): number => {
  if (
    elapsedMs == null ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= CONFIDENCE_DECAY_GRACE_PERIOD_MS
  ) {
    return Math.max(CONFIDENCE_DECAY_FLOOR, confidence);
  }

  const decayDays = Math.floor(
    (elapsedMs - CONFIDENCE_DECAY_GRACE_PERIOD_MS) / DAY_MS,
  );

  if (decayDays <= 0) {
    return Math.max(CONFIDENCE_DECAY_FLOOR, confidence);
  }

  return Math.max(
    CONFIDENCE_DECAY_FLOOR,
    confidence - decayDays * CONFIDENCE_DECAY_PER_DAY,
  );
};

/** 경기 세부 타입을 실제로 갱신할 singles/doubles 트랙으로 변환합니다. */
export const getDuprCategoryForMatchType = (
  matchType: MatchType,
): PlayerDuprCategory => {
  if (matchType === "singles" || matchType === "unrestricted-singles") {
    return "singles";
  }

  return "doubles";
};
