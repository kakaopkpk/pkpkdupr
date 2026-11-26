import type { Match } from "@pkpkdupr/shared/match";
import type { Player, PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import { describe, expect, it, vi } from "vitest";
import {
  buildPeakRating,
  buildPlayerProfileSummary,
} from "../services/PlayerProfileSummaryService";

// 이 파일의 고정 데이터는 업적 기준 시각(2026-11-17 KST) 전 경기라, 업적은 기준 시각 없이 센다.
vi.mock("@pkpkdupr/shared/achievementCountStart", () => ({
  ACHIEVEMENT_COUNT_START: new Date(0),
  // 언더독·연승 저지 등 새 업적 지표는 이 파일에서 검증하지 않으므로 세지 않는다.
  SECOND_ACHIEVEMENT_SET_COUNT_START: new Date("2100-01-01T00:00:00.000Z"),
  TOURNAMENT_ACHIEVEMENT_COUNT_START: new Date("2100-01-01T00:00:00.000Z"),
}));

const now = new Date("2026-11-12T12:00:00.000Z");

const makePlayer = (id: string): Player => ({
  isGuest: false,
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
  ratingExcluded: false,
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
  it("게스트가 낀 경기도 승패·최근 경기 수·파트너·상대 전적·연승에 세고, 평점 변화는 0으로 더한다", () => {
    const guestPartner = { ...makePlayer("Pguest01"), isGuest: true };
    const doublesMatch = (id: string, minutesAgo: number, won: boolean) =>
      makeMatch({
        id,
        type: "unrestricted-doubles",
        ratingExcluded: true,
        teams: [
          { id: "team-a", name: "Team A", players: [me, guestPartner] },
          { id: "team-b", name: "Team B", players: [opponent, viewer] },
        ],
        scores: [won ? { scoreA: 11, scoreB: 7 } : { scoreA: 7, scoreB: 11 }],
        completedAt: new Date(now.getTime() - minutesAgo * 60_000),
      });
    const matches = [
      doublesMatch("Mguest01", 30, true),
      doublesMatch("Mguest02", 20, true),
      doublesMatch("Mguest03", 10, false),
    ];

    const summary = buildPlayerProfileSummary(
      matches,
      me.id,
      emptyHistory,
      viewer.id,
      now,
    );

    expect(summary.matchStats.doubles).toMatchObject({
      matchWins: 2,
      matchLosses: 1,
    });
    expect(summary.ratingDelta.doubles).toMatchObject({
      last7Days: 0,
      last7DaysMatchCount: 3,
      last7DaysWins: 2,
      last7DaysLosses: 1,
    });
    expect(summary.partners).toEqual([
      expect.objectContaining({
        partner: expect.objectContaining({ id: guestPartner.id }),
        matchCount: 3,
        wins: 2,
      }),
    ]);
    expect(summary.headToHead?.doubles).toEqual({
      matchCount: 3,
      wins: 1,
      losses: 2,
      ratingDelta: 0,
    });
    expect(summary.winStreak).toBe(0);

    const { winStreak } = buildPlayerProfileSummary(
      matches.slice(0, 2),
      me.id,
      emptyHistory,
      me.id,
      now,
    );
    expect(winStreak).toBe(2);
  });

  it("게스트 본인 프로필은 업적을 받지 않은 상태이고 연승이 0이다", () => {
    const guestPlayer = { ...makePlayer("Pguest01"), isGuest: true };
    const matches = [1, 2, 3].map((index) =>
      makeMatch({
        id: `Mguest0${index}`,
        ratingExcluded: true,
        teams: [
          { id: "team-a", name: "Team A", players: [guestPlayer] },
          { id: "team-b", name: "Team B", players: [opponent] },
        ],
        completedAt: new Date(now.getTime() - (10 - index) * 60_000),
      }),
    );

    const summary = buildPlayerProfileSummary(
      matches,
      guestPlayer.id,
      emptyHistory,
      me.id,
      now,
    );

    expect(summary.matchStats.singles.matchWins).toBe(3);
    expect(summary.winStreak).toBe(0);
    expect(summary.achievements.every((item) => !item.earned)).toBe(true);
    expect(summary.achievements.every((item) => item.current === 0)).toBe(
      true,
    );
  });

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

  it("업적 56개 진행 상태를 정의 순서로 넣고 진행 중 경기는 세지 않는다", () => {
    const completed = makeMatch({ id: "Mcomplet" });
    const inProgress = makeMatch({
      id: "Minprogr",
      status: "created",
      scores: [],
      completedAt: null,
    });

    const { achievements } = buildPlayerProfileSummary(
      [inProgress, completed],
      me.id,
      emptyHistory,
      me.id,
      now,
    );

    expect(achievements).toHaveLength(56);
    expect(achievements[0]).toEqual({
      id: "matches-1",
      earned: true,
      earnedAt: now,
      earnedMatchId: "Mcomplet",
      current: 1,
      target: 1,
    });
    expect(achievements.find((item) => item.id === "matches-10")).toMatchObject(
      { earned: false, current: 1, target: 10 },
    );
  });

  it("평점 업적은 경기에 붙은 이 회원의 마지막 평점 로그로 센다", () => {
    const log = (
      playerId: string,
      nextDoubles: number,
      createdAt: Date,
    ): PlayerRatingChangeLog => ({
      id: `log-${playerId}-${createdAt.getTime()}`,
      playerId,
      source: "match_completed",
      sourceLogId: `match-completed-Mdouble1-${createdAt.getTime()}`,
      previousRating: { singles: 3, doubles: 3.4 },
      nextRating: { singles: 3, doubles: nextDoubles },
      delta: { singles: 0, doubles: nextDoubles - 3.4 },
      createdAt,
    });
    const doublesMatch = {
      ...makeMatch({
        id: "Mdouble1",
        type: "mixed-doubles",
        teams: [
          { id: "team-a", name: "Team A", players: [me, partnerA] },
          { id: "team-b", name: "Team B", players: [opponent, viewer] },
        ],
      }),
      ratingChanges: [
        log(me.id, 3.51, now),
        log(me.id, 3.45, new Date(now.getTime() - 1000)),
        log(partnerA.id, 4.1, now),
      ],
    };

    // 평점 업적은 복식 10경기부터 센다. 앞선 9경기는 평점 로그가 없다
    const earlierDoubles = Array.from({ length: 9 }, (_, index) =>
      makeMatch({
        id: `Mearly0${index + 1}`,
        type: "mixed-doubles",
        teams: doublesMatch.teams,
        completedAt: new Date(now.getTime() - (9 - index) * 60_000),
      }),
    );

    const { achievements } = buildPlayerProfileSummary(
      [...earlierDoubles, doublesMatch],
      me.id,
      emptyHistory,
      me.id,
      now,
    );

    expect(achievements.find((item) => item.id === "rating-3.5")).toEqual({
      id: "rating-3.5",
      earned: true,
      earnedAt: now,
      earnedMatchId: "Mdouble1",
      current: 3.51,
      target: 3.5,
      ratedDoublesMatches: 10,
    });
    expect(achievements.find((item) => item.id === "rating-4.0")).toMatchObject(
      { earned: false, current: 3.51 },
    );
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

  describe("천적", () => {
    let seq = 0;
    const versus = (
      opponents: Player[],
      won: boolean,
      extra: Partial<Match> = {},
    ) =>
      makeMatch({
        id: `Mr${String(seq++).padStart(6, "0")}`,
        type: opponents.length > 1 ? "men-doubles" : "unrestricted-singles",
        teams: [
          {
            id: "team-a",
            name: "Team A",
            players: opponents.length > 1 ? [me, viewer] : [me],
          },
          { id: "team-b", name: "Team B", players: opponents },
        ],
        scores: [won ? { scoreA: 11, scoreB: 5 } : { scoreA: 5, scoreB: 11 }],
        ...extra,
      });
    const rivalIds = (matches: Match[]) =>
      buildPlayerProfileSummary(matches, me.id, emptyHistory, me.id, now)
        .rivals.map((stat) => stat.opponent.id);

    it("3경기 이상 만나 진 비율이 50% 이상인 상대만 넣는다", () => {
      const matches = [
        // partnerA: 2전 2패 — 경기 수 부족
        versus([partnerA], false),
        versus([partnerA], false),
        // partnerB: 4전 2패(50%) — 포함
        ...[true, false, true, false].map((won) => versus([partnerB], won)),
        // partnerC: 3전 1패(33%) — 제외
        ...[true, true, false].map((won) => versus([partnerC], won)),
        // 진행 중·승패 없는 경기는 세지 않는다
        versus([partnerA], false, {
          status: "created",
          scores: [],
          completedAt: null,
        }),
        versus([partnerA], false, { scores: [{ scoreA: 11, scoreB: 11 }] }),
      ];

      const summary = buildPlayerProfileSummary(
        matches,
        me.id,
        emptyHistory,
        me.id,
        now,
      );

      expect(summary.rivals).toEqual([
        {
          opponent: {
            id: partnerB.id,
            username: partnerB.username,
            avatarUrl: undefined,
          },
          matchCount: 4,
          wins: 2,
          losses: 2,
        },
      ]);
    });

    it("복식은 상대 두 명 각각과 1경기로 세고 단식과 합친다", () => {
      const matches = [
        versus([partnerA, partnerB], false),
        versus([partnerA, partnerB], false),
        versus([partnerA], false),
      ];

      const summary = buildPlayerProfileSummary(
        matches,
        me.id,
        emptyHistory,
        me.id,
        now,
      );

      expect(
        summary.rivals.map(({ opponent, matchCount, losses }) => ({
          id: opponent.id,
          matchCount,
          losses,
        })),
      ).toEqual([{ id: partnerA.id, matchCount: 3, losses: 3 }]);
    });

    it("진 비율 → 경기 수 → 아이디 순으로 정렬하고 조건에 맞는 상대를 전부 넣는다", () => {
      const extra = makePlayer("Pextra01");
      const matches = [
        // opponent: 3전 3패(100%)
        ...[1, 2, 3].map(() => versus([opponent], false)),
        // partnerC: 4전 3패(75%)
        ...[false, false, false, true].map((won) => versus([partnerC], won)),
        // partnerB: 4전 2패(50%) — 아이디로 partnerA 뒤
        ...[false, false, true, true].map((won) => versus([partnerB], won)),
        // partnerA: 4전 2패(50%)
        ...[false, true, false, true].map((won) => versus([partnerA], won)),
        // extra: 6전 3패(50%) — 경기 수로 50% 중 가장 앞
        ...[false, true, false, true, false, true].map((won) =>
          versus([extra], won),
        ),
      ];

      expect(rivalIds(matches)).toEqual([
        opponent.id,
        partnerC.id,
        extra.id,
        partnerA.id,
        partnerB.id,
      ]);
    });
  });

  describe("상대 전적", () => {
    it("요청자 기준 승패와 요청자 평점 변화 합을 분류별로 센다", () => {
      const viewerChange = (
        matchId: string,
        delta: { singles: number; doubles: number },
      ): PlayerRatingChangeLog => ({
        id: `log-${matchId}`,
        playerId: viewer.id,
        source: "match_completed",
        sourceLogId: matchId,
        previousRating: { singles: 3, doubles: 3 },
        nextRating: {
          singles: 3 + delta.singles,
          doubles: 3 + delta.doubles,
        },
        delta,
        createdAt: now,
      });
      const viewerChanges = new Map<string, PlayerRatingChangeLog[]>();
      const withViewerChange = (
        match: Match,
        delta: { singles: number; doubles: number },
      ) => {
        viewerChanges.set(match.id, [viewerChange(match.id, delta)]);
        return match;
      };
      const matches = [
        // 대상(me)이 viewer를 단식에서 이김 → viewer 1패, 단식 평점 −0.02
        withViewerChange(
          makeMatch({
            id: "Mh2h0001",
            teams: [
              { id: "team-a", name: "Team A", players: [me] },
              { id: "team-b", name: "Team B", players: [viewer] },
            ],
            scores: [{ scoreA: 11, scoreB: 4 }],
          }),
          { singles: -0.02, doubles: 0 },
        ),
        // 복식에서 viewer 팀이 이김 → viewer 1승, 복식 평점 +0.03
        withViewerChange(
          makeMatch({
            id: "Mh2h0002",
            type: "men-doubles",
            teams: [
              { id: "team-a", name: "Team A", players: [me, partnerA] },
              { id: "team-b", name: "Team B", players: [viewer, partnerB] },
            ],
            scores: [{ scoreA: 9, scoreB: 11 }],
          }),
          { singles: 0, doubles: 0.03 },
        ),
        // 같은 팀이면 맞대결이 아니라 승패·평점 변화 모두 넣지 않는다
        withViewerChange(
          makeMatch({
            id: "Mh2h0003",
            type: "men-doubles",
            teams: [
              { id: "team-a", name: "Team A", players: [me, viewer] },
              { id: "team-b", name: "Team B", players: [partnerA, partnerB] },
            ],
          }),
          { singles: 0, doubles: 0.05 },
        ),
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
        undefined,
        viewerChanges,
      );

      expect(summary.headToHead).toEqual({
        singles: { matchCount: 1, wins: 0, losses: 1, ratingDelta: -0.02 },
        doubles: { matchCount: 1, wins: 1, losses: 0, ratingDelta: 0.03 },
      });
    });

    it("맞대결이 없으면 0, 본인이면 null이다", () => {
      const matches = [makeMatch({ id: "Mnoh2h01" })];

      expect(
        buildPlayerProfileSummary(matches, me.id, emptyHistory, viewer.id, now)
          .headToHead,
      ).toEqual({
        singles: { matchCount: 0, wins: 0, losses: 0, ratingDelta: 0 },
        doubles: { matchCount: 0, wins: 0, losses: 0, ratingDelta: 0 },
      });
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

describe("buildPeakRating", () => {
  const makeLog = (
    nextRating: { singles: number; doubles: number },
    delta: { singles: number; doubles: number },
  ): PlayerRatingChangeLog => ({
    id: `log-${nextRating.singles}-${nextRating.doubles}`,
    playerId: me.id,
    source: "match_completed",
    sourceLogId: "match-completed-Mmatch01-1",
    previousRating: {
      singles: nextRating.singles - delta.singles,
      doubles: nextRating.doubles - delta.doubles,
    },
    nextRating,
    delta,
    createdAt: now,
  });

  it("그 분류 평점이 바뀐 로그와 지금 평점 중 최댓값을 분류별로 고른다", () => {
    const logs = [
      makeLog({ singles: 3.0, doubles: 3.214 }, { singles: 0, doubles: 0.05 }),
      // 복식 경기 로그의 단식 값은 바뀌지 않았으므로 단식 최고에 넣지 않는다
      makeLog({ singles: 3.9, doubles: 3.1 }, { singles: 0, doubles: -0.114 }),
      makeLog({ singles: 3.3, doubles: 3.1 }, { singles: 0.3, doubles: 0 }),
    ];

    expect(
      buildPeakRating(logs, { singles: 3.25, doubles: 3.077 }),
    ).toEqual({ singles: 3.3, doubles: 3.214 });
  });

  it("지금 평점이 가장 높으면 지금 평점이다", () => {
    const logs = [
      makeLog({ singles: 3.0, doubles: 3.1 }, { singles: 0, doubles: 0.1 }),
    ];
    expect(
      buildPeakRating(logs, { singles: 3.0, doubles: 3.135 }),
    ).toEqual({ singles: 3.0, doubles: 3.135 });
  });

  it("지금 평점이 없는 분류는 null이다", () => {
    const logs = [
      makeLog({ singles: 3.5, doubles: 3.2 }, { singles: 0.5, doubles: 0.2 }),
    ];
    expect(
      buildPeakRating(logs, { singles: null, doubles: 3.1 }),
    ).toEqual({ singles: null, doubles: 3.2 });
    expect(buildPeakRating(logs, null)).toEqual({
      singles: null,
      doubles: null,
    });
  });
});
