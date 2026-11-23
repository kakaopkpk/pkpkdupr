import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getRallyTrack } from "@/components/match/LiveMatchRally";
import { LiveMatchDetail } from "@/components/match/MatchDetailViews";
import {
  LiveMatchCard,
  MyLiveMatchCard,
  withWinStreakPlayers,
} from "@/components/home/LiveMatchCard";
import type { MatchInfo } from "@/types/match";

// 아바타가 쓰는 lib/api가 Supabase 환경변수를 요구하므로 대신한다
vi.mock("@/lib/api", () => ({
  resolveAssetUrl: (url?: string | null) => url ?? null,
}));

const makePlayer = (id: string) => ({
  id,
  username: id,
  duprRating: null,
  gender: "M" as const,
  status: "active" as const,
  isGuest: false,
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  updatedAt: new Date("2026-11-01T00:00:00.000Z"),
});

const makeLiveMatch = (matchStartsAt: string): MatchInfo => ({
  id: "match-1",
  type: "mixed-doubles",
  source: "player_created",
  creatorPlayerId: "alice",
  status: "created",
  teams: [
    { id: "team-a", name: "Team A", players: [makePlayer("alice"), makePlayer("bob")] },
    { id: "team-b", name: "Team B", players: [makePlayer("carol"), makePlayer("dave")] },
  ],
  scores: [],
  resultSubmittedByPlayerId: null,
  resultSubmittedAt: null,
  completedAt: null,
  ratingExcluded: false,
  location: "야탑초등학교",
  matchStartsAt,
  createdAt: matchStartsAt,
  updatedAt: matchStartsAt,
});

const makeAdminScheduledMatch = (matchStartsAt: string): MatchInfo => ({
  ...makeLiveMatch(matchStartsAt),
  source: "admin_created",
});

const render = (match: MatchInfo) =>
  renderToStaticMarkup(
    <LiveMatchDetail
      match={match}
      creatorUsername="alice"
      onOpenSession={() => {}}
      onOpenPlayer={() => {}}
    />,
  );

describe("getRallyTrack", () => {
  it("복식이면 두 아바타 쌍(58px)의 바깥 가장자리 사이를 오간다", () => {
    expect(getRallyTrack(2, 2)).toEqual({
      left: "calc(25% + 24px)",
      width: "calc(50% - 48px)",
    });
  });

  it("단식이면 아바타 한 개(32px) 기준으로 구간이 넓어진다", () => {
    expect(getRallyTrack(1, 1)).toEqual({
      left: "calc(25% + 11px)",
      width: "calc(50% - 22px)",
    });
  });
});

describe("LiveMatchDetail 랠리 연출", () => {
  it("진행 중 경기에는 네트와 공을 그리고 vs는 스크린 리더용으로만 남긴다", () => {
    const markup = render(makeLiveMatch(new Date(Date.now() - 10 * 60_000).toISOString()));
    expect(markup).toContain("pk-rally-x");
    expect(markup).toContain("pk-rally-lunge");
    expect(markup).toContain('<span class="sr-only">vs</span>');
  });

  it("시작 전 관리자 예정 경기에는 연출 없이 vs 글자만 보인다", () => {
    const markup = render(makeAdminScheduledMatch(new Date(Date.now() + 60 * 60_000).toISOString()));
    expect(markup).not.toContain("pk-rally");
    expect(markup).toMatch(/text-pk-muted">vs<\/span>/);
  });

  it("회원이 시작한 경기는 시작 시각이 지금보다 늦어도(단말 시계가 느림) 랠리를 그린다", () => {
    const markup = render(makeLiveMatch(new Date(Date.now() + 30_000).toISOString()));
    expect(markup).toContain("pk-rally-x");
    expect(markup).toContain("진행 중 · 방금 시작");
  });

  it("대진 예정 경기는 vs 글자만 보이고 시각·시작한 사람이 없다", () => {
    // 21:15 KST. 시작 시각이 지났어도 대진 예정 경기는 예정으로 본다
    const match: MatchInfo = {
      ...makeLiveMatch("2026-11-19T12:15:00.000Z"),
      status: "scheduled",
      source: "admin_created",
      round: 2,
    };
    const markup = render(match);
    expect(markup).not.toContain("pk-rally");
    expect(markup).toMatch(/text-pk-muted">vs<\/span>/);
    expect(markup).toContain("2라운드 · 예정");
    expect(markup).not.toContain("21:15");
    expect(markup).not.toContain("시작한 사람");
  });
});

describe("홈 진행 중 경기 카드 랠리", () => {
  const renderMine = (match: MatchInfo) =>
    renderToStaticMarkup(
      <MyLiveMatchCard
        match={match}
        now={new Date()}
        onOpenDetail={() => {}}
        onEnterScore={() => {}}
      />,
    );

  it("내 경기 카드에는 카드 바탕색(흰색) 테두리 공으로 랠리를 그린다", () => {
    const markup = renderMine(makeLiveMatch(new Date(Date.now() - 10 * 60_000).toISOString()));
    expect(markup).toContain("pk-rally-x");
    expect(markup).toContain("pk-rally-lunge");
    expect(markup).toContain("fill:#ffffff");
    expect(markup).toContain('<span class="sr-only">vs</span>');
  });

  it("시작 전 관리자 예정인 내 경기는 vs 글자만 보인다", () => {
    const markup = renderMine(makeAdminScheduledMatch(new Date(Date.now() + 60 * 60_000).toISOString()));
    expect(markup).not.toContain("pk-rally");
    expect(markup).toMatch(/text-pk-muted">vs<\/span>/);
  });

  it("홈 시각(now)이 갱신되기 전에 막 시작한 내 경기도 랠리를 그린다", () => {
    // 홈 keep-alive 탭의 분 단위 시계가 경기 시작 시각보다 늦게 남아 있는 경우
    const startedAt = new Date();
    const markup = renderToStaticMarkup(
      <MyLiveMatchCard
        match={makeLiveMatch(startedAt.toISOString())}
        now={new Date(startedAt.getTime() - 40_000)}
        onOpenDetail={() => {}}
        onEnterScore={() => {}}
      />,
    );
    expect(markup).toContain("pk-rally-x");
  });

  it("남의 경기 카드에는 랠리가 없다", () => {
    const markup = renderToStaticMarkup(
      <LiveMatchCard
        match={makeLiveMatch(new Date(Date.now() - 10 * 60_000).toISOString())}
        now={new Date()}
        onOpenDetail={() => {}}
      />,
    );
    expect(markup).not.toContain("pk-rally");
  });
});

describe("남의 진행 중 경기 카드 연승 링", () => {
  const renderOther = (props: {
    sessionWinStreaks?: Map<string, number>;
    winStreaks?: Map<string, number>;
  }) =>
    renderToStaticMarkup(
      <LiveMatchCard
        match={makeLiveMatch(new Date(Date.now() - 10 * 60_000).toISOString())}
        now={new Date()}
        onOpenDetail={() => {}}
        {...props}
      />,
    );
  const countRings = (markup: string) =>
    markup.split('class="pk-streak-ring').length - 1;

  it("특수 매치가 아니어도 지금 5연승 이상 회원 아바타에 태그 없는 연승 링을 두른다", () => {
    const markup = renderOther({ winStreaks: new Map([["bob", 6], ["dave", 5]]) });
    expect(countRings(markup)).toBe(2);
    expect(markup).not.toContain("연승 중");
  });

  it("다른 경기 회원의 연승은 링을 두르지 않는다", () => {
    const markup = renderOther({ winStreaks: new Map([["erin", 9]]) });
    expect(countRings(markup)).toBe(0);
  });

  it("세션 연승과 겹친 회원도 링은 하나다", () => {
    const markup = renderOther({
      sessionWinStreaks: new Map([["alice", 3]]),
      winStreaks: new Map([["alice", 7]]),
    });
    expect(countRings(markup)).toBe(1);
  });
});

describe("withWinStreakPlayers", () => {
  const match = makeLiveMatch(new Date().toISOString());

  it("세션 연승 값을 우선하고 이 경기 참가자의 연승만 더한다", () => {
    const merged = withWinStreakPlayers(
      match,
      new Map([["alice", 3]]),
      new Map([["alice", 7], ["carol", 5], ["erin", 9]]),
    );
    expect(merged).toEqual(new Map([["alice", 3], ["carol", 5]]));
  });

  it("연승 회원이 없으면 세션 연승을 그대로 돌려준다", () => {
    const session = new Map([["alice", 3]]);
    expect(withWinStreakPlayers(match, session, new Map())).toBe(session);
    expect(withWinStreakPlayers(match, undefined, undefined)).toBeUndefined();
  });
});
