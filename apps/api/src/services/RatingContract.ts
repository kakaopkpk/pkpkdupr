import type { MatchScore, MatchType } from "@pkpkdupr/shared/match";
import type { StoredPlayerDupr } from "@pkpkdupr/shared/player";

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
