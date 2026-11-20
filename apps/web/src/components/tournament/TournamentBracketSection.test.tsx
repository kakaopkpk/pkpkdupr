import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MatchInfo } from "@/types/match";

// 아바타가 쓰는 lib/api가 Supabase 환경변수를 요구하므로 대신한다
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  resolveAssetUrl: (url?: string | null) => url ?? null,
}));
vi.mock("@/context/AppNavigationContext", () => ({
  useAppNavigation: () => ({ openMatchDetail: vi.fn() }),
}));

import { BracketMatchRow } from "./BracketMatchRow";
import { TournamentBracketSection } from "./TournamentBracketSection";

const ME = "alice";

const makePlayer = (id: string, doubles: number | null = null) => ({
  id,
  username: id,
  duprRating: doubles === null ? null : { singles: null, doubles },
  gender: "M" as const,
  status: "active" as const,
  isGuest: false,
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  updatedAt: new Date("2026-11-01T00:00:00.000Z"),
});

const makeMatch = (
  overrides: Partial<MatchInfo> & Pick<MatchInfo, "id">,
  playerIds: [string, string, string, string] = ["bob", "carol", "dave", "erin"],
): MatchInfo => ({
  type: "mixed-doubles",
  source: "admin_created",
  creatorPlayerId: "admin",
  status: "scheduled",
  teams: [
    {
      id: `${overrides.id}-a`,
      name: "Team A",
      players: [makePlayer(playerIds[0], 4), makePlayer(playerIds[1])],
    },
    {
      id: `${overrides.id}-b`,
      name: "Team B",
      players: [makePlayer(playerIds[2], 3.5), makePlayer(playerIds[3], 3.5)],
    },
  ],
  scores: [],
  resultSubmittedByPlayerId: null,
  resultSubmittedAt: null,
  location: "야탑초등학교",
  // 19:08 KST
  matchStartsAt: "2026-11-19T10:08:00.000Z",
  createdAt: "2026-11-18T00:00:00.000Z",
  updatedAt: "2026-11-18T00:00:00.000Z",
  completedAt: null,
  ratingExcluded: false,
  round: 1,
  ...overrides,
});

describe("BracketMatchRow", () => {
  it("예정 경기는 팀 평균(평점 없는 선수 3.0)과 vs를 보이고 시각·진행 중 표시는 없다", () => {
    const html = renderToStaticMarkup(
      <BracketMatchRow match={makeMatch({ id: "m1" })} />,
    );
    expect(html).toContain("평균 3.500");
    expect(html).toContain("vs");
    expect(html).not.toContain("19:08");
    expect(html).not.toContain("진행 중");
    expect(html).not.toContain("bg-pk-hl");
  });

  it("진행 중 경기는 오른쪽에 앰버 점과 진행 중을 보인다", () => {
    const html = renderToStaticMarkup(
      <BracketMatchRow match={makeMatch({ id: "m1", status: "created" })} />,
    );
    expect(html).toContain("bg-pk-hl");
    expect(html).toContain("진행 중");
    expect(html).not.toContain("19:08");
  });

  it("끝난 경기는 경기 줄(시각·내 경기·점수)이고 팀 평균은 없다", () => {
    const html = renderToStaticMarkup(
      <BracketMatchRow
        currentPlayerId={ME}
        match={makeMatch(
          {
            id: "m1",
            status: "completed",
            scores: [{ scoreA: 11, scoreB: 7 }] as MatchInfo["scores"],
          },
          [ME, "carol", "dave", "erin"],
        )}
      />,
    );
    expect(html).toContain("19:08");
    expect(html).toContain("내 경기");
    expect(html).toContain(">11<");
    expect(html).not.toContain("평균");
  });
});

describe("TournamentBracketSection", () => {
  it("라운드마다 카드 첫 줄에 라운드 이름을 보이고 라운드 없는 경기는 맨 끝이다", () => {
    const html = renderToStaticMarkup(
      <TournamentBracketSection
        matches={[
          makeMatch({ id: "free", round: null }),
          makeMatch({ id: "r2", round: 2 }),
          makeMatch({ id: "r1", round: 1 }),
          makeMatch({ id: "cancel", round: 3, status: "cancelled" }),
        ]}
      />,
    );
    expect(html).toContain("대진");
    const first = html.indexOf("1라운드");
    const second = html.indexOf("2라운드");
    const other = html.indexOf("그 밖의 경기");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(other).toBeGreaterThan(second);
    expect(html).not.toContain("3라운드");
    // 전환 라벨 개수는 보이는 대진 줄 수다(취소 경기 제외)
    expect(html).toContain("전체 3");
    expect(html).toContain("내 경기 0");
  });

  it("경기가 없으면 빈 상태 문구를 보이고 showFilter가 거짓이면 전환이 없다", () => {
    const html = renderToStaticMarkup(
      <TournamentBracketSection matches={[]} showFilter={false} />,
    );
    expect(html).toContain("아직 대진이 없어요");
    expect(html).not.toContain("전체");
  });
});
