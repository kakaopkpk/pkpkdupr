import {
  ACHIEVEMENTS,
  type AchievementDefinition,
  type AchievementHoldersResponse,
  type AchievementProgress,
  type EarnedAchievement,
  type MarkAchievementsSeenRequest,
  type SeenAchievementRef,
  type UnseenAchievementsResponse,
  isBestStreakAchievement,
} from "@pkpkdupr/shared/achievements";
import { apiFetch } from "@/lib/api";

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

const ACHIEVEMENT_BY_ID = new Map(
  ACHIEVEMENTS.map((definition) => [definition.id, definition]),
);
const ACHIEVEMENT_ORDER = new Map(
  ACHIEVEMENTS.map((definition, index) => [definition.id, index]),
);

export const getAchievementDefinition = (
  achievementId: string,
): AchievementDefinition | null => ACHIEVEMENT_BY_ID.get(achievementId) ?? null;

/**
 * 받은 업적을 최근 받은 순으로 돌려준다.
 * 같은 경기로 함께 받았으면 업적 표에서 뒤에 있는(더 어려운) 업적을 먼저 둔다.
 */
export const getEarnedAchievementsByRecent = (
  progress: readonly AchievementProgressInfo[],
): EarnedAchievementItem[] =>
  progress
    .flatMap((item) => {
      const definition = ACHIEVEMENT_BY_ID.get(item.id);
      return item.earned && definition ? [{ definition, progress: item }] : [];
    })
    .sort(
      (left, right) =>
        Date.parse(right.progress.earnedAt ?? "") -
          Date.parse(left.progress.earnedAt ?? "") ||
        (ACHIEVEMENT_ORDER.get(right.definition.id) ?? 0) -
          (ACHIEVEMENT_ORDER.get(left.definition.id) ?? 0),
    );

/** 못 받은 업적의 진행 문구. 연승·환상의 콤비는 최고 기록으로 보여 준다 */
export const formatAchievementProgress = (
  definition: AchievementDefinition,
  progress: AchievementProgressInfo | null | undefined,
) => {
  const current = progress?.current ?? 0;
  return isBestStreakAchievement(definition.id)
    ? `최고 ${current}`
    : `${Math.min(current, definition.target)}/${definition.target}`;
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
 * 진행 중인 확인 처리 요청. 미확인 조회는 이 요청들이 끝난 뒤 보내,
 * 방금 본 업적이 확인 저장 전에 조회돼 다시 뜨지 않게 한다.
 */
const pendingSeenRequests = new Set<Promise<void>>();

/** 내가 받은 업적 중 아직 축하 연출로 보지 않은 것(받은 시각 → 업적 정의 순서) */
export const fetchUnseenAchievements = async (): Promise<
  EarnedAchievementInfo[]
> => {
  await Promise.allSettled(pendingSeenRequests);
  const res = await apiFetch("/api/me/achievements/unseen");
  if (!res.ok) {
    throw new Error("새 업적을 불러오지 못했어요.");
  }
  const body = (await res.json()) as UnseenAchievementsResponseInfo;
  return body.achievements;
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
  const request = postAchievementsSeen(items);
  pendingSeenRequests.add(request);
  try {
    await request;
  } finally {
    pendingSeenRequests.delete(request);
  }
};
