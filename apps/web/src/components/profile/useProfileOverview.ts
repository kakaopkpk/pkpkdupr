import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type { RankingResponse } from "@pkpkdupr/shared/ranking";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  fetchPlayerProfileSummary,
  type PlayerProfileSummaryInfo,
} from "@/lib/playerProfile";
import { fetchRankings } from "@/lib/rankings";

export interface ProfileOverview {
  playerId: string;
  summary: PlayerProfileSummaryInfo;
  /** 분류별 랭킹. 불러오지 못한 분류는 비어 있다 */
  rankings: Partial<Record<MatchTopLevelType, RankingResponse>>;
}

/**
 * 프로필 요약과 복식·단식 랭킹을 함께 불러온다.
 * playerId가 바뀌면 화면을 비우고(스켈레톤), dataVersion이 바뀌면 보이는 내용을 유지한 채 다시 불러온다.
 */
export const useProfileOverview = (playerId: string | null) => {
  const { dataVersion } = useAppNavigation();
  const [overview, setOverview] = useState<ProfileOverview | null>(null);
  const [hasError, setHasError] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const loadedPlayerIdRef = useRef<string | null>(null);

  const load = useCallback(
    async ({ throwOnError = false }: { throwOnError?: boolean } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      if (!playerId) return;

      if (loadedPlayerIdRef.current !== playerId) {
        setOverview(null);
        setHasError(false);
      }

      try {
        // 랭킹을 못 받아도 프로필은 보여 준다
        const [summary, doubles, singles] = await Promise.all([
          fetchPlayerProfileSummary(playerId),
          fetchRankings("doubles").catch(() => null),
          fetchRankings("singles").catch(() => null),
        ]);
        if (requestIdRef.current !== requestId) return;

        const rankings: ProfileOverview["rankings"] = {};
        if (doubles) rankings.doubles = doubles;
        if (singles) rankings.singles = singles;
        loadedPlayerIdRef.current = playerId;
        setOverview({ playerId, summary, rankings });
        setHasError(false);
        setLastLoadedAt(Date.now());
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        if (loadedPlayerIdRef.current !== playerId) setHasError(true);
        if (throwOnError) throw err;
      }
    },
    [playerId],
  );

  useEffect(() => {
    if (!playerId) {
      requestIdRef.current += 1;
      loadedPlayerIdRef.current = null;
      setOverview(null);
      setHasError(false);
      setLastLoadedAt(null);
      return;
    }
    void load();
  }, [dataVersion, load, playerId]);

  return {
    /** 지금 playerId의 데이터만 돌려준다(이전 회원 데이터가 잠깐 보이지 않게) */
    overview: overview?.playerId === playerId ? overview : null,
    hasError,
    lastLoadedAt,
    reload: load,
  };
};
