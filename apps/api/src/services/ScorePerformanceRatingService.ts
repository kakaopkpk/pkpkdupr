import type { MatchScore } from "@pkpkdupr/shared/match";
import {
  getDuprMetricByCategory,
  getDuprRatingByCategory,
  normalizeDuprRatingValue,
  roundDuprRating,
  setDuprMetricByCategory,
  setDuprRatingByCategory,
  type StoredPlayerDupr,
} from "@pkpkdupr/shared/player";
import {
  getDecayedConfidenceByInactivity,
  getDuprCategoryForMatchType,
  type MatchReplayInput,
  type RatingServiceContract,
} from "./RatingContract";

export interface ScorePerformanceRatingCalculation {
  /** 팀 평균 레이팅으로 예상한 득점 비율 */
  expectedPointShare: number;
  /** 실제 스코어를 합산한 득점 비율 */
  actualPointShare: number;
  /** 실제 득점률 - 기대 득점률 */
  performanceGap: number;
  /** confidence와 외부 보정값을 반영한 최종 K-factor */
  kFactor: number;
  ratingChange: number;
  oldRating: number;
  newRating: number;
  oldConfidence: number;
  newConfidence: number;
}

/**
 * 득점률식의 confidence별 기본 K-factor입니다.
 *
 * 실제 득점률 차이는 승패의 0/1 차이보다 작으므로 K-factor를 크게 잡고,
 * 최종 변화량은 별도로 ±0.2에서 제한합니다.
 */
const CONFIDENCE_K_FACTORS = [
  { maxExclusive: 20, kFactor: 0.32 },
  { maxExclusive: 50, kFactor: 0.2 },
  { maxExclusive: 80, kFactor: 0.12 },
  { maxExclusive: Infinity, kFactor: 0.08 },
];

/**
 * 득점률이 있을 때 사용하는 로지스틱 곡선의 폭입니다.
 * 값이 클수록 팀 간 레이팅 차이에 따른 기대 득점률 변화가 완만해집니다.
 */
const SCORE_EXPECTATION_SCALE = 1.48;
/** 스코어가 없는 과거 경기에서 승패 fallback에 사용하는 기존 척도입니다. */
const BINARY_EXPECTATION_SCALE = 0.4;
/** 한 경기에서 한 선수에게 허용하는 최대 레이팅 변화량입니다. */
const MAX_RATING_CHANGE = 0.2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

/**
 * 여러 게임의 점수를 모두 합산해 [A팀 득점률, B팀 득점률]을 반환합니다.
 * 점수가 없거나 양 팀 총점이 0이면 승패 fallback을 사용하도록 null을
 * 반환합니다.
 */
export const getTeamPointShares = (
  scores?: MatchScore[],
): [number, number] | null => {
  if (!scores?.length) {
    return null;
  }

  const [teamAPoints, teamBPoints] = scores.reduce<[number, number]>(
    (totals, score) => [
      totals[0] + Math.max(0, score.scoreA),
      totals[1] + Math.max(0, score.scoreB),
    ],
    [0, 0],
  );
  const totalPoints = teamAPoints + teamBPoints;

  if (totalPoints <= 0) {
    return null;
  }

  return [teamAPoints / totalPoints, teamBPoints / totalPoints];
};

/**
 * 두 팀의 평균 레이팅 차이를 0~1 기대 득점률로 변환합니다.
 *
 * 양 팀에 같은 식을 반대로 적용하므로 정상 입력에서는 두 기대값의 합이 1이
 * 됩니다.
 */
export const getExpectedPointShare = (
  teamRating: number,
  opponentTeamRating: number,
  scale = SCORE_EXPECTATION_SCALE,
) => 1 / (1 + Math.pow(10, (opponentTeamRating - teamRating) / scale));

/**
 * 득점률 기반 레이팅 구현체입니다.
 *
 * 팀 평균 레이팅으로 구한 기대 득점률과 실제 득점률의 차이를 반영합니다.
 * 예를 들어 강팀이 근소하게 이기면 기대보다 낮은 득점률일 수 있어 레이팅이
 * 내려갈 수 있고, 약팀이 패해도 접전을 만들면 올라갈 수 있습니다.
 *
 * 점수가 없는 과거 경기는 재계산 가능성을 유지하기 위해 승자=1, 패자=0인
 * 승패 입력으로 fallback합니다.
 */
export class ScorePerformanceRatingService implements RatingServiceContract {
  /** confidence를 정규화한 뒤 득점률식의 K-factor를 선택합니다. */
  getKFactor(confidence: number): number {
    const normalized = clamp(Math.round(confidence), 0, 100);
    return CONFIDENCE_K_FACTORS.find(
      ({ maxExclusive }) => normalized < maxExclusive,
    )!.kFactor;
  }

  /** 공식 DUPR과의 차이를 공식값 보정용 accuracy로 환산합니다. */
  getAccuracy(internalRating: number, officialRating: number): number {
    const accuracy =
      100 - (Math.abs(internalRating - officialRating) / 0.5) * 100;
    return Math.round(clamp(accuracy, 0, 100));
  }

  /** accuracy가 낮을수록 공식값 주변 경기의 전파 영향을 크게 만듭니다. */
  getCorrectionWeight(preUpdateAccuracy: number | null): number {
    if (preUpdateAccuracy == null) {
      return 1;
    }
    return clamp((100 - preUpdateAccuracy) / 100, 0.1, 1);
  }

  /**
   * 한 선수의 득점률 기반 레이팅 변화를 계산합니다.
   *
   * ratingChange
   *   = clamp((actualPointShare - expectedPointShare) × K-factor, -0.2, 0.2)
   *
   * 제한은 반올림 전에 적용하며, confidence는 자신을 제외한 경기 참가자들의
   * 평균 confidence가 높을수록 1~5만큼 증가합니다.
   */
  calculate(calcParams: {
    currentRating: number;
    expectedPointShare: number;
    actualPointShare: number;
    confidence: number;
    peerConfidence: number;
    correctionWeight?: number;
  }): ScorePerformanceRatingCalculation {
    const {
      currentRating,
      expectedPointShare,
      actualPointShare,
      confidence,
      peerConfidence,
      correctionWeight = 1,
    } = calcParams;
    const performanceGap = actualPointShare - expectedPointShare;
    const kFactor = this.getKFactor(confidence) * correctionWeight;
    const ratingChange = roundDuprRating(
      clamp(
        performanceGap * kFactor,
        -MAX_RATING_CHANGE,
        MAX_RATING_CHANGE,
      ),
    );
    const oldRating = normalizeDuprRatingValue(currentRating);
    const newRating = normalizeDuprRatingValue(oldRating + ratingChange);
    const confidenceGain = clamp(
      Math.round(1 + (peerConfidence / 100) * 4),
      1,
      5,
    );
    const newConfidence = Math.round(
      clamp(confidence + confidenceGain, 0, 100),
    );

    return {
      expectedPointShare,
      actualPointShare,
      performanceGap,
      kFactor,
      ratingChange,
      oldRating,
      newRating,
      oldConfidence: Math.round(clamp(confidence, 0, 100)),
      newConfidence,
    };
  }

  /**
   * 완료 경기 한 건을 득점률식으로 재생합니다.
   *
   * 처리 순서:
   * 1. 경기 타입에 맞는 singles/doubles 트랙과 양 팀 평균 레이팅 계산
   * 2. 전체 게임의 득점을 합산해 실제 팀 득점률 계산
   * 3. 스코어 유무에 맞는 scale로 기대 득점률 계산
   * 4. 장기 미참여 confidence와 외부 correction weight 반영
   * 5. 모든 참가자를 동일한 경기 전 상태에서 계산해 대상 트랙만 교체
   */
  replayMatch(
    match: MatchReplayInput,
    correctionWeightByPlayerId: Record<string, number> = {},
  ): Record<string, StoredPlayerDupr> {
    const category = getDuprCategoryForMatchType(match.type);
    const teamRatings = ([0, 1] as const).map((teamIndex) => {
      const ratings = match.participants
        .filter((participant) => participant.teamIndex === teamIndex)
        .map((participant) =>
          getDuprRatingByCategory(participant.state.rating, category),
        );
      return average(ratings);
    }) as [number, number];
    const pointShares = getTeamPointShares(match.scores);
    const expectationScale = pointShares
      ? SCORE_EXPECTATION_SCALE
      : BINARY_EXPECTATION_SCALE;
    const expectedPointShares: [number, number] = [
      getExpectedPointShare(teamRatings[0], teamRatings[1], expectationScale),
      getExpectedPointShare(teamRatings[1], teamRatings[0], expectationScale),
    ];
    const actualPointShares: [number, number] =
      pointShares ??
      (match.winnerTeamIndex === 0 ? [1, 0] : [0, 1]);
    const decayedConfidenceByPlayerId = Object.fromEntries(
      match.participants.map((participant) => {
        const currentMetric = getDuprMetricByCategory(
          participant.state.metrics,
          category,
        );
        return [
          participant.playerId,
          getDecayedConfidenceByInactivity(
            currentMetric.confidence,
            match.inactiveElapsedMsByPlayerId?.[participant.playerId],
          ),
        ];
      }),
    );
    const nextStates: Record<string, StoredPlayerDupr> = {};

    for (const participant of match.participants) {
      const peers = match.participants.filter(
        (candidate) => candidate.playerId !== participant.playerId,
      );
      const peerConfidence = average(
        peers.map((peer) => decayedConfidenceByPlayerId[peer.playerId] ?? 0),
      );
      const currentMetric = getDuprMetricByCategory(
        participant.state.metrics,
        category,
      );
      const decayedConfidence =
        decayedConfidenceByPlayerId[participant.playerId] ??
        currentMetric.confidence;
      const teamIndex = participant.teamIndex;
      const result = this.calculate({
        currentRating: getDuprRatingByCategory(
          participant.state.rating,
          category,
        ),
        expectedPointShare: expectedPointShares[teamIndex],
        actualPointShare: actualPointShares[teamIndex],
        confidence: decayedConfidence,
        peerConfidence,
        correctionWeight:
          correctionWeightByPlayerId[participant.playerId] ?? 1,
      });
      const nextRating = setDuprRatingByCategory(
        participant.state.rating,
        category,
        result.newRating,
      );
      const nextMetrics = setDuprMetricByCategory(
        participant.state.metrics,
        category,
        {
          ...currentMetric,
          confidence: result.newConfidence,
        },
      );

      nextStates[participant.playerId] = {
        rating: nextRating,
        metrics: nextMetrics,
      };
    }

    return nextStates;
  }
}
