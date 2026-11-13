import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MatchRow } from "@/components/ui/MatchRow";
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

const makeMatch = (ratingExcluded: boolean): MatchInfo => ({
  id: "match-1",
  type: "mixed-doubles",
  source: "player_created",
  creatorPlayerId: "alice",
  status: "completed",
  teams: [
    { id: "team-a", name: "Team A", players: [makePlayer("alice"), makePlayer("bob")] },
    { id: "team-b", name: "Team B", players: [makePlayer("carol"), makePlayer("dave")] },
  ],
  scores: [{ scoreA: 11, scoreB: 7 }],
  resultSubmittedByPlayerId: "alice",
  resultSubmittedAt: "2026-11-13T12:50:00.000Z",
  location: "야탑초등학교",
  // 21:40 KST
  matchStartsAt: "2026-11-13T12:40:00.000Z",
  createdAt: "2026-11-13T12:40:00.000Z",
  completedAt: "2026-11-13T12:50:00.000Z",
  updatedAt: "2026-11-13T12:50:00.000Z",
  ratingExcluded,
});

/** 메타 줄(첫 div)의 글자만 뽑는다 */
const getMetaText = (
  match: MatchInfo,
  currentPlayerId?: string,
  timeLabel?: "time" | "weekday-time" | "date-time",
) => {
  const markup = renderToStaticMarkup(
    <MatchRow
      match={match}
      currentPlayerId={currentPlayerId}
      timeLabel={timeLabel}
    />,
  );
  const meta = /<div class="whitespace-nowrap[^"]*">(.*?)<\/div>/.exec(markup)?.[1] ?? "";
  return meta.replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "");
};

describe("MatchRow 메타 줄", () => {
  it("게스트가 낀 경기는 끝에 ' · 평점 미반영'을 붙인다", () => {
    expect(getMetaText(makeMatch(true), "alice")).toBe(
      "21:40 · 내 경기 · 평점 미반영",
    );
    expect(getMetaText(makeMatch(true))).toBe("21:40 · 평점 미반영");
  });

  it("정상 경기는 붙이지 않는다", () => {
    expect(getMetaText(makeMatch(false), "alice")).toBe("21:40 · 내 경기");
  });
});

describe("MatchRow 시간 표기", () => {
  it("date-time은 날짜·요일·시각을 보인다", () => {
    expect(getMetaText(makeMatch(false), undefined, "date-time")).toBe(
      "11월 13일 금 21:40",
    );
    expect(getMetaText(makeMatch(true), undefined, "date-time")).toBe(
      "11월 13일 금 21:40 · 평점 미반영",
    );
  });
});
