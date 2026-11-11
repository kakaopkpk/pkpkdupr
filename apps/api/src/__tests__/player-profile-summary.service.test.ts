import type { Match } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import { describe, expect, it } from "vitest";
import { buildPlayerProfileSummary } from "../services/PlayerProfileSummaryService";

const now = new Date("2026-11-12T12:00:00.000Z");

const makePlayer = (id: string): Player => ({
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
});

const me = makePlayer("Pmeplayr");
const opponent = makePlayer("Popponen");

const makeMatch = (overrides: Partial<Match>): Match => ({
  id: "Mmatch01",
  type: "unrestricted-singles",
  source: "player_created",
  creatorPlayerId: me.id,
  status: "completed",
  teams: [
    { id: "team-a", name: "Team A", players: [me] },
    { id: "team-b", name: "Team B", players: [opponent] },
  ],
  scores: [{ scoreA: 11, scoreB: 7 }],
  resultSubmittedByPlayerId: me.id,
  resultSubmittedAt: now,
  location: "야탑초등학교",
  matchStartsAt: new Date(now.getTime() - 60 * 60 * 1000),
  completedAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe("buildPlayerProfileSummary", () => {
  it("진행 중(점수 없는 created) 경기는 통계·최근 경기에 넣지 않는다", () => {
    const completed = makeMatch({ id: "Mcomplet" });
    const inProgress = makeMatch({
      id: "Minprogr",
      status: "created",
      scores: [],
      resultSubmittedByPlayerId: null,
      resultSubmittedAt: null,
      completedAt: null,
      matchStartsAt: now,
    });

    const summary = buildPlayerProfileSummary(
      [inProgress, completed],
      me.id,
      { singles: [], doubles: [] },
      now,
    );

    expect(summary.matchStats.singles).toEqual({
      matchWins: 1,
      matchLosses: 0,
      setWins: 1,
      setLosses: 0,
    });
    expect(summary.recentMatches.map((match) => match.id)).toEqual([
      "Mcomplet",
    ]);
  });
});
