import type { NewsFeedSessionItem } from "@pkpkdupr/shared/newsFeed";
import type { PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import { describe, expect, it, vi } from "vitest";
import {
  NEWS_FEED_WINDOW_MS,
  buildNewsFeedPage,
  parseNewsFeedCursor,
  type NewsFeedSourcePlayer,
} from "../services/NewsFeedService";
import {
  buildSessionReport,
  createRankingContext,
  findSessionDominations,
  type RankingMatch,
  type RankingSession,
} from "../services/RankingService";

// 이 파일의 고정 데이터는 업적 기준 시각(2026-11-17 KST) 전 경기라, 업적은 기준 시각 없이 센다.
vi.mock("@pkpkdupr/shared/achievementCountStart", () => ({
  ACHIEVEMENT_COUNT_START: new Date(0),
  SECOND_ACHIEVEMENT_SET_COUNT_START: new Date("2100-01-01T00:00:00.000Z"),
}));

const at = (iso: string) => new Date(iso);
const now = at("2026-11-19T12:00:00.000Z");

const makePlayer = (
  id: string,
  username: string,
  doubles: number | null,
  overrides: Partial<NewsFeedSourcePlayer> = {},
): NewsFeedSourcePlayer => ({
  isGuest: false,
  id,
  username,
  status: "active",
  duprRating: { singles: null, doubles },
  createdAt: at("2020-01-01T00:00:00.000Z"),
  promotedAt: null,
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

const buildPage = ({
  players,
  logs = [],
  matches,
  sessions,
  requesterId,
  cursor = null,
}: {
  players: NewsFeedSourcePlayer[];
  logs?: PlayerRatingChangeLog[];
  matches: RankingMatch[];
  sessions: RankingSession[];
  requesterId: string;
  cursor?: number | null;
}) => {
  const context = createRankingContext(players, logs, matches);
  return buildNewsFeedPage({
    context,
    sessions,
    players,
    dominations: findSessionDominations(context, sessions, now),
    requesterId,
    cursor,
  });
};

const ids = (items: ReturnType<typeof buildPage>["items"]) =>
  items.map((item) =>
    item.kind === "session" ? item.session.id : item.player.id,
  );

describe("parseNewsFeedCursor", () => {
  it("ms 정수 문자열만 받는다", () => {
    expect(parseNewsFeedCursor("1762678800000")).toBe(1762678800000);
    expect(parseNewsFeedCursor("")).toBeNull();
    expect(parseNewsFeedCursor("-1")).toBeNull();
    expect(parseNewsFeedCursor("12.5")).toBeNull();
    expect(parseNewsFeedCursor("abc")).toBeNull();
    expect(parseNewsFeedCursor("1".repeat(16))).toBeNull();
  });
});

describe("buildNewsFeedPage 페이지 나누기", () => {
  const alice = makePlayer("Palice01", "alice", 3.5, {
    createdAt: at("2026-01-01T00:00:00.000Z"),
  });
  const bob = makePlayer("Pbob0001", "bob", 3.5, {
    createdAt: at("2025-01-01T00:00:00.000Z"),
  });
  // 게스트로 만들어졌다가 승급한 회원은 승급 시각에 나온다
  const dan = makePlayer("Pdan0001", "dan", 3.5, {
    createdAt: at("2026-05-01T00:00:00.000Z"),
    promotedAt: at("2026-11-01T00:00:00.000Z"),
  });
  const erin = makePlayer("Perin001", "erin", 3.5, {
    createdAt: at("2026-10-10T00:00:00.000Z"),
  });
  const inactive = makePlayer("Pinact01", "inactive", 3.5, {
    status: "inactive",
    createdAt: at("2026-11-05T00:00:00.000Z"),
  });
  const guest = makePlayer("Pguest01", "guest", null, {
    isGuest: true,
    createdAt: at("2026-11-05T00:00:00.000Z"),
  });
  const players = [alice, bob, dan, erin, inactive, guest];

  const s1 = makeSession("Ssess001", at("2026-11-09T09:00:00.000Z"));
  // s1에서 정확히 28일 전(창 경계, 포함)
  const s2 = makeSession(
    "Ssess002",
    new Date(s1.date.getTime() - NEWS_FEED_WINDOW_MS),
  );
  const s3 = makeSession("Ssess003", at("2026-10-01T09:00:00.000Z"));
  const s4 = makeSession("Ssess004", at("2026-08-01T09:00:00.000Z"));
  const empty = makeSession("Sempty01", at("2026-11-12T09:00:00.000Z"));
  const sessions = [s4, empty, s1, s3, s2];
  const matches = [s1, s2, s3, s4].map((session, index) =>
    makeMatch(
      `Mmatch0${index}`,
      new Date(session.date.getTime() + 60 * 60 * 1000),
      [[alice.id], [bob.id]],
      { sessionId: session.id },
    ),
  );

  it("첫 페이지는 가장 최근 세션부터 28일(경계 포함)이고 새 회원을 시각 순으로 끼운다", () => {
    const page = buildPage({
      players,
      matches,
      sessions,
      requesterId: alice.id,
    });
    expect(ids(page.items)).toEqual([s1.id, dan.id, s2.id]);
    expect(page.nextCursor).toBe(String(s2.date.getTime()));
    const danItem = page.items[1];
    expect(danItem).toMatchObject({
      kind: "newMember",
      joinedAt: dan.promotedAt,
    });
  });

  it("다음 페이지는 cursor보다 이른 세션의 가장 최근부터 28일이다", () => {
    const page = buildPage({
      players,
      matches,
      sessions,
      requesterId: alice.id,
      cursor: s2.date.getTime(),
    });
    expect(ids(page.items)).toEqual([erin.id, s3.id]);
    expect(page.nextCursor).toBe(String(s3.date.getTime()));
  });

  it("마지막 페이지는 cursor 미만 새 회원 전부를 넣고 nextCursor가 null이다", () => {
    const page = buildPage({
      players,
      matches,
      sessions,
      requesterId: alice.id,
      cursor: s3.date.getTime(),
    });
    expect(ids(page.items)).toEqual([s4.id, alice.id, bob.id]);
    expect(page.nextCursor).toBeNull();
  });

  it("남은 세션이 없으면 cursor 미만 새 회원만 나온다", () => {
    const page = buildPage({
      players,
      matches,
      sessions,
      requesterId: alice.id,
      cursor: s4.date.getTime(),
    });
    expect(ids(page.items)).toEqual([alice.id, bob.id]);
    expect(page.nextCursor).toBeNull();
  });

  it("피드 세션이 없으면 활성 정회원 전원이 나온다", () => {
    const page = buildPage({
      players,
      matches: [],
      sessions,
      requesterId: alice.id,
    });
    expect(ids(page.items)).toEqual([dan.id, erin.id, alice.id, bob.id]);
    expect(page.nextCursor).toBeNull();
  });

  it("세션과 새 회원 시각이 같으면 세션을 먼저 둔다", () => {
    const sameTime = makePlayer("Pfred001", "fred", 3.5, {
      createdAt: s1.date,
    });
    const page = buildPage({
      players: [alice, bob, sameTime],
      matches: [matches[0]],
      sessions: [s1],
      requesterId: alice.id,
    });
    expect(ids(page.items)).toEqual([s1.id, sameTime.id, alice.id, bob.id]);
  });
});

describe("buildNewsFeedPage 세션 항목", () => {
  const alice = makePlayer("Palice01", "alice", 3.7);
  const bob = makePlayer("Pbob0001", "bob", 3.45);
  const carol = makePlayer("Pcarol01", "carol", 3.4);
  // 세션 전 복식 NR이던 회원
  const nina = makePlayer("Pnina001", "nina", 3.8);
  const xavier = makePlayer("Pxavi001", "xavier", 3.1, {
    status: "inactive",
  });
  const zed = makePlayer("Pzed0001", "zed", null);
  const players = [alice, bob, carol, nina, xavier, zed];

  const session = makeSession("Ssess001", at("2026-11-09T09:00:00.000Z"));
  const m1At = at("2026-11-09T09:10:00.000Z");
  const m2At = at("2026-11-09T09:30:00.000Z");
  const m1 = makeMatch("Mmatch01", m1At, [[alice.id, nina.id], [bob.id, carol.id]], {
    sessionId: session.id,
  });
  const m2 = makeMatch("Mmatch02", m2At, [[alice.id, xavier.id], [bob.id, carol.id]], {
    sessionId: session.id,
  });
  // 세션 전 alice 3연승(평점 로그 없이 승패만)
  const prior = [1, 2, 3].map((day) =>
    makeMatch(
      `Mprior0${day}`,
      at(`2026-10-0${day}T09:00:00.000Z`),
      [[alice.id], [carol.id]],
    ),
  );
  // 세션 뒤 alice가 진 경기: 지금 연승은 끊겼지만 세션 시점 연승은 그대로다
  const later = makeMatch(
    "Mlater01",
    at("2026-11-10T09:00:00.000Z"),
    [[bob.id], [alice.id]],
  );
  const matches = [...prior, m1, m2, later];
  const logs = [
    makeLog(alice.id, m1.id, m1At, 3.4, 3.55),
    makeLog(nina.id, m1.id, m1At, 3.0, 3.8),
    makeLog(bob.id, m1.id, m1At, 3.6, 3.5),
    makeLog(carol.id, m1.id, m1At, 3.5, 3.45),
    makeLog(alice.id, m2.id, m2At, 3.55, 3.7),
    makeLog(xavier.id, m2.id, m2At, 3.0, 3.1),
    makeLog(bob.id, m2.id, m2At, 3.5, 3.45),
    makeLog(carol.id, m2.id, m2At, 3.45, 3.4),
  ];

  const sessionItem = (requesterId: string) => {
    const page = buildPage({
      players,
      logs,
      matches,
      sessions: [session],
      requesterId,
    });
    const item = page.items.find(
      (candidate): candidate is NewsFeedSessionItem =>
        candidate.kind === "session",
    );
    if (!item) throw new Error("세션 항목이 없다");
    return item;
  };

  const report = () => {
    const context = createRankingContext(players, logs, matches);
    const result = buildSessionReport({
      context,
      session,
      dominations: findSessionDominations(context, [session], now),
    });
    if (!result) throw new Error("세션 리포트가 없다");
    return result;
  };

  it("session·mine·topRiser는 세션 리포트와 같다", () => {
    const item = sessionItem(alice.id);
    const expected = report();
    expect(item.session).toEqual(expected.session);
    expect(item.topRiser).toEqual(expected.topRiser);
    expect(item.mine).toEqual(
      expected.players.find((player) => player.player.id === alice.id),
    );
  });

  it("세션 경기를 안 뛴 요청자의 mine은 null이다", () => {
    expect(sessionItem(zed.id).mine).toBeNull();
  });

  it("랭킹 줄은 TOP3에 새로 들거나 오른 활성 정회원만, 순위 오름차순이다", () => {
    const rankLines = sessionItem(alice.id).lines.filter(
      (line) => line.kind === "rank",
    );
    // 세션 전: bob 1, carol 2, alice 3, nina 없음 → 세션 후: nina 1, alice 2, bob 3
    expect(rankLines).toEqual([
      {
        kind: "rank",
        player: { id: nina.id, username: "nina", avatarUrl: undefined },
        rank: 1,
        rankChange: null,
      },
      {
        kind: "rank",
        player: { id: alice.id, username: "alice", avatarUrl: undefined },
        rank: 2,
        rankChange: 1,
      },
    ]);
  });

  it("연승 줄은 세션 마지막 경기까지 센 연승이 5 이상인 활성 정회원만이다", () => {
    const streakLines = sessionItem(alice.id).lines.filter(
      (line) => line.kind === "winStreak",
    );
    // nina·xavier는 2연승, xavier는 비활성
    expect(streakLines).toEqual([
      {
        kind: "winStreak",
        player: { id: alice.id, username: "alice", avatarUrl: undefined },
        winStreak: 5,
      },
    ]);
  });

  it("업적 줄은 세션 리포트 achievements 중 활성 정회원 것이고, 줄 순서는 랭킹 → 연승 → 업적이다", () => {
    const item = sessionItem(alice.id);
    const isTopRiserFirstDominator = (earned: {
      playerId: string;
      achievementId: string;
    }) => earned.playerId === nina.id && earned.achievementId === "dominator-1";
    const expected = report()
      .achievements.filter(
        (earned) =>
          earned.playerId !== xavier.id && !isTopRiserFirstDominator(earned),
      )
      .map((earned) => ({
        kind: "achievement",
        playerId: earned.playerId,
        achievementId: earned.achievementId,
        earnedMatchId: earned.earnedMatchId,
        earnedAt: earned.earnedAt,
      }));
    expect(report().achievements.some((earned) => earned.playerId === xavier.id))
      .toBe(true);
    const achievementLines = item.lines.flatMap((line) =>
      line.kind === "achievement"
        ? [
            {
              kind: line.kind,
              playerId: line.player.id,
              achievementId: line.achievementId,
              earnedMatchId: line.earnedMatchId,
              earnedAt: line.earnedAt,
            },
          ]
        : [],
    );
    expect(achievementLines.length).toBeGreaterThan(0);
    expect(achievementLines).toEqual(expected);

    const kinds = item.lines.map((line) => line.kind);
    const order = { rank: 0, winStreak: 1, achievement: 2 };
    expect(kinds).toEqual(
      [...kinds].sort((left, right) => order[left] - order[right]),
    );
  });

  it("지배자가 이 세션으로 받은 첫 세션 지배자 업적은 지배자 줄과 겹쳐 업적 줄에서 뺀다", () => {
    const item = sessionItem(alice.id);
    expect(item.topRiser?.player.id).toBe(nina.id);
    expect(
      report().achievements.some(
        (earned) =>
          earned.playerId === nina.id && earned.achievementId === "dominator-1",
      ),
    ).toBe(true);
    expect(
      item.lines.some(
        (line) =>
          line.kind === "achievement" && line.achievementId === "dominator-1",
      ),
    ).toBe(false);
  });
});
