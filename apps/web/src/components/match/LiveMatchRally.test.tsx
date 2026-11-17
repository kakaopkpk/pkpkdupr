import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getRallyTrack } from "@/components/match/LiveMatchRally";
import { LiveMatchDetail } from "@/components/match/MatchDetailViews";
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

  it("시작 전 예정 경기에는 연출 없이 vs 글자만 보인다", () => {
    const markup = render(makeLiveMatch(new Date(Date.now() + 60 * 60_000).toISOString()));
    expect(markup).not.toContain("pk-rally");
    expect(markup).toMatch(/text-pk-muted">vs<\/span>/);
  });
});
