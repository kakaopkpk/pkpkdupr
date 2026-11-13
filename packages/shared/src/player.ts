export type PlayerStatus = "active" | "inactive";

export interface PlayerAffiliation {
  name: string;
  isPrimary: boolean;
}

export const PLAYER_AFFILIATION_MAX_COUNT = 5;
export const PLAYER_AFFILIATION_NAME_MAX_LENGTH = 30;
export const PLAYER_STATUS_MESSAGE_MAX_LENGTH = 20;

export type PlayerCreationSource =
  | "self_register"
  | "admin_register"
  | "bootstrap"
  | "invite";

export interface PlayerDupr {
  singles: number;
  doubles: number;
}

export interface PublicPlayerDupr {
  singles: number | null;
  doubles: number | null;
}

export type PlayerDuprCategory = keyof PlayerDupr;

export interface PlayerDuprMetric {
  confidence: number;
  accuracy: number | null;
}

export interface PlayerDuprMetrics {
  singles: PlayerDuprMetric;
  doubles: PlayerDuprMetric;
}

export interface StoredPlayerDupr {
  rating: PlayerDupr;
  metrics: PlayerDuprMetrics;
}

export interface OfficialDuprAdjustmentLog {
  id: string;
  playerId: string;
  changedByPlayerId: string;
  changedByUsername: string;
  ratings: Partial<PlayerDupr>;
  confidence: Partial<Record<PlayerDuprCategory, number>>;
  previousRating: PlayerDupr;
  nextRating: PlayerDupr;
  preUpdateAccuracy: Partial<Record<PlayerDuprCategory, number | null>>;
  reason: string | null;
  createdAt: Date;
}

export type PlayerRatingChangeSource =
  | "official_adjustment_recalculation"
  | "manual_recalculation"
  | "match_completed";

export interface PlayerRatingChangeLog {
  id: string;
  playerId: string;
  source: PlayerRatingChangeSource;
  sourceLogId: string;
  previousRating: PlayerDupr;
  nextRating: PlayerDupr;
  delta: PlayerDupr;
  createdAt: Date;
}

/** 프로필 차트에 표시하는 재계산 완료 레이팅 지점입니다. */
export interface PlayerRatingHistoryPoint {
  rating: number;
  createdAt: Date;
  /**
   * 완료 경기, 현재 레이팅 또는 차트 표시 범위 시작을 위한 기준점입니다.
   * `anchor`는 원본 경기 데이터를 변형하지 않고 추세 기간 시작값을
   * 연속적으로 연결하기 위한 파생 지점입니다.
   */
  source: "match" | "current" | "anchor";
}

export type PlayerRatingHistory = Record<
  PlayerDuprCategory,
  PlayerRatingHistoryPoint[]
>;

export interface OfficialDuprAdjustmentImpact {
  playerId: string;
  username: string;
  previousRating: PlayerDupr;
  nextRating: PlayerDupr;
  delta: PlayerDupr;
  relatedMatchCount: number;
}

export interface OfficialDuprAdjustmentPreview {
  player: Player;
  impacts: OfficialDuprAdjustmentImpact[];
}

export const DUPR_DEFAULT_RATING = 3.0;
export const DUPR_MIN_RATING = 2;
export const DUPR_MAX_RATING = 8;
const LEGACY_DUPR_DEFAULT_RATING = 3.5;
const LEGACY_SINGLES_KEYS = ["standard", "unrestricted"] as const;
const LEGACY_DOUBLES_KEYS = ["mixed", "men", "women", "unrestricted"] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const averagePresent = (values: Array<number | null | undefined>) => {
  const presentValues = values.filter(
    (value): value is number => typeof value === "number",
  );
  return presentValues.length ? average(presentValues) : null;
};

export const roundDuprRating = (value: number) =>
  Math.round(value * 1000) / 1000;

export const normalizeDuprRatingValue = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return DUPR_DEFAULT_RATING;
  }

  if (parsed === 1000) {
    return DUPR_DEFAULT_RATING;
  }

  const officialScaleValue = parsed > 10 ? parsed / 1000 : parsed;
  return roundDuprRating(
    clamp(officialScaleValue, DUPR_MIN_RATING, DUPR_MAX_RATING),
  );
};

const normalizeMetricValue = (
  value: unknown,
  fallback: PlayerDuprMetric = { confidence: 0, accuracy: null },
): PlayerDuprMetric => {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const confidence = Number(record.confidence ?? fallback.confidence);
  const rawAccuracy = record.accuracy ?? fallback.accuracy;
  const accuracy = rawAccuracy == null ? null : Number(rawAccuracy);

  return {
    confidence: Math.round(
      clamp(Number.isFinite(confidence) ? confidence : 0, 0, 100),
    ),
    accuracy:
      accuracy == null || !Number.isFinite(accuracy)
        ? null
        : Math.round(clamp(accuracy, 0, 100)),
  };
};

const getPrimitiveSeed = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number") {
      return normalizeDuprRatingValue(value);
    }

    if (typeof value === "string" && value.trim()) {
      return normalizeDuprRatingValue(value);
    }
  }

  return DUPR_DEFAULT_RATING;
};

const collapseLegacyRatings = (
  value: unknown,
  keys: readonly string[],
): number | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const values = keys
    .filter((key) => key in record)
    .map((key) => normalizeDuprRatingValue(record[key]));

  return values.length ? roundDuprRating(average(values)) : null;
};

const collapseLegacyMetricValues = (
  value: unknown,
  keys: readonly string[],
): PlayerDuprMetric | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const metrics = keys
    .filter((key) => key in record)
    .map((key) => normalizeMetricValue(record[key]));

  if (!metrics.length) {
    return null;
  }

  return {
    confidence: Math.round(average(metrics.map((metric) => metric.confidence))),
    accuracy: averagePresent(metrics.map((metric) => metric.accuracy)),
  };
};

const normalizeTrackRating = (
  value: unknown,
  fallback: number,
  legacyKeys: readonly string[],
) =>
  collapseLegacyRatings(value, legacyKeys) ??
  normalizeDuprRatingValue(value ?? fallback);

const normalizeTrackMetric = (
  value: unknown,
  fallback: PlayerDuprMetric = { confidence: 0, accuracy: null },
  legacyKeys: readonly string[],
) =>
  collapseLegacyMetricValues(value, legacyKeys) ??
  normalizeMetricValue(value, fallback);

export const getCompositeSinglesRating = (
  duprRating?: PlayerDupr | PublicPlayerDupr | null,
): number | null => duprRating?.singles ?? null;

export const getCompositeDoublesRating = (
  duprRating?: PlayerDupr | PublicPlayerDupr | null,
): number | null => duprRating?.doubles ?? null;

export const createDefaultPlayerDuprMetrics = (
  confidence = 0,
  accuracy: number | null = null,
): PlayerDuprMetrics => ({
  singles: { confidence, accuracy },
  doubles: { confidence, accuracy },
});

export const createDefaultPlayerDupr = (
  seed: unknown = DUPR_DEFAULT_RATING,
): PlayerDupr => {
  const normalizedSeed = normalizeDuprRatingValue(seed);
  return {
    singles: normalizedSeed,
    doubles: normalizedSeed,
  };
};

export const isDefaultPlayerDupr = (rating: PlayerDupr) =>
  rating.singles === DUPR_DEFAULT_RATING &&
  rating.doubles === DUPR_DEFAULT_RATING;

const isLegacyDefaultPlayerDupr = (rating: PlayerDupr) =>
  rating.singles === LEGACY_DUPR_DEFAULT_RATING &&
  rating.doubles === LEGACY_DUPR_DEFAULT_RATING;

export const normalizePlayerDupr = (value: unknown): PlayerDupr => {
  if (typeof value === "number" || typeof value === "string") {
    return createDefaultPlayerDupr(value);
  }

  if (!value || typeof value !== "object") {
    return createDefaultPlayerDupr();
  }

  const record = value as Record<string, unknown>;
  const ratingSource =
    record.rating && typeof record.rating === "object"
      ? (record.rating as Record<string, unknown>)
      : record;
  const baseSeed = getPrimitiveSeed(
    ratingSource.total,
    ratingSource.singles,
    ratingSource.doubles,
  );

  return {
    singles: normalizeTrackRating(
      ratingSource.singles,
      baseSeed,
      LEGACY_SINGLES_KEYS,
    ),
    doubles: normalizeTrackRating(
      ratingSource.doubles,
      baseSeed,
      LEGACY_DOUBLES_KEYS,
    ),
  };
};

const isDefaultPlayerDuprMetrics = (metrics: PlayerDuprMetrics) =>
  metrics.singles.confidence === 0 &&
  metrics.singles.accuracy == null &&
  metrics.doubles.confidence === 0 &&
  metrics.doubles.accuracy == null;

const hasMeaningfulMetric = (metric: PlayerDuprMetric) =>
  metric.confidence > 0 || metric.accuracy != null;

export const normalizeStoredPlayerDupr = (value: unknown): StoredPlayerDupr => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return {
        rating: createDefaultPlayerDupr(),
        metrics: createDefaultPlayerDuprMetrics(),
      };
    }

    if (trimmed.startsWith("{")) {
      try {
        return normalizeStoredPlayerDupr(JSON.parse(trimmed));
      } catch {
        return {
          rating: createDefaultPlayerDupr(),
          metrics: createDefaultPlayerDuprMetrics(),
        };
      }
    }

    return {
      rating: createDefaultPlayerDupr(trimmed),
      metrics: createDefaultPlayerDuprMetrics(),
    };
  }

  const rating = normalizePlayerDupr(value);
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const metricsSource =
    record.metrics && typeof record.metrics === "object"
      ? (record.metrics as Record<string, unknown>)
      : {};

  return {
    rating,
    metrics: {
      singles: normalizeTrackMetric(
        metricsSource.singles,
        { confidence: 0, accuracy: null },
        LEGACY_SINGLES_KEYS,
      ),
      doubles: normalizeTrackMetric(
        metricsSource.doubles,
        { confidence: 0, accuracy: null },
        LEGACY_DOUBLES_KEYS,
      ),
    },
  };
};

export const shouldStorePlayerDuprAsNull = (value: unknown): boolean => {
  if (value == null) {
    return true;
  }

  if (typeof value === "string" && !value.trim()) {
    return true;
  }

  const state = normalizeStoredPlayerDupr(value);
  return (
    (isDefaultPlayerDupr(state.rating) ||
      isLegacyDefaultPlayerDupr(state.rating)) &&
    isDefaultPlayerDuprMetrics(state.metrics)
  );
};

export const toPublicPlayerDupr = (
  state: StoredPlayerDupr,
): PublicPlayerDupr | null => {
  if (shouldStorePlayerDuprAsNull(state)) {
    return null;
  }

  if (isDefaultPlayerDuprMetrics(state.metrics)) {
    return {
      singles: state.rating.singles,
      doubles: state.rating.doubles,
    };
  }

  return {
    singles: hasMeaningfulMetric(state.metrics.singles)
      ? state.rating.singles
      : null,
    doubles: hasMeaningfulMetric(state.metrics.doubles)
      ? state.rating.doubles
      : null,
  };
};

export const normalizeNullablePlayerDupr = (
  value: unknown,
): PublicPlayerDupr | null =>
  toPublicPlayerDupr(normalizeStoredPlayerDupr(value));

export const serializeStoredPlayerDupr = (value: StoredPlayerDupr) =>
  JSON.stringify({
    rating: normalizePlayerDupr(value.rating),
    metrics: value.metrics,
  });

export const getDuprRatingByCategory = (
  rating: PlayerDupr,
  category: PlayerDuprCategory,
) => rating[category];

export const setDuprRatingByCategory = (
  rating: PlayerDupr,
  category: PlayerDuprCategory,
  value: number,
): PlayerDupr => ({
  ...rating,
  [category]: normalizeDuprRatingValue(value),
});

export const getDuprMetricByCategory = (
  metrics: PlayerDuprMetrics,
  category: PlayerDuprCategory,
) => metrics[category];

export const setDuprMetricByCategory = (
  metrics: PlayerDuprMetrics,
  category: PlayerDuprCategory,
  value: PlayerDuprMetric,
): PlayerDuprMetrics => ({
  ...metrics,
  [category]: normalizeMetricValue(value),
});

export interface Player {
  id: string;
  username: string;
  duprRating: PublicPlayerDupr | null;
  gender: "M" | "F";
  status: PlayerStatus;
  avatarUrl?: string;
  affiliations?: PlayerAffiliation[];
  statusMessage?: string;
  statusMessageBackgroundColor?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberListPlayer extends Player {
  lastPlayedAt: Date | null;
}

export interface PlayerProfile extends Player {
  totalMatches: number;
  winRate: number;
}

export interface PlayerCreationLog {
  id: string;
  playerId: string;
  createdByPlayerId: string | null;
  createdByUsername: string;
  creationSource: PlayerCreationSource;
  createdAt: Date;
}

export interface PlayerStatusChangeLog {
  id: string;
  playerId: string;
  previousStatus: PlayerStatus;
  nextStatus: PlayerStatus;
  changedByPlayerId: string;
  changedByUsername: string;
  changedAt: Date;
}
