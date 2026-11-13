import {
  ACHIEVEMENTS,
  type AchievementDefinition,
  type AchievementHoldersResponse,
  type AchievementProgress,
  type EarnedAchievement,
  type MarkAchievementsSeenRequest,
  type SeenAchievementRef,
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

/** 내가 받은 업적 중 아직 축하 연출로 보지 않은 것(받은 시각 → 업적 정의 순서) */
export const fetchUnseenAchievements = async (): Promise<
  EarnedAchievementInfo[]
> => {
  const res = await apiFetch("/api/me/achievements/unseen");
  if (!res.ok) {
    throw new Error("새 업적을 불러오지 못했어요.");
  }
  const body = (await res.json()) as { achievements: EarnedAchievementInfo[] };
  return body.achievements;
};

/** 확인 처리할 업적. 받은 회원까지 넣어 한 기기에서 회원이 바뀌어도 섞이지 않게 한다 */
export type SeenAchievementItem = SeenAchievementRef & { playerId: string };

const toSeenKey = ({
  playerId,
  achievementId,
  earnedMatchId,
}: SeenAchievementItem) => `${playerId}:${achievementId}:${earnedMatchId}`;

/**
 * 이 앱에서 확인 처리를 보낸 업적. 확인 요청이 끝나기 전에 미확인 조회가 먼저 끝나도
 * 방금 본 업적을 다시 띄우지 않도록 조회 결과에서 뺀다. 요청이 실패하면 지운다.
 */
const locallySeenKeys = new Set<string>();

export const excludeLocallySeenAchievements = <T extends SeenAchievementItem>(
  items: readonly T[],
): T[] => items.filter((item) => !locallySeenKeys.has(toSeenKey(item)));

/** 축하 연출로 본 업적을 확인 처리한다. 업적마다 그때의 획득 경기를 넘긴다 */
export const markAchievementsSeen = async (
  items: readonly SeenAchievementItem[],
): Promise<void> => {
  if (items.length === 0) return;
  const keys = items.map(toSeenKey);
  keys.forEach((key) => locallySeenKeys.add(key));
  const forgetKeys = () => keys.forEach((key) => locallySeenKeys.delete(key));
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
  }).catch((error: unknown) => {
    forgetKeys();
    throw error;
  });
  if (!res.ok) {
    forgetKeys();
    throw new Error("업적 확인을 저장하지 못했어요.");
  }
};
