import { useMemo } from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import type { MatchSessionKind } from "@pkpkdupr/shared/session";
import type { SessionWinStreakByPlayer } from "@/components/ui/PlayerAvatar";
import type { DataVersionOptions } from "@/context/DataSyncContext";
import {
  getSessionWinStreaks,
  type SessionWinStreak,
} from "@/lib/sessionWinStreak";
import type { MatchInfo } from "@/types/match";
import { useLiveSessionReport } from "./useLiveSessionReport";

export interface LiveSessionHighlight {
  topRiser: SessionPlayerReport | null;
  /** 세션 경기를 뛴 정회원 중 누적 연승 3 이상인 회원. LiveSessionHighlightCard 연승 줄에 쓴다 */
  streaks: SessionWinStreak[];
  /** 회원 id → 세션 연승. 진행 중 경기·추천 매칭 아바타 링에 쓴다 */
  streakByPlayer: SessionWinStreakByPlayer;
}

/**
 * 진행 중 일반 세션의 세션 지배자와 세션 경기를 뛴 회원의 누적 연승. 홈 진행 화면과 진행 중 세션 상세가 같이 쓴다.
 * session이 없거나 대회 세션이면(대회 진행 화면에는 지배자가 없다) 받지 않고 비어 있다.
 * matches는 그 세션 경기(셸의 useLiveSession().matches)다. dataVersionOptions는 세션 리포트 재조회의 useDataVersion에 넘긴다
 */
export const useLiveSessionHighlight = (
  session: { id: string; kind: MatchSessionKind } | null,
  matches: readonly MatchInfo[],
  dataVersionOptions?: DataVersionOptions,
): LiveSessionHighlight => {
  const regularSessionId =
    session && session.kind !== "tournament" ? session.id : null;
  const { topRiser, winStreaks } = useLiveSessionReport(
    regularSessionId,
    dataVersionOptions,
  );
  const streaks = useMemo(
    () => (regularSessionId ? getSessionWinStreaks(matches, winStreaks) : []),
    [matches, regularSessionId, winStreaks],
  );
  return useMemo(
    () => ({
      topRiser,
      streaks,
      streakByPlayer: new Map(
        streaks.map((entry) => [entry.player.id, entry.winStreak]),
      ),
    }),
    [streaks, topRiser],
  );
};
