import type { AchievementHoldersResponse } from "@pkpkdupr/shared/achievements";
import type {
  OfficialDuprAdjustmentLog,
  OfficialDuprAdjustmentPreview,
  Player,
  PlayerDuprCategory,
  PlayerRatingChangeLog,
} from "@pkpkdupr/shared/player";
import type { RankingResponse } from "@pkpkdupr/shared/ranking";
import { apiJson } from "./client";

export interface OfficialDuprRequest {
  ratings: Partial<Record<PlayerDuprCategory, number>>;
  /** 0~100 */
  confidence: Partial<Record<PlayerDuprCategory, number>>;
  reason: string | null;
}

const officialDuprPath = (playerId: string) =>
  `/api/admin/players/${encodeURIComponent(playerId)}/official-dupr`;

export const previewOfficialDupr = (
  playerId: string,
  body: OfficialDuprRequest,
) =>
  apiJson<OfficialDuprAdjustmentPreview>(
    `${officialDuprPath(playerId)}/preview`,
    { method: "POST", body },
  );

export const applyOfficialDupr = (playerId: string, body: OfficialDuprRequest) =>
  apiJson<{
    player: Player;
    log: OfficialDuprAdjustmentLog;
    ratingChangeLogs: PlayerRatingChangeLog[];
  }>(officialDuprPath(playerId), { method: "POST", body });

/** 응답의 그 밖의 필드는 버린다. */
export const recalculateRatings = async (): Promise<{
  completedMatchCount: number;
  changedPlayerCount: number;
}> => {
  const data = await apiJson<{
    completedMatchCount: number;
    changedPlayerCount: number;
  }>("/api/admin/ratings/recalculate", { method: "POST" });
  return {
    completedMatchCount: data.completedMatchCount,
    changedPlayerCount: data.changedPlayerCount,
  };
};

export const fetchRankings = (category: "doubles" | "singles") =>
  apiJson<RankingResponse>(`/api/rankings?category=${category}`);

export const fetchAchievementHolders = () =>
  apiJson<AchievementHoldersResponse>("/api/achievements/holders");
