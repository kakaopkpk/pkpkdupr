import { MatchRepository } from "@pkpkdupr/db";
import type { Match } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import { describe, expect, it, vi } from "vitest";

const at = new Date("2026-11-21T10:00:00+09:00");

const player = (id: string): Player => ({
  isGuest: false,
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: at,
  updatedAt: at,
});

const match = (
  id: string,
  status: Match["status"],
  sessionId?: string,
): Match => ({
  id,
  type: "singles",
  source: status === "scheduled" ? "admin_created" : "player_created",
  creatorPlayerId: "Pplayera",
  session: sessionId
    ? { id: sessionId, name: `세션 ${sessionId}`, date: at, location: "탄천" }
    : undefined,
  status,
  round: status === "scheduled" ? 1 : null,
  teams: [
    { id: `${id}-a`, name: "Team A", players: [player("Pplayera")] },
    { id: `${id}-b`, name: "Team B", players: [player("Pplayerb")] },
  ],
  scores: status === "completed" ? [{ scoreA: 11, scoreB: 5 }] : [],
  resultSubmittedByPlayerId: null,
  resultSubmittedAt: null,
  location: "탄천",
  matchStartsAt: at,
  createdAt: at,
  completedAt: status === "completed" ? at : null,
  updatedAt: at,
  ratingExcluded: false,
});

// drizzle의 select().from().orderBy() 체인. 세션 참여자·회원 조회는 빈 목록이다.
const emptySelectExecutor = {
  select: vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "limit"]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (value: unknown[]) => unknown) => resolve([]);
    return chain;
  }),
};

describe("MatchRepository.findFeed", () => {
  it("대진 예정 경기는 피드에서 빠지고, 예정 경기만 있는 세션은 나오지 않는다", async () => {
    const repository = new MatchRepository(emptySelectExecutor, {
      execute: vi.fn(),
      transaction: vi.fn(),
    });
    vi.spyOn(
      repository as unknown as { loadAllMatches: () => Promise<Match[]> },
      "loadAllMatches",
    ).mockResolvedValue([
      match("Msched01", "scheduled", "Sonlysch"),
      match("Msched02", "scheduled", "Smixedxx"),
      match("Mdone001", "completed", "Smixedxx"),
      match("Mloose01", "completed"),
    ]);

    const { items, total } = await repository.findFeed(0, 20);

    expect(total).toBe(2);
    expect(items).toEqual([
      expect.objectContaining({
        kind: "session",
        session: expect.objectContaining({
          id: "Smixedxx",
          matchCount: 1,
          status: "completed",
        }),
      }),
      expect.objectContaining({
        kind: "match",
        match: expect.objectContaining({ id: "Mloose01" }),
      }),
    ]);
  });
});
