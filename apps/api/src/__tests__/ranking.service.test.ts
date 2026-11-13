import type { PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import { describe, expect, it } from "vitest";
import {
  buildRankingResponse,
  buildSessionHistory,
  buildSessionReport,
  createRankingContext,
  findSessionDominations,
  getRatingAt,
  rankPlayersAt,
  selectBaselineSession,
  type RankingMatch,
  type RankingSession,
  type RankingSourcePlayer,
} from "../services/RankingService";

const at = (iso: string) => new Date(iso);
const now = at("2026-11-12T12:00:00.000Z");

const makePlayer = (
  id: string,
  username: string,
  doubles: number | null,
  overrides: Partial<RankingSourcePlayer> = {},
): RankingSourcePlayer => ({
  isGuest: false,
  id,
  username,
  status: "active",
  duprRating: { singles: null, doubles },
  ...overrides,
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

const makeMatch = (
  id: string,
  completedAt: Date,
  teams: [string[], string[]],
  overrides: Partial<RankingMatch> = {},
): RankingMatch => ({
  id,
  type: "unrestricted-doubles",
  sessionId: null,
  matchStartsAt: completedAt,
  completedAt,
  teamPlayerIds: teams,
  scores: [{ scoreA: 11, scoreB: 5 }],
  ...overrides,
});

const makeSession = (
  id: string,
  date: Date,
  overrides: Partial<RankingSession> = {},
): RankingSession => ({
  id,
  name: "정기 세션",
  kind: "regular",
  date,
  startTime: "18:00",
  endTime: "22:00",
  location: "야탑초등학교",
  participantIds: [],
  ...overrides,
});

describe("getRatingAt", () => {
  const first = makeLog(
    "Palice01",
    "Mmatch01",
    at("2026-11-01T10:00:00Z"),
    3.5,
    3.6,
  );
  const second = makeLog(
    "Palice01",
    "Mmatch02",
    at("2026-11-05T10:00:00Z"),
    3.6,
    3.55,
  );
  const logs = [second, first];

  it("로그 앞 시점은 첫 로그의 previous 값이다", () => {
    expect(
      getRatingAt({
        logs,
        currentRating: 3.55,
        category: "doubles",
        at: at("2026-10-01T00:00:00Z"),
      }),
    ).toBe(3.5);
  });

  it("로그 사이 시점은 그 전 마지막 로그의 next 값이다", () => {
    expect(
      getRatingAt({
        logs,
        currentRating: 3.55,
        category: "doubles",
        at: at("2026-11-03T00:00:00Z"),
      }),
    ).toBe(3.6);
  });

  it("같은 시각 로그는 inclusive일 때만 반영한다", () => {
    const point = at("2026-11-05T10:00:00Z");
    expect(
      getRatingAt({
        logs,
        currentRating: 3.55,
        category: "doubles",
        at: point,
      }),
    ).toBe(3.6);
    expect(
      getRatingAt({
        logs,
        currentRating: 3.55,
        category: "doubles",
        at: point,
        inclusive: true,
      }),
    ).toBe(3.55);
  });

  it("로그가 없으면 현재 평점이다", () => {
    expect(
      getRatingAt({
        logs: [],
        currentRating: 3.2,
        category: "doubles",
        at: now,
      }),
    ).toBe(3.2);
  });

  it("현재 NR인 분류는 로그가 있어도 null이다", () => {
    expect(
      getRatingAt({ logs, currentRating: null, category: "doubles", at: now }),
    ).toBeNull();
  });

  it("그 분류 첫 경기 전이고 직전 값이 기본 평점이면 NR(null)이다", () => {
    const newcomer = makeLog(
      "Pnewbie1",
      "Mmatch03",
      at("2026-11-05T10:00:00Z"),
      3,
      3.08,
    );
    expect(
      getRatingAt({
        logs: [newcomer],
        currentRating: 3.08,
        category: "doubles",
        at: at("2026-11-04T00:00:00Z"),
      }),
    ).toBeNull();
    expect(
      getRatingAt({
        logs: [newcomer],
        currentRating: 3.08,
        category: "doubles",
        at: now,
      }),
    ).toBe(3.08);
  });
});

describe("rankPlayersAt", () => {
  it("평점 내림차순 → 경기 수 내림차순 → 아이디 오름차순으로 1부터 연속 번호를 붙인다", () => {
    const players = [
      makePlayer("Pzzz0001", "carol", 3.5),
      makePlayer("Pzzz0002", "bob", 3.5),
      makePlayer("Pzzz0003", "alice", 3.5),
      makePlayer("Pzzz0004", "dave", 3.9),
      makePlayer("Pzzz0005", "nr", null),
      makePlayer("Pzzz0006", "gone", 4.5, { status: "inactive" }),
    ];
    const matches = [
      makeMatch("Mmatch01", at("2026-11-01T10:00:00Z"), [
        ["Pzzz0001"],
        ["Pzzz0004"],
      ]),
      // 단식 경기는 복식 경기 수에 들어가지 않는다
      makeMatch(
        "Mmatch02",
        at("2026-11-01T11:00:00Z"),
        [["Pzzz0002"], ["Pzzz0003"]],
        {
          type: "unrestricted-singles",
        },
      ),
    ];
    const context = createRankingContext(players, [], matches);

    const ranked = rankPlayersAt(context, "doubles", null);

    expect(
      ranked.map((entry) => [
        entry.rank,
        entry.player.username,
        entry.matchCount,
      ]),
    ).toEqual([
      [1, "dave", 1],
      [2, "carol", 1],
      [3, "alice", 0],
      [4, "bob", 0],
    ]);
  });
});

describe("selectBaselineSession", () => {
  it("완료 경기가 없는 세션과 미래 세션을 빼고 시작 직전 시점이 가장 늦은 세션을 고른다", () => {
    const older = makeSession("Solder01", at("2026-11-05T09:00:00Z"));
    const latest = makeSession("Slatest1", at("2026-11-09T09:00:00Z"));
    const empty = makeSession("Sempty01", at("2026-11-10T09:00:00Z"));
    const future = makeSession("Sfuture1", at("2026-11-20T09:00:00Z"));
    const matches = [
      makeMatch("Mmatch01", at("2026-11-05T10:00:00Z"), [["Pa"], ["Pb"]], {
        sessionId: older.id,
      }),
      makeMatch("Mmatch02", at("2026-11-09T10:00:00Z"), [["Pa"], ["Pb"]], {
        sessionId: latest.id,
      }),
      makeMatch("Mmatch03", at("2026-11-21T10:00:00Z"), [["Pa"], ["Pb"]], {
        sessionId: future.id,
      }),
    ];

    const baseline = selectBaselineSession(
      [older, latest, empty, future],
      matches,
      now,
    );

    expect(baseline?.session.id).toBe(latest.id);
    expect(baseline?.startAt).toEqual(latest.date);
  });

  it("세션 date보다 먼저 완료된 경기가 있으면 그 시각이 시작 직전 시점이다", () => {
    const session = makeSession("Ssessio1", at("2026-11-09T09:00:00Z"));
    const early = at("2026-11-09T08:30:00Z");
    const baseline = selectBaselineSession(
      [session],
      [
        makeMatch("Mmatch01", early, [["Pa"], ["Pb"]], {
          sessionId: session.id,
        }),
      ],
      now,
    );
    expect(baseline?.startAt).toEqual(early);
  });
});

describe("buildRankingResponse", () => {
  const sessionDate = at("2026-11-09T09:00:00Z");
  const completedAt = at("2026-11-09T10:00:00Z");
  const session = makeSession("Ssessio1", sessionDate);
  const players = [
    makePlayer("Palice01", "alice", 3.6, {
      statusMessage: "오늘도 화이팅",
      statusMessageBackgroundColor: "blue",
    }),
    makePlayer("Pbob0001", "bob", 3.5),
    makePlayer("Pcarol01", "carol", 3.5),
    makePlayer("Pnewbie1", "newbie", 3.08),
    makePlayer("Pnr00001", "nr", null, { statusMessage: "복귀했어요" }),
  ];
  const logs = [
    makeLog("Palice01", "Mmatch01", completedAt, 3.5, 3.6),
    makeLog("Pbob0001", "Mmatch01", completedAt, 3.4, 3.5),
    makeLog("Pcarol01", "Mmatch01", completedAt, 3.6, 3.5),
    makeLog("Pnewbie1", "Mmatch01", completedAt, 3, 3.08),
  ];
  const matches = [
    makeMatch(
      "Mmatch01",
      completedAt,
      [
        ["Palice01", "Pbob0001"],
        ["Pcarol01", "Pnewbie1"],
      ],
      { sessionId: session.id },
    ),
  ];

  it("가장 최근 세션 시작 직전 순위 대비 변동을 계산하고 그때 순위가 없던 사람은 null이다", () => {
    const context = createRankingContext(players, logs, matches);
    const response = buildRankingResponse({
      context,
      category: "doubles",
      sessions: [session],
      now,
    });

    expect(response.baselineSessionId).toBe(session.id);
    expect(
      response.entries.map((entry) => [
        entry.player.username,
        entry.rank,
        entry.rankChange,
      ]),
    ).toEqual([
      ["alice", 1, 1],
      ["bob", 2, 1],
      ["carol", 3, -2],
      ["newbie", 4, null],
    ]);
    expect(response.entries[0]).not.toHaveProperty("trend");
    // 상태메시지는 값이 있을 때만 싣는다
    expect(response.entries[0]?.player).toEqual({
      id: "Palice01",
      username: "alice",
      avatarUrl: undefined,
      statusMessage: "오늘도 화이팅",
      statusMessageBackgroundColor: "blue",
    });
    expect(response.entries[1]?.player).not.toHaveProperty("statusMessage");
    expect(response.entries[1]?.player).not.toHaveProperty(
      "statusMessageBackgroundColor",
    );
    expect(response.unrated).toEqual([
      {
        player: {
          id: "Pnr00001",
          username: "nr",
          avatarUrl: undefined,
          statusMessage: "복귀했어요",
        },
        matchCount: 0,
      },
    ]);
  });

  it("기준 세션이 없으면 baselineSessionId와 rankChange가 모두 null이다", () => {
    const context = createRankingContext(
      players,
      logs,
      matches.map((match) => ({ ...match, sessionId: null })),
    );
    const response = buildRankingResponse({
      context,
      category: "doubles",
      sessions: [session],
      now,
    });

    expect(response.baselineSessionId).toBeNull();
    expect(response.entries.every((entry) => entry.rankChange === null)).toBe(
      true,
    );
  });
});

describe("buildSessionReport", () => {
  const session = makeSession("Ssessio1", at("2026-11-09T09:00:00Z"), {
    participantIds: [
      "Palice01",
      "Pbob0001",
      "Pcarol01",
      "Pdave001",
      "Pgone001",
    ],
  });
  const players = [
    makePlayer("Palice01", "alice", 3.62),
    makePlayer("Pbob0001", "bob", 3.52),
    makePlayer("Pcarol01", "carol", 3.48),
    makePlayer("Pdave001", "dave", 3.38),
    makePlayer("Pgone001", "gone", 3, { status: "inactive" }),
  ];
  const first = at("2026-11-09T10:00:00Z");
  const second = at("2026-11-09T10:30:00Z");
  const matches = [
    makeMatch(
      "Mmatch01",
      first,
      [
        ["Palice01", "Pbob0001"],
        ["Pcarol01", "Pdave001"],
      ],
      {
        sessionId: session.id,
      },
    ),
    makeMatch(
      "Mmatch02",
      second,
      [
        ["Palice01", "Pcarol01"],
        ["Pbob0001", "Pdave001"],
      ],
      {
        sessionId: session.id,
        scores: [{ scoreA: 9, scoreB: 11 }],
      },
    ),
  ];
  const logs = [
    makeLog("Palice01", "Mmatch01", first, 3.5, 3.6),
    makeLog("Pbob0001", "Mmatch01", first, 3.45, 3.5),
    makeLog("Pcarol01", "Mmatch01", first, 3.55, 3.5),
    makeLog("Pdave001", "Mmatch01", first, 3.4, 3.35),
    makeLog("Palice01", "Mmatch02", second, 3.6, 3.62),
    makeLog("Pbob0001", "Mmatch02", second, 3.5, 3.52),
    makeLog("Pcarol01", "Mmatch02", second, 3.5, 3.48),
    makeLog("Pdave001", "Mmatch02", second, 3.35, 3.38),
  ];

  it("선수별 경기·승패와 복식 평점·순위 전후를 계산하고 가장 많이 오른 사람을 topRiser로 고른다", () => {
    const report = buildSessionReport({
      context: createRankingContext(players, logs, matches),
      session,
      dominations: new Map(),
    });

    expect(report?.session).toMatchObject({
      id: session.id,
      dateKey: "2026-11-09",
      participantCount: 4,
      matchCount: 2,
    });
    expect(report?.topRiser?.player.username).toBe("alice");
    expect(
      report?.players.map((entry) => [
        entry.player.username,
        entry.matchCount,
        entry.wins,
        entry.losses,
        entry.ratingBefore,
        entry.ratingAfter,
        entry.ratingDelta,
        entry.rankBefore,
        entry.rankAfter,
      ]),
    ).toEqual([
      ["alice", 2, 1, 1, 3.5, 3.62, 0.12, 2, 1],
      ["bob", 2, 2, 0, 3.45, 3.52, 0.07, 3, 2],
      ["dave", 2, 1, 1, 3.4, 3.38, -0.02, 4, 4],
      ["carol", 2, 0, 2, 3.55, 3.48, -0.07, 1, 3],
    ]);
  });

  it("평점이 오른 사람이 없으면 topRiser는 null이다", () => {
    const flatLogs = logs.map((log) => ({
      ...log,
      previousRating: { ...log.previousRating, doubles: 3.5 },
      nextRating: { ...log.nextRating, doubles: 3.5 },
      delta: { ...log.delta, doubles: 0 },
    }));
    const report = buildSessionReport({
      context: createRankingContext(players, flatLogs, matches),
      session,
      dominations: new Map(),
    });
    expect(report?.topRiser).toBeNull();
  });

  it("세션 전 NR이던 회원은 첫 경기 완료 로그의 시작값(3.0)을 세션 전 평점으로 보고 topRiser가 되며 rankBefore는 null이다", () => {
    const nrSession = makeSession("Ssessio2", at("2026-11-09T09:00:00Z"));
    const nrPlayers = [
      makePlayer("Palice01", "alice", 3.55),
      makePlayer("Pbob0001", "bob", 3.45),
      makePlayer("Perin001", "erin", 3.12),
      makePlayer("Pnr00001", "nr", null),
      // 이 세션에서는 단식만 하고 첫 복식은 세션 이후라 세션 리포트에서는 복식 NR이다
      makePlayer("Psolo001", "solo", null, {
        duprRating: { singles: 3.1, doubles: 3.06 },
      }),
    ];
    const nrMatches = [
      makeMatch(
        "Mmatch01",
        first,
        [
          ["Perin001", "Palice01"],
          ["Pbob0001", "Pnr00001"],
        ],
        { sessionId: nrSession.id },
      ),
      makeMatch("Mmatch02", second, [["Psolo001"], ["Pbob0001"]], {
        type: "unrestricted-singles",
        sessionId: nrSession.id,
      }),
      makeMatch("Mlater01", at("2026-11-10T10:00:00Z"), [
        ["Psolo001", "Pnr00001"],
        ["Pother01", "Pother02"],
      ]),
    ];
    const nrLogs = [
      makeLog("Psolo001", "Mlater01", at("2026-11-10T10:00:00Z"), 3, 3.06),
      makeLog("Perin001", "Mmatch01", first, 3, 3.12),
      makeLog("Palice01", "Mmatch01", first, 3.5, 3.55),
      makeLog("Pbob0001", "Mmatch01", first, 3.5, 3.45),
    ];

    const report = buildSessionReport({
      context: createRankingContext(nrPlayers, nrLogs, nrMatches),
      session: nrSession,
      dominations: new Map(),
    });

    expect(report?.topRiser?.player.username).toBe("erin");
    expect(
      report?.players.map((entry) => [
        entry.player.username,
        entry.ratingBefore,
        entry.ratingAfter,
        entry.ratingDelta,
        entry.rankBefore,
        entry.rankAfter,
      ]),
    ).toEqual([
      ["erin", 3, 3.12, 0.12, null, 3],
      ["alice", 3.5, 3.55, 0.05, 1, 1],
      ["nr", null, null, 0, null, null],
      ["solo", null, null, 0, null, null],
      ["bob", 3.5, 3.45, -0.05, 2, 2],
    ]);
  });

  it("완료 경기가 없는 세션은 null이다", () => {
    expect(
      buildSessionReport({
        context: createRankingContext(players, logs, []),
        session,
        dominations: new Map(),
      }),
    ).toBeNull();
  });

  // 정기 세션(2026-11-09)은 그날 22:00 KST(13:00Z)에 끝난다.
  const sessionEndsAt = at("2026-11-09T13:00:00Z");

  const reportAt = (reportNow: Date) => {
    const context = createRankingContext(players, logs, matches);
    return buildSessionReport({
      context,
      session,
      dominations: findSessionDominations(context, [session], reportNow),
    });
  };

  it("끝난 세션의 topRiser는 세션 지배자 업적을 그 세션 마지막 경기로 받는다", () => {
    const report = reportAt(sessionEndsAt);
    expect(
      report?.achievements.filter((item) =>
        item.achievementId.startsWith("dominator-"),
      ),
    ).toEqual([
      {
        playerId: "Palice01",
        achievementId: "dominator-1",
        earnedMatchId: "Mmatch02",
        earnedAt: second,
      },
    ]);
  });

  it("끝나지 않은 세션의 topRiser는 세션 지배자 업적을 받지 않는다", () => {
    const report = reportAt(new Date(sessionEndsAt.getTime() - 1));
    expect(report?.topRiser?.player.username).toBe("alice");
    expect(
      report?.achievements.some((item) =>
        item.achievementId.startsWith("dominator-"),
      ),
    ).toBe(false);
  });

  it("자정을 넘기는 회원 세션은 다음 날 종료 시각이 지나야 지배자를 정한다", () => {
    // 11월 9일 23:30~다음 날 01:30 세션은 11월 10일 01:30 KST(16:30Z)에 끝난다
    const overnight = {
      ...session,
      kind: "custom" as const,
      date: at("2026-11-08T15:00:00Z"),
      startTime: "23:30",
      endTime: "01:30",
    };
    const context = createRankingContext(players, logs, matches);
    const dominationsAt = (now: Date) =>
      findSessionDominations(context, [overnight], now);

    expect(dominationsAt(at("2026-11-09T15:00:00Z")).size).toBe(0);
    expect([...dominationsAt(at("2026-11-09T16:30:00Z")).entries()]).toEqual([
      ["Palice01", new Set([overnight.id])],
    ]);
  });

  it("findSessionDominations는 끝난 세션마다 지배자를 모으고 오른 사람이 없는 세션은 뺀다", () => {
    const flatSession = makeSession("Sflat001", at("2026-11-05T09:00:00Z"));
    const flatMatch = makeMatch(
      "Mflat001",
      at("2026-11-05T10:00:00Z"),
      [["Palice01"], ["Pbob0001"]],
      { type: "unrestricted-singles", sessionId: flatSession.id },
    );
    const dominations = findSessionDominations(
      createRankingContext(players, logs, [...matches, flatMatch]),
      [session, flatSession],
      sessionEndsAt,
    );
    expect([...dominations.entries()]).toEqual([
      ["Palice01", new Set([session.id])],
    ]);
  });
});

describe("buildSessionHistory", () => {
  const sessions = [
    makeSession("Sold0001", at("2026-11-02T09:00:00Z")),
    makeSession("Snew0001", at("2026-11-09T09:00:00Z"), {
      participantIds: ["Palice01", "Pgone001"],
    }),
    makeSession("Sempty01", at("2026-11-10T09:00:00Z")),
  ];
  const players = [
    makePlayer("Palice01", "alice", 3.5),
    makePlayer("Pbob0001", "bob", 3.5),
    makePlayer("Pgone001", "gone", 3, { status: "inactive" }),
  ];
  const matches = [
    makeMatch(
      "Mmatch01",
      at("2026-11-02T10:00:00Z"),
      [["Pbob0001"], ["Pgone001"]],
      {
        type: "unrestricted-singles",
        sessionId: "Sold0001",
      },
    ),
    makeMatch(
      "Mmatch02",
      at("2026-11-09T10:00:00Z"),
      [["Palice01"], ["Pbob0001"]],
      {
        type: "unrestricted-singles",
        sessionId: "Snew0001",
      },
    ),
  ];
  const context = createRankingContext(players, [], matches);

  it("완료 경기가 있는 세션만 최신순으로 돌려주고 limit로 자른다", () => {
    expect(
      buildSessionHistory({ context, sessions }).map((item) => [
        item.id,
        item.participantCount,
        item.matchCount,
      ]),
    ).toEqual([
      ["Snew0001", 1, 1],
      ["Sold0001", 0, 1],
    ]);
    expect(
      buildSessionHistory({ context, sessions, limit: 1 }).map(
        (item) => item.id,
      ),
    ).toEqual(["Snew0001"]);
  });

  it("playerId를 주면 그 선수가 완료 경기를 뛴 세션만 돌려준다", () => {
    expect(
      buildSessionHistory({ context, sessions, playerId: "Palice01" }).map(
        (item) => item.id,
      ),
    ).toEqual(["Snew0001"]);
  });
});
