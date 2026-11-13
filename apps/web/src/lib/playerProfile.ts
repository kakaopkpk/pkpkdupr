import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type { PlayerRatingHistory } from "@pkpkdupr/shared/player";
import type {
  HeadToHeadStat,
  OpponentStat,
  PartnerStat,
} from "@pkpkdupr/shared/profileStats";
import type { MatchInfo, MatchListResponse } from "@/types/match";
import type { AchievementProgressInfo } from "@/lib/achievements";
import { apiFetch } from "@/lib/api";

/** `GET /api/players/:playerId/profile-summary` JSON 응답(날짜는 문자열) */
export interface PlayerProfileSummaryInfo {
  matchStats: Record<
    MatchTopLevelType,
    { matchWins: number; matchLosses: number; setWins: number; setLosses: number }
  >;
  ratingDelta: Record<
    MatchTopLevelType,
    {
      last7Days: number;
      last30Days: number;
      last90Days: number;
      last7DaysMatchCount: number;
    }
  >;
  ratingHistory: PlayerRatingHistory;
  recentMatches: MatchInfo[];
  partners: PartnerStat[];
  /** 자주 진 상대(천적) */
  rivals: OpponentStat[];
  /** 보는 사람 기준 맞대결 승패. 본인 프로필이면 null */
  headToHead: HeadToHeadStat | null;
  /** 업적 18개 진행 상태(ACHIEVEMENTS 순서) */
  achievements: AchievementProgressInfo[];
}

const requestJson = async <T>(path: string, fallbackMessage: string) => {
  const res = await apiFetch(path);
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorData.error || fallbackMessage);
  }
  return (await res.json()) as T;
};

export const fetchPlayerProfileSummary = (playerId: string) =>
  requestJson<PlayerProfileSummaryInfo>(
    `/api/players/${encodeURIComponent(playerId)}/profile-summary`,
    "프로필 요약을 불러오지 못했습니다.",
  );

export const fetchPlayerMatches = ({
  playerId,
  category,
  page = 0,
  limit = 20,
}: {
  playerId: string;
  category?: MatchTopLevelType;
  page?: number;
  limit?: number;
}) => {
  const params = new URLSearchParams({
    playerId,
    page: String(page),
    limit: String(limit),
  });
  if (category) params.set("category", category);
  return requestJson<MatchListResponse>(
    `/api/matches?${params.toString()}`,
    "경기 목록을 불러오지 못했습니다.",
  );
};
