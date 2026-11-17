import {
  DUPR_MAX_RATING,
  DUPR_MIN_RATING,
  type OfficialDuprAdjustmentImpact,
  type PlayerDuprCategory,
} from "@pkpkdupr/shared/player";
import type { OfficialDuprRequest } from "../../api/ratings";

export const CATEGORIES: readonly PlayerDuprCategory[] = ["doubles", "singles"];

export const CATEGORY_LABELS: Record<PlayerDuprCategory, string> = {
  doubles: "복식",
  singles: "단식",
};

/** 입력칸 그대로의 문자열 */
export interface OfficialDuprFormValues {
  playerId: string | null;
  reason: string;
  ratings: Record<PlayerDuprCategory, string>;
  confidence: Record<PlayerDuprCategory, string>;
}

export const EMPTY_FORM: OfficialDuprFormValues = {
  playerId: null,
  reason: "",
  ratings: { doubles: "", singles: "" },
  confidence: { doubles: "", singles: "" },
};

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export type OfficialDuprFormResult =
  | { ok: true; request: OfficialDuprRequest }
  | { ok: false; message: string | null };

/**
 * 입력을 요청 본문으로 바꾼다. 평점·신뢰도가 둘 다 빈 분류는 보내지 않고,
 * 한쪽만 넣었거나 범위를 벗어나면 안내 문구를, 보낼 분류가 하나도 없으면 문구 없이 실패를 돌려준다.
 */
export const buildOfficialDuprRequest = (
  form: OfficialDuprFormValues,
): OfficialDuprFormResult => {
  const request: OfficialDuprRequest = {
    ratings: {},
    confidence: {},
    reason: form.reason.trim() || null,
  };

  for (const category of CATEGORIES) {
    const rating = parseNumber(form.ratings[category]);
    const confidence = parseNumber(form.confidence[category]);
    if (rating === null && confidence === null) continue;

    const label = CATEGORY_LABELS[category];
    if (rating === null || confidence === null) {
      return {
        ok: false,
        message: `${label} 평점과 신뢰도를 함께 넣어 주세요.`,
      };
    }
    if (
      Number.isNaN(rating) ||
      rating < DUPR_MIN_RATING ||
      rating > DUPR_MAX_RATING
    ) {
      return {
        ok: false,
        message: `${label} 평점은 ${DUPR_MIN_RATING}~${DUPR_MAX_RATING} 사이로 넣어 주세요.`,
      };
    }
    if (Number.isNaN(confidence) || confidence < 0 || confidence > 100) {
      return {
        ok: false,
        message: `${label} 신뢰도는 0~100 사이로 넣어 주세요.`,
      };
    }
    request.ratings[category] = rating;
    request.confidence[category] = confidence;
  }

  if (Object.keys(request.ratings).length === 0) {
    return { ok: false, message: null };
  }
  return { ok: true, request };
};

export interface ImpactRow {
  playerId: string;
  username: string;
  /** 지금 평점이 없으면 null */
  current: number | null;
  next: number;
  delta: number;
  relatedMatchCount: number;
}

/**
 * 고른 분류에서 평점이 바뀌는 회원만 변화량 절댓값이 큰 순서로 돌려준다.
 * 영향 응답의 이전 평점은 평점이 없는 회원도 기본값 숫자이므로,
 * 지금 평점은 회원 목록의 공개 평점(`currentRatingOf`)으로 정한다.
 */
export const buildImpactRows = (
  impacts: OfficialDuprAdjustmentImpact[],
  category: PlayerDuprCategory,
  currentRatingOf: (playerId: string) => number | null | undefined,
): ImpactRow[] =>
  impacts
    // 표시 자릿수(소수 셋째 자리)로 반올림해 0이면 바뀌지 않은 것으로 본다
    .filter((impact) => Number(impact.delta[category].toFixed(3)) !== 0)
    .map((impact) => {
      const current = currentRatingOf(impact.playerId);
      return {
        playerId: impact.playerId,
        username: impact.username,
        // 회원 목록에 없으면 응답의 이전 평점을 쓴다
        current:
          current === undefined ? impact.previousRating[category] : current,
        next: impact.nextRating[category],
        delta: impact.delta[category],
        relatedMatchCount: impact.relatedMatchCount,
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.delta) - Math.abs(a.delta) ||
        a.username.localeCompare(b.username),
    );
