import {
  ACHIEVEMENTS,
  type AchievementDefinition,
  type AchievementHoldersResponse,
  type AchievementProgress,
  type EarnedAchievement,
  type MarkAchievementsSeenRequest,
  type SeenAchievementRef,
  type UnseenAchievementsResponse,
  getAchievementDefinition,
  isBestStreakAchievement,
  isLowRatingAchievement,
  isRatingAchievement,
  RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES,
  RULES_GUIDE_ACHIEVEMENT_ID,
} from "@pkpkdupr/shared/achievements";
import { DUPR_DEFAULT_RATING } from "@pkpkdupr/shared/player";
import { apiFetch } from "@/lib/api";
import { formatRating } from "@/utils/dupr";

/** JSON 응답 형태(날짜는 문자열) */
export type AchievementProgressInfo = Omit<AchievementProgress, "earnedAt"> & {
  earnedAt: string | null;
};

export type EarnedAchievementInfo = Omit<EarnedAchievement, "earnedAt"> & {
  earnedAt: string;
};

export interface EarnedAchievementItem {
  definition: AchievementDefinition;
  progress: AchievementProgressInfo;
}

const ACHIEVEMENT_ORDER = new Map(
  ACHIEVEMENTS.map((definition, index) => [definition.id, index]),
);

export { getAchievementDefinition };

/**
 * 받은 업적을 최근 받은 순으로 돌려준다.
 * 같은 경기로 함께 받았으면 업적 표에서 뒤에 있는(더 어려운) 업적을 먼저 둔다.
 */
export const getEarnedAchievementsByRecent = (
  progress: readonly AchievementProgressInfo[],
): EarnedAchievementItem[] =>
  progress
    .flatMap((item) => {
      const definition = getAchievementDefinition(item.id);
      return item.earned && definition ? [{ definition, progress: item }] : [];
    })
    .sort(
      (left, right) =>
        Date.parse(right.progress.earnedAt ?? "") -
          Date.parse(left.progress.earnedAt ?? "") ||
        (ACHIEVEMENT_ORDER.get(right.definition.id) ?? 0) -
          (ACHIEVEMENT_ORDER.get(left.definition.id) ?? 0),
    );

/** 평점 업적인데 아직 복식 경기 수를 채우지 못했으면 그 경기 수, 아니면 null */
const getUnfilledRatedDoublesMatches = (
  definition: AchievementDefinition,
  progress: AchievementProgressInfo | null | undefined,
) => {
  const matches = progress?.ratedDoublesMatches ?? 0;
  return isRatingAchievement(definition.id) &&
    matches < RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES
    ? matches
    : null;
};

/**
 * 못 받은 업적의 진행 문구. 연승·환상의 콤비는 최고 기록으로 보여 준다.
 * 평점 업적은 복식 경기 수를 채우기 전이면 "복식 7/10경기", 채운 뒤에는 최고(낮은 평점 업적은 최저)
 * 복식 평점(평점이 없으면 "–")으로 보여 준다
 */
export const formatAchievementProgress = (
  definition: AchievementDefinition,
  progress: AchievementProgressInfo | null | undefined,
) => {
  const current = progress?.current ?? 0;
  const unfilledMatches = getUnfilledRatedDoublesMatches(definition, progress);
  if (unfilledMatches != null) {
    return `복식 ${unfilledMatches}/${RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES}경기`;
  }
  if (isRatingAchievement(definition.id)) {
    const label = isLowRatingAchievement(definition.id) ? "최저" : "최고";
    return `${label} ${formatRating(current > 0 ? current : null)}`;
  }
  return isBestStreakAchievement(definition.id)
    ? `최고 ${current}`
    : `${Math.min(current, definition.target)}/${definition.target}`;
};

/**
 * 진행 애니메이션 도중(t: 0 → 1)의 진행 상태. 숫자는 0부터, 평점은 기본 평점(3.000)부터
 * 지금 값까지 간다. 평점이 아직 없으면(0) 그대로 둔다. 문구는 formatAchievementProgress로 만든다
 */
export const interpolateAchievementProgress = (
  definition: AchievementDefinition,
  progress: AchievementProgressInfo | null | undefined,
  t: number,
): AchievementProgressInfo | null | undefined => {
  if (!progress || t >= 1) return progress;
  const unfilledMatches = getUnfilledRatedDoublesMatches(definition, progress);
  if (unfilledMatches != null) {
    return { ...progress, ratedDoublesMatches: Math.round(unfilledMatches * t) };
  }
  if (!isRatingAchievement(definition.id)) {
    return { ...progress, current: Math.round(progress.current * t) };
  }
  // 평점이 아직 없으면("–") 셀 값이 없다
  if (progress.current <= 0) return progress;
  return {
    ...progress,
    current: DUPR_DEFAULT_RATING + (progress.current - DUPR_DEFAULT_RATING) * t,
  };
};

/** 평점 업적 막대의 출발 평점과 목표 사이 최소 폭 */
const RATING_PROGRESS_MIN_SPAN = 0.5;

const clampRatio = (ratio: number) => Math.min(Math.max(ratio, 0), 1);

/**
 * 진행 막대 비율(0~1). 평점 업적은 복식 경기 수를 채우기 전이면 경기 수 비율이고,
 * 채운 뒤에는 기본 평점(3.0)에서 목표까지 간 비율이다(목표가 기본 평점에 가까우면 0.5 앞에서 출발).
 * 낮은 평점 업적은 최저 평점이 기본 평점에서 목표까지 내려간 비율이다.
 */
export const getAchievementProgressRatio = (
  definition: AchievementDefinition,
  progress: AchievementProgressInfo | null | undefined,
) => {
  const current = progress?.current ?? 0;
  const { target } = definition;
  const unfilledMatches = getUnfilledRatedDoublesMatches(definition, progress);
  if (unfilledMatches != null) {
    return unfilledMatches / RATING_ACHIEVEMENT_MIN_DOUBLES_MATCHES;
  }
  if (isLowRatingAchievement(definition.id)) {
    if (current <= 0) return 0;
    return clampRatio(
      (DUPR_DEFAULT_RATING - current) / (DUPR_DEFAULT_RATING - target),
    );
  }
  if (isRatingAchievement(definition.id)) {
    const start = Math.min(DUPR_DEFAULT_RATING, target - RATING_PROGRESS_MIN_SPAN);
    return clampRatio((current - start) / (target - start));
  }
  return target > 0 ? clampRatio(current / target) : 0;
};

/**
 * 못 받은 업적 진행으로 보일 값. 모범생은 서버가 장 수를 모르므로
 * 내 업적이면 이 기기에서 본 장 수(rulesGuideSeenCount)로 바꾸고, 남의 업적이면 진행을 보이지 않는다(null)
 */
export const getDisplayedAchievementProgress = (
  definition: AchievementDefinition,
  progress: AchievementProgressInfo | null | undefined,
  { isMine, rulesGuideSeenCount }: { isMine: boolean; rulesGuideSeenCount: number },
): { progress: AchievementProgressInfo | null | undefined } | null => {
  if (definition.id !== RULES_GUIDE_ACHIEVEMENT_ID || progress?.earned) {
    return { progress };
  }
  if (!isMine) return null;
  return {
    progress: {
      id: definition.id,
      earned: false,
      earnedAt: null,
      earnedMatchId: null,
      target: definition.target,
      ...progress,
      current: Math.min(rulesGuideSeenCount, definition.target),
    },
  };
};

export const fetchAchievementHolders =
  async (): Promise<AchievementHoldersResponse> => {
    const res = await apiFetch("/api/achievements/holders");
    if (!res.ok) {
      const errorData = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errorData.error || "업적 정보를 불러오지 못했어요.");
    }
    return (await res.json()) as AchievementHoldersResponse;
  };

export interface PlayerEarnedAchievement {
  item: EarnedAchievementInfo;
  definition: AchievementDefinition;
}

export interface MatchEarnedAchievement<P extends { id: string }> {
  item: EarnedAchievementInfo;
  definition: AchievementDefinition;
  player: P;
}

/**
 * 경기로 받은 업적을 정의·받은 참가자와 함께 고른다(정의를 모르거나 참가자가 아닌 업적은 뺀다).
 * 게스트가 낀 경기도 업적이 오고, 게스트 본인 업적은 서버가 보내지 않는다
 */
export const pickMatchEarnedAchievements = <P extends { id: string }>(
  items: readonly EarnedAchievementInfo[],
  match: { teams: readonly { players: readonly P[] }[] },
): MatchEarnedAchievement<P>[] => {
  const playerById = new Map(
    match.teams.flatMap((team) => team.players).map((player) => [player.id, player]),
  );
  return items.flatMap((item) => {
    const definition = getAchievementDefinition(item.achievementId);
    const player = playerById.get(item.playerId);
    return definition && player ? [{ item, definition, player }] : [];
  });
};

/** 받은 업적 중 이 회원 것만 정의와 함께 고른다(정의를 모르는 업적은 뺀다) */
export const pickPlayerEarnedAchievements = (
  items: readonly EarnedAchievementInfo[],
  playerId: string,
): PlayerEarnedAchievement[] =>
  items.flatMap((item) => {
    const definition =
      item.playerId === playerId
        ? getAchievementDefinition(item.achievementId)
        : null;
    return definition ? [{ item, definition }] : [];
  });

/**
 * 진행 중인 업적 쓰기 요청(확인 처리·규칙 안내 완독). 미확인 조회는 이 요청들이 끝난 뒤 보내,
 * 방금 본 업적이 확인 저장 전에 조회돼 다시 뜨거나 방금 받은 업적이 저장 전에 조회돼 빠지지 않게 한다.
 */
const pendingSeenRequests = new Set<Promise<unknown>>();

/** 업적을 바꾸는 요청을 미확인 조회가 기다리게 한다. 요청 결과를 그대로 돌려준다 */
export const trackAchievementWrite = async <T>(request: Promise<T>): Promise<T> => {
  pendingSeenRequests.add(request);
  try {
    return await request;
  } finally {
    pendingSeenRequests.delete(request);
  }
};

/** 내가 받은 업적 중 아직 축하 연출로 보지 않은 것(받은 시각 → 업적 정의 순서) */
export interface UnseenAchievementsResult {
  achievements: EarnedAchievementInfo[];
  /** 지금 업적 점수 합. 응답에 없으면(점수 추가 전 서버) null */
  points: number | null;
}

export const fetchUnseenAchievements =
  async (): Promise<UnseenAchievementsResult> => {
    await Promise.allSettled(pendingSeenRequests);
    const res = await apiFetch("/api/me/achievements/unseen");
    if (!res.ok) {
      throw new Error("새 업적을 불러오지 못했어요.");
    }
    const body = (await res.json()) as Partial<UnseenAchievementsResponseInfo>;
    return {
      achievements: body.achievements ?? [],
      points: typeof body.points === "number" ? body.points : null,
    };
  };

type UnseenAchievementsResponseInfo = Omit<
  UnseenAchievementsResponse,
  "achievements"
> & { achievements: EarnedAchievementInfo[] };

const postAchievementsSeen = async (
  items: readonly SeenAchievementRef[],
): Promise<void> => {
  const body: MarkAchievementsSeenRequest = {
    achievements: items.map(({ achievementId, earnedMatchId }) => ({
      achievementId,
      earnedMatchId,
    })),
  };
  const res = await apiFetch("/api/me/achievements/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error("업적 확인을 저장하지 못했어요.");
  }
};

/** 축하 연출로 본 업적을 확인 처리한다. 업적마다 그때의 획득 경기를 넘긴다 */
export const markAchievementsSeen = async (
  items: readonly SeenAchievementRef[],
): Promise<void> => {
  if (items.length === 0) return;
  await trackAchievementWrite(postAchievementsSeen(items));
};

/**
 * 축하 연출 장마다 받기 전·후 업적 점수. totalPoints는 모든 장의 업적을 받은 뒤의 합이라,
 * 뒤 장들의 점수를 합계에서 거꾸로 빼서 구한다
 */
export const getCelebrationPointSteps = (
  achievements: readonly Pick<AchievementDefinition, "points">[],
  totalPoints: number,
): { before: number; after: number }[] => {
  const steps: { before: number; after: number }[] = [];
  let after = totalPoints;
  for (let index = achievements.length - 1; index >= 0; index -= 1) {
    const before = after - achievements[index].points;
    steps.unshift({ before, after });
    after = before;
  }
  return steps;
};
