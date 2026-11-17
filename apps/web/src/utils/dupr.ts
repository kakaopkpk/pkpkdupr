import {
  getMatchTopLevelType,
  type MatchType,
} from "@pkpkdupr/shared/match";
import {
  getCompositeDoublesRating as getSharedCompositeDoublesRating,
  getCompositeSinglesRating as getSharedCompositeSinglesRating,
  type PublicPlayerDupr,
} from "@pkpkdupr/shared/player";

/** 평점 소수 3자리. 평점이 없으면 "–" */
export const formatRating = (rating?: number | null) =>
  rating?.toFixed(3) ?? "–";

export const getCompositeSinglesRating = (
  duprRating?: PublicPlayerDupr | null,
) => getSharedCompositeSinglesRating(duprRating);

export const getCompositeDoublesRating = (
  duprRating?: PublicPlayerDupr | null,
) => getSharedCompositeDoublesRating(duprRating);

export const getDisplayRatingForMatchType = (
  matchType: MatchType,
  duprRating?: PublicPlayerDupr | null,
) =>
  getMatchTopLevelType(matchType) === "singles"
    ? getCompositeSinglesRating(duprRating)
    : getCompositeDoublesRating(duprRating);
