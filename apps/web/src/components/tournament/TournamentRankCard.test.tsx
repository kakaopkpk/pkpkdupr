import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import type { TournamentPlacement } from "@pkpkdupr/shared/tournament";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

// 아바타가 쓰는 lib/api가 Supabase 환경변수를 요구하므로 대신한다
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  resolveAssetUrl: (url?: string | null) => url ?? null,
}));

import { TournamentRankCard, formatPlacementUnitName } from "./TournamentRankCard";

const member = (id: string) => ({ id, username: id });

const makeSession = (
  placements?: TournamentPlacement[],
): MatchSessionDetailInfo => ({
  id: "Stour001",
  name: "가을 대회",
  kind: "tournament",
  date: "2026-11-21T01:00:00.000Z",
  dateKey: "2026-11-21",
  location: "야탑초등학교",
  startTime: "10:00",
  endTime: "18:00",
  isToday: false,
  participants: [member("alice"), member("bob"), member("carol")] as MatchSessionDetailInfo["participants"],
  matchCount: 6,
  placements,
});

const makeMine = (
  overrides: Partial<SessionPlayerReport> = {},
): SessionPlayerReport =>
  ({
    player: { id: "alice", username: "alice" },
    matchCount: 4,
    wins: 3,
    losses: 1,
    ratingBefore: 3.5,
    ratingAfter: 3.584,
    ratingDelta: 0.084,
    rankBefore: null,
    rankAfter: null,
    ...overrides,
  }) as SessionPlayerReport;

const render = (
  session: MatchSessionDetailInfo,
  mine: SessionPlayerReport | null,
) => renderToStaticMarkup(<TournamentRankCard session={session} mine={mine} />);

describe("formatPlacementUnitName", () => {
  it("1명은 아이디, 2명은 'a · b', 3명 이상은 '대표 외 N명'", () => {
    expect(formatPlacementUnitName([member("a")])).toBe("a");
    expect(formatPlacementUnitName([member("a"), member("b")])).toBe("a · b");
    expect(
      formatPlacementUnitName([member("a"), member("b"), member("c"), member("d")]),
    ).toBe("a 외 3명");
  });
});

describe("TournamentRankCard", () => {
  it("종료 표시와 순위 오름차순 줄, 승패는 record가 있을 때만", () => {
    const html = render(
      makeSession([
        { place: 2, players: [member("bob")], record: null },
        { place: 1, players: [member("alice"), member("carol")], record: { wins: 3, losses: 1 } },
      ]),
      null,
    );
    expect(html).toContain("종료");
    expect(html).toContain("3명 참여");
    expect(html.indexOf("alice · carol")).toBeLessThan(html.indexOf(">bob<"));
    expect(html.match(/승 /g)).toHaveLength(1);
    expect(html).not.toContain("내 기록");
  });

  it("순위가 없으면 순위 줄 없이 내 기록 줄만, 평점 상승은 pk-up-on-deep", () => {
    const html = render(makeSession([]), makeMine());
    expect(html).not.toContain("최종 순위");
    expect(html).toContain("내 기록");
    expect(html).toContain("3승 1패");
    expect(html).toContain("+0.084");
    expect(html).toContain("text-pk-up-on-deep");
  });

  it("하락은 pk-down-on-deep, 0은 흐린 흰색, 세션 후 평점이 없으면 승패만", () => {
    expect(render(makeSession(), makeMine({ ratingDelta: -0.05 }))).toContain(
      "text-pk-down-on-deep",
    );
    const flat = render(makeSession(), makeMine({ ratingDelta: 0 }));
    expect(flat).toContain("0.000");
    expect(flat).not.toContain("on-deep");
    const unrated = render(
      makeSession(),
      makeMine({ ratingAfter: null, ratingDelta: 0 }),
    );
    expect(unrated).toContain("3승 1패");
    expect(unrated).not.toContain("0.000");
  });
});
