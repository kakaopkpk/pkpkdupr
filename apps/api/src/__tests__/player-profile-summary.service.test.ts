import type { Match } from "@pkpkdupr/shared/match";
import type { Player, PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
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
const viewer = makePlayer("Pviewer1");
const partnerA = makePlayer("Ppartnra");
const partnerB = makePlayer("Ppartnrb");
const partnerC = makePlayer("Ppartnrc");
const emptyHistory = { singles: [], doubles: [] };
const dayMs = 24 * 60 * 60 * 1000;

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
      me.id,
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

  describe("파트너 궁합", () => {
    let seq = 0;
    const doubles = (partner: Player, won: boolean, extra: Partial<Match> = {}) =>
      makeMatch({
        id: `Md${String(seq++).padStart(6, "0")}`,
        type: "mixed-doubles",
        teams: [
          { id: "team-a", name: "Team A", players: [me, partner] },
          { id: "team-b", name: "Team B", players: [opponent, viewer] },
        ],
        scores: [won ? { scoreA: 11, scoreB: 5 } : { scoreA: 5, scoreB: 11 }],
        ...extra,
      });

    it("같은 팀 복식 완료 경기가 3경기 이상인 파트너만 넣는다", () => {
      const matches = [
        doubles(partnerA, true),
        doubles(partnerA, true),
        doubles(partnerB, true),
        doubles(partnerB, false),
        doubles(partnerB, true),
      ];

      const summary = buildPlayerProfileSummary(
        matches,
        me.id,
        emptyHistory,
        me.id,
        now,
      );

      expect(summary.partners).toEqual([
        {
          partner: { id: partnerB.id, username: partnerB.username, avatarUrl: undefined },
          matchCount: 3,
          wins: 2,
          losses: 1,
        },
      ]);
    });

    it("승률 내림차순 → 경기 수 내림차순 → 아이디 오름차순으로 정렬한다", () => {
      const matches = [
        // partnerC: 3전 3승(100%)
        ...[1, 2, 3].map(() => doubles(partnerC, true)),
        // partnerB: 4전 2승(50%)
        ...[true, true, false, false].map((won) => doubles(partnerB, won)),
        // partnerA: 4전 2승(50%) — 아이디로 partnerB보다 앞
        ...[true, false, true, false].map((won) => doubles(partnerA, won)),
        // opponent: 6전 3승(50%) — 경기 수로 앞
        ...[true, false, true, false, true, false].map((won) =>
          makeMatch({
            id: `Mo${String(seq++).padStart(6, "0")}`,
            type: "men-doubles",
            teams: [
              { id: "team-a", name: "Team A", players: [opponent, me] },
              { id: "team-b", name: "Team B", players: [partnerA, viewer] },
            ],
            scores: [won ? { scoreA: 11, scoreB: 3 } : { scoreA: 3, scoreB: 11 }],
          }),
        ),
      ];

      const summary = buildPlayerProfileSummary(
        matches,
        me.id,
        emptyHistory,
        me.id,
        now,
      );

      expect(summary.partners.map((stat) => stat.partner.id)).toEqual([
        partnerC.id,
        opponent.id,
        partnerA.id,
        partnerB.id,
      ]);
    });

    it("진행 중 경기와 단식은 파트너 궁합에 넣지 않는다", () => {
      const matches = [
        doubles(partnerA, true),
        doubles(partnerA, true),
        doubles(partnerA, true, {
          status: "created",
          scores: [],
          completedAt: null,
        }),
        makeMatch({ id: "Msingle1" }),
      ];

      const summary = buildPlayerProfileSummary(
        matches,
        me.id,
        emptyHistory,
        me.id,
        now,
      );

      expect(summary.partners).toEqual([]);
    });
  });

  describe("상대 전적", () => {
    it("요청자 기준 승패를 단식·복식 합쳐 센다", () => {
      const matches = [
        // 대상(me)이 viewer를 단식에서 이김 → viewer 1패
        makeMatch({
          id: "Mh2h0001",
          teams: [
            { id: "team-a", name: "Team A", players: [me] },
            { id: "team-b", name: "Team B", players: [viewer] },
          ],
          scores: [{ scoreA: 11, scoreB: 4 }],
        }),
        // 복식에서 viewer 팀이 이김 → viewer 1승
        makeMatch({
          id: "Mh2h0002",
          type: "men-doubles",
          teams: [
            { id: "team-a", name: "Team A", players: [me, partnerA] },
            { id: "team-b", name: "Team B", players: [viewer, partnerB] },
          ],
          scores: [{ scoreA: 9, scoreB: 11 }],
        }),
        // 같은 팀이면 맞대결이 아니다
        makeMatch({
          id: "Mh2h0003",
          type: "men-doubles",
          teams: [
            { id: "team-a", name: "Team A", players: [me, viewer] },
            { id: "team-b", name: "Team B", players: [partnerA, partnerB] },
          ],
        }),
        // 진행 중 경기는 제외
        makeMatch({
          id: "Mh2h0004",
          status: "created",
          scores: [],
          completedAt: null,
          teams: [
            { id: "team-a", name: "Team A", players: [me] },
            { id: "team-b", name: "Team B", players: [viewer] },
          ],
        }),
      ];

      const summary = buildPlayerProfileSummary(
        matches,
        me.id,
        emptyHistory,
        viewer.id,
        now,
      );

      expect(summary.headToHead).toEqual({ matchCount: 2, wins: 1, losses: 1 });
    });

    it("맞대결이 없으면 0, 본인이면 null이다", () => {
      const matches = [makeMatch({ id: "Mnoh2h01" })];

      expect(
        buildPlayerProfileSummary(matches, me.id, emptyHistory, viewer.id, now)
          .headToHead,
      ).toEqual({ matchCount: 0, wins: 0, losses: 0 });
      expect(
        buildPlayerProfileSummary(matches, me.id, emptyHistory, me.id, now)
          .headToHead,
      ).toBeNull();
    });
  });

  describe("평점 변화·최근 7일 경기 수", () => {
    it("최근 7일 분류별 완료 경기 수와 90일 평점 변화를 센다", () => {
      const ratingChange = (
        matchId: string,
        ageDays: number,
        delta: number,
      ): PlayerRatingChangeLog => ({
        id: `log-${matchId}`,
        playerId: me.id,
        source: "match_completed",
        sourceLogId: matchId,
        previousRating: { singles: 3, doubles: 3 },
        nextRating: { singles: 3 + delta, doubles: 3 },
        delta: { singles: delta, doubles: 0 },
        createdAt: new Date(now.getTime() - ageDays * dayMs),
      });
      const matches = [
        {
          ...makeMatch({
            id: "Mrecent1",
            completedAt: new Date(now.getTime() - 2 * dayMs),
          }),
          ratingChanges: [ratingChange("Mrecent1", 2, 0.1)],
        },
        {
          ...makeMatch({
            id: "Mmonth01",
            completedAt: new Date(now.getTime() - 20 * dayMs),
          }),
          ratingChanges: [ratingChange("Mmonth01", 20, 0.2)],
        },
        {
          ...makeMatch({
            id: "Mquartr1",
            completedAt: new Date(now.getTime() - 60 * dayMs),
          }),
          ratingChanges: [ratingChange("Mquartr1", 60, 0.3)],
        },
        {
          ...makeMatch({
            id: "Mold0001",
            completedAt: new Date(now.getTime() - 120 * dayMs),
          }),
          ratingChanges: [ratingChange("Mold0001", 120, 0.4)],
        },
        makeMatch({
          id: "Mdbl0001",
          type: "mixed-doubles",
          teams: [
            { id: "team-a", name: "Team A", players: [me, partnerA] },
            { id: "team-b", name: "Team B", players: [opponent, viewer] },
          ],
          completedAt: new Date(now.getTime() - 1 * dayMs),
        }),
        makeMatch({
          id: "Mprogres",
          status: "created",
          scores: [],
          completedAt: null,
          matchStartsAt: now,
        }),
      ];

      const summary = buildPlayerProfileSummary(
        matches,
        me.id,
        emptyHistory,
        me.id,
        now,
      );

      expect(summary.ratingDelta.singles.last7DaysMatchCount).toBe(1);
      expect(summary.ratingDelta.doubles.last7DaysMatchCount).toBe(1);
      expect(summary.ratingDelta.singles.last7Days).toBeCloseTo(0.1);
      expect(summary.ratingDelta.singles.last30Days).toBeCloseTo(0.3);
      expect(summary.ratingDelta.singles.last90Days).toBeCloseTo(0.6);
    });
  });
});
