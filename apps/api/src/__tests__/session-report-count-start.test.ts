import { ACHIEVEMENT_COUNT_START } from "@pkpkdupr/shared/achievementCountStart";
import type { PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import { describe, expect, it } from "vitest";
import {
  buildSessionReport,
  createRankingContext,
  type RankingMatch,
  type RankingSession,
  type RankingSourcePlayer,
} from "../services/RankingService";

// 실제 업적 기준 시각(2026-11-17 00:00 KST)으로 세션 리포트 업적을 확인한다.
const makePlayer = (id: string, username: string): RankingSourcePlayer => ({
  isGuest: false,
  id,
  username,
  status: "active",
  duprRating: { singles: null, doubles: 3.7 },
});

const makeLog = (
  playerId: string,
  matchId: string,
  createdAt: Date,
  nextDoubles: number,
): PlayerRatingChangeLog => ({
  id: `log-${playerId}-${matchId}`,
  playerId,
  source: "match_completed",
  sourceLogId: `match-completed-${matchId}-${createdAt.getTime()}`,
  previousRating: { singles: 3, doubles: 3.4 },
  nextRating: { singles: 3, doubles: nextDoubles },
  delta: { singles: 0, doubles: nextDoubles - 3.4 },
  createdAt,
});

describe("세션 리포트 업적과 업적 기준 시각", () => {
  it("업적 기준 시각 시점 평점으로 받은 평점 업적은 기준 시각 전 세션 리포트에 나오지 않는다", () => {
    const completedAt = new Date(ACHIEVEMENT_COUNT_START.getTime() - 3_600_000);
    const players = ["Palice01", "Pbob0001", "Pcarol01", "Pdave001"].map(
      (id, index) => makePlayer(id, `user${index}`),
    );
    const match: RankingMatch = {
      id: "Mmatch01",
      type: "unrestricted-doubles",
      sessionId: "Ssession1",
      matchStartsAt: completedAt,
      completedAt,
      teamPlayerIds: [
        ["Palice01", "Pbob0001"],
        ["Pcarol01", "Pdave001"],
      ],
      scores: [{ scoreA: 11, scoreB: 5 }],
    };
    const session: RankingSession = {
      id: "Ssession1",
      name: "목요 정기운동",
      kind: "regular",
      date: new Date(ACHIEVEMENT_COUNT_START.getTime() - 86_400_000),
      startTime: "18:00",
      endTime: "22:00",
      location: "야탑초등학교",
      participantIds: [],
    };

    const report = buildSessionReport({
      context: createRankingContext(
        players,
        [makeLog("Palice01", "Mmatch01", completedAt, 3.7)],
        [match],
      ),
      session,
      dominations: new Map(),
    });

    expect(report?.achievements).toEqual([]);
  });
});
