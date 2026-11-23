import type { Match, MatchScore } from "@pkpkdupr/shared/match";
import type { Player, PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import type { SpecialMatch } from "@pkpkdupr/shared/specialMatch";
import { describe, expect, it } from "vitest";
import {
  createRankingContext,
  type RankingMatch,
  type RankingSourcePlayer,
} from "../services/RankingService";
import {
  judgeSpecialMatchOutcome,
  settleSpecialMatch,
  type SpecialMatchSettleTarget,
} from "../services/SpecialMatchService";

const completedAt = new Date("2026-11-20T10:00:00.000Z");
const hoursBefore = (hours: number) =>
  new Date(completedAt.getTime() - hours * 60 * 60 * 1000);

const makePlayer = (id: string, doubles: number): RankingSourcePlayer => ({
  id,
  username: id,
  avatarUrl: `https://example.com/${id}.png`,
  isGuest: false,
  status: "active",
  duprRating: { singles: null, doubles },
});

const makeLog = (
  playerId: string,
  matchId: string,
  createdAt: Date,
  previousDoubles: number,
  nextDoubles: number,
): PlayerRatingChangeLog => ({
  id: `log-${playerId}-${matchId}`,
  playerId,
  source: "match_completed",
  sourceLogId: `match-completed-${matchId}-${createdAt.getTime()}`,
  previousRating: { singles: 3, doubles: previousDoubles },
  nextRating: { singles: 3, doubles: nextDoubles },
  delta: { singles: 0, doubles: nextDoubles - previousDoubles },
  createdAt,
});

const teamA = ["a1", "a2"];
const teamB = ["d1", "d2"];
const teamAWin: MatchScore[] = [{ scoreA: 11, scoreB: 7 }];
const teamBWin: MatchScore[] = [{ scoreA: 7, scoreB: 11 }];

/** guestIds에 든 선수는 게스트(isGuest)로 싣는다 */
const toTarget = (
  scores: MatchScore[],
  guestIds: readonly string[] = [],
): SpecialMatchSettleTarget => {
  const toPlayer = (id: string) =>
    ({
      id,
      username: id,
      avatarUrl: `https://example.com/${id}.png`,
      isGuest: guestIds.includes(id),
    }) as Player;
  return {
    id: "match-special",
    type: "mixed-doubles",
    completedAt,
    scores,
    teams: [
      { id: "team-a", name: "A", players: teamA.map(toPlayer) },
      { id: "team-b", name: "B", players: teamB.map(toPlayer) },
    ] as Match["teams"],
  };
};

const toRankingMatch = (
  id: string,
  at: Date,
  teams: [string[], string[]],
  scores: MatchScore[],
): RankingMatch => ({
  id,
  type: "mixed-doubles",
  sessionId: null,
  matchStartsAt: at,
  completedAt: at,
  teamPlayerIds: teams,
  scores,
});

/**
 * 이 경기 반영 전 순위: d2(3.8) 1위, d1(3.52) 2위, a1(3.48) 3위, a2(3.2) 4위.
 * after는 이 경기 직후 평점이고 지금 평점이다.
 */
const buildContext = (
  after: Record<string, number>,
  scores: MatchScore[],
  priorMatches: RankingMatch[] = [],
) => {
  const before: Record<string, number> = { a1: 3.48, a2: 3.2, d1: 3.52, d2: 3.8 };
  const ids = Object.keys(before);
  return createRankingContext(
    ids.map((id) => makePlayer(id, after[id])),
    ids.map((id) =>
      makeLog(id, "match-special", completedAt, before[id], after[id]),
    ),
    [
      ...priorMatches,
      toRankingMatch("match-special", completedAt, [teamA, teamB], scores),
    ],
  );
};

const challenge: SpecialMatch = {
  kind: "challenge",
  defendingTeamIndex: 1,
  protagonistIds: ["a1", "d1"],
  challengePairs: [{ attackerId: "a1", defenderId: "d1" }],
  outcome: null,
};

describe("특수 매치 결과 판정", () => {
  it("라이벌전은 이긴 팀 공격자가 반영 직후 방어자보다 순위가 높아지면 challenge_success이고 두 사람 순위 전후를 싣는다", () => {
    const context = buildContext(
      { a1: 3.56, a2: 3.28, d1: 3.44, d2: 3.72 },
      teamAWin,
    );

    expect(settleSpecialMatch(context, challenge, toTarget(teamAWin))).toEqual({
      outcome: "challenge_success",
      celebration: {
        kind: "challenge",
        defender: {
          player: { id: "d1", username: "d1", avatarUrl: "https://example.com/d1.png" },
          rankBefore: 2,
          rankAfter: 3,
        },
        challenger: {
          player: { id: "a1", username: "a1", avatarUrl: "https://example.com/a1.png" },
          rankBefore: 3,
          rankAfter: 2,
        },
      },
    });
  });

  it("도전 팀이 이겨도 순위가 뒤집히지 않으면 defense_success이고 연출은 없다", () => {
    const context = buildContext(
      { a1: 3.5, a2: 3.22, d1: 3.51, d2: 3.79 },
      teamAWin,
    );

    expect(settleSpecialMatch(context, challenge, toTarget(teamAWin))).toEqual({
      outcome: "defense_success",
      celebration: null,
    });
  });

  it("도전 팀이 지면 defense_success다", () => {
    const context = buildContext(
      { a1: 3.44, a2: 3.16, d1: 3.56, d2: 3.84 },
      teamBWin,
    );

    expect(judgeSpecialMatchOutcome(context, challenge, toTarget(teamBWin))).toBe(
      "defense_success",
    );
  });

  it("연승 저지는 연승 회원 팀이 지면 저지 성공이고 끊기기 직전 연승 수를 싣는다", () => {
    const streakStopper: SpecialMatch = {
      kind: "streak_stopper",
      defendingTeamIndex: 1,
      protagonistIds: [null, "d1"],
      challengePairs: [],
      outcome: null,
    };
    const priorWins = [5, 4, 3, 2, 1].map((hours) =>
      toRankingMatch(`prior-${hours}`, hoursBefore(hours), [["d1", "x1"], ["x2", "x3"]], teamAWin),
    );
    const context = buildContext(
      { a1: 3.56, a2: 3.28, d1: 3.44, d2: 3.72 },
      teamAWin,
      priorWins,
    );

    expect(settleSpecialMatch(context, streakStopper, toTarget(teamAWin))).toEqual({
      outcome: "streak_stopped",
      celebration: {
        kind: "streak_stopper",
        stopped: {
          player: { id: "d1", username: "d1", avatarUrl: "https://example.com/d1.png" },
          streakBefore: 5,
        },
      },
    });
    expect(
      settleSpecialMatch(context, streakStopper, toTarget(teamBWin)),
    ).toEqual({ outcome: "streak_defended", celebration: null });
  });

  it("최강자전은 승패가 갈리면 최강자전 승리이고 양쪽 주인공의 직전 연승 수를 싣는다", () => {
    const champions: SpecialMatch = {
      kind: "champions",
      defendingTeamIndex: null,
      protagonistIds: ["a1", "d1"],
      challengePairs: [],
      outcome: null,
    };
    const priorWins = [
      ...[6, 5, 4, 3, 2].map((hours) =>
        toRankingMatch(`prior-a-${hours}`, hoursBefore(hours), [["a1", "x1"], ["x2", "x3"]], teamAWin),
      ),
      ...[7, 6.5, 5.5, 4.5, 3.5, 2.5].map((hours) =>
        toRankingMatch(`prior-d-${hours}`, hoursBefore(hours), [["x4", "x5"], ["d1", "x6"]], teamBWin),
      ),
    ];
    const context = buildContext(
      { a1: 3.44, a2: 3.16, d1: 3.56, d2: 3.84 },
      teamBWin,
      priorWins,
    );

    expect(settleSpecialMatch(context, champions, toTarget(teamBWin))).toEqual({
      outcome: "champions_won",
      celebration: {
        kind: "champions",
        winner: {
          player: { id: "d1", username: "d1", avatarUrl: "https://example.com/d1.png" },
          streakBefore: 6,
        },
        loser: {
          player: { id: "a1", username: "a1", avatarUrl: "https://example.com/a1.png" },
          streakBefore: 5,
        },
      },
    });
  });

  it("리벤지는 지키는 쪽이 아닌 팀이 이기면 리벤지 성공, 지면 리벤지 방어이고 연출은 없다", () => {
    const revenge: SpecialMatch = {
      kind: "revenge",
      defendingTeamIndex: 0,
      protagonistIds: [null, null],
      challengePairs: [],
      outcome: null,
    };
    const context = buildContext(
      { a1: 3.44, a2: 3.16, d1: 3.56, d2: 3.84 },
      teamBWin,
    );

    expect(settleSpecialMatch(context, revenge, toTarget(teamBWin))).toEqual({
      outcome: "revenge_success",
      celebration: null,
    });
    expect(judgeSpecialMatchOutcome(context, revenge, toTarget(teamAWin))).toBe(
      "revenge_defended",
    );
  });

  it("게스트가 낀 연승 저지도 승패로 결과를 정하고, 끊기기 직전 연승은 게스트가 낀 경기까지 센다", () => {
    const streakStopper: SpecialMatch = {
      kind: "streak_stopper",
      defendingTeamIndex: 1,
      protagonistIds: [null, "d1"],
      challengePairs: [],
      outcome: null,
    };
    // 직전 5연승 중 2경기는 게스트 g1이 낀 경기다
    const priorWins = [
      ...[5, 4, 3].map((hours) =>
        toRankingMatch(`prior-${hours}`, hoursBefore(hours), [["d1", "x1"], ["x2", "x3"]], teamAWin),
      ),
      ...[2, 1].map((hours) =>
        toRankingMatch(`prior-guest-${hours}`, hoursBefore(hours), [["d1", "g1"], ["x2", "x3"]], teamAWin),
      ),
    ];
    const context = buildContext(
      { a1: 3.48, a2: 3.2, d1: 3.52, d2: 3.8 },
      teamAWin,
      priorWins,
    );

    expect(
      settleSpecialMatch(context, streakStopper, toTarget(teamAWin, ["a2"])),
    ).toEqual({
      outcome: "streak_stopped",
      celebration: {
        kind: "streak_stopper",
        stopped: {
          player: { id: "d1", username: "d1", avatarUrl: "https://example.com/d1.png" },
          streakBefore: 5,
        },
      },
    });
    expect(
      settleSpecialMatch(context, streakStopper, toTarget(teamBWin, ["a2"])),
    ).toEqual({ outcome: "streak_defended", celebration: null });
  });

  it("게스트가 낀 최강자전도 승패가 갈리면 최강자전 승리다", () => {
    const champions: SpecialMatch = {
      kind: "champions",
      defendingTeamIndex: null,
      protagonistIds: ["a1", "d1"],
      challengePairs: [],
      outcome: null,
    };
    const context = buildContext(
      { a1: 3.48, a2: 3.2, d1: 3.52, d2: 3.8 },
      teamBWin,
    );

    expect(
      settleSpecialMatch(context, champions, toTarget(teamBWin, ["d2"])),
    ).toMatchObject({
      outcome: "champions_won",
      celebration: { kind: "champions" },
    });
  });

  it("게스트가 있는 라이벌전은 결과가 null이고 연출이 없다", () => {
    const context = buildContext(
      { a1: 3.6, a2: 3.2, d1: 3.4, d2: 3.8 },
      teamAWin,
    );

    expect(
      settleSpecialMatch(context, challenge, toTarget(teamAWin, ["a2"])),
    ).toEqual({ outcome: null, celebration: null });
  });

  it("승패가 갈리지 않으면 결과가 null이다", () => {
    const context = buildContext({ a1: 3.48, a2: 3.2, d1: 3.52, d2: 3.8 }, []);

    expect(settleSpecialMatch(context, challenge, toTarget([]))).toEqual({
      outcome: null,
      celebration: null,
    });
  });
});
