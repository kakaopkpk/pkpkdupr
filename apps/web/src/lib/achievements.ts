import {
  ACHIEVEMENTS,
  type AchievementDefinition,
  type AchievementHoldersResponse,
  type AchievementProgress,
  type EarnedAchievement,
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

/** 못 받은 업적의 진행 문구. 연승은 최고 기록으로 보여 준다 */
export const formatAchievementProgress = (
  definition: AchievementDefinition,
  progress: AchievementProgressInfo | null | undefined,
) => {
  const current = progress?.current ?? 0;
  return definition.category === "streak"
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
