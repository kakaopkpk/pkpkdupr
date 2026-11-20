import { useMemo } from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import type { MatchSessionKind } from "@pkpkdupr/shared/session";
import type { SessionWinStreakByPlayer } from "@/components/ui/PlayerAvatar";
import {
  getSessionWinStreaks,
  type SessionWinStreak,
} from "@/lib/sessionWinStreak";
import type { MatchInfo } from "@/types/match";
import { useSessionTopRiser } from "./useSessionTopRiser";

export interface LiveSessionHighlight {
  topRiser: SessionPlayerReport | null;
  /** 세션 연승(3 이상) 회원. LiveSessionHighlightCard 연승 줄에 쓴다 */
  streaks: SessionWinStreak[];
  /** 회원 id → 세션 연승. 진행 중 경기·추천 매칭 아바타 링에 쓴다 */
  streakByPlayer: SessionWinStreakByPlayer;
}

/**
 * 진행 중 일반 세션의 세션 지배자와 세션 연승. 홈 진행 화면과 진행 중 세션 상세가 같이 쓴다.
 * session이 없거나 대회 세션이면(대회 진행 화면에는 지배자가 없다) 받지 않고 비어 있다.
 * matches는 그 세션 경기(셸의 useLiveSession().matches)다
 */
export const useLiveSessionHighlight = (
  session: { id: string; kind: MatchSessionKind } | null,
  matches: readonly MatchInfo[],
  dataVersion: number,
): LiveSessionHighlight => {
  const regularSessionId =
    session && session.kind !== "tournament" ? session.id : null;
  const topRiser = useSessionTopRiser(regularSessionId, dataVersion);
  const streaks = useMemo(
    () => (regularSessionId ? getSessionWinStreaks(matches) : []),
    [matches, regularSessionId],
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
