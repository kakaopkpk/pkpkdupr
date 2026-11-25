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
  // 시작 21:40 KST, 점수 입력 21:50 KST
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
  const meta = /<div class="flex min-w-0 items-center gap-2[^"]*">(.*?)<\/div>/.exec(markup)?.[1];
  // 메타 줄 class가 바뀌어 못 찾으면 빈 글자 비교로 흐려지지 않게 바로 실패시킨다
  if (meta === undefined) throw new Error("MatchRow 메타 줄을 찾지 못했어요");
  return meta.replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "");
};

describe("MatchRow 메타 줄", () => {
  it("게스트가 낀 경기는 끝에 ' · 평점 미반영'을 붙인다", () => {
    expect(getMetaText(makeMatch(true), "alice")).toBe(
      "21:50 · 내 경기 · 평점 미반영",
    );
    expect(getMetaText(makeMatch(true))).toBe("21:50 · 평점 미반영");
  });

  it("정상 경기는 붙이지 않는다", () => {
    expect(getMetaText(makeMatch(false), "alice")).toBe("21:50 · 내 경기");
  });
});

describe("MatchRow 특수 매치", () => {
  it("특수 매치면 메타 줄 끝에 유형 이름만 붙이고 결과는 쓰지 않는다", () => {
    const match: MatchInfo = {
      ...makeMatch(false),
      specialMatch: {
        kind: "rival",
        defendingTeamIndex: 1,
        protagonistIds: ["alice", "carol"],
        rivalPairs: [{ attackerId: "alice", defenderId: "carol" }],
        outcome: "rival_overtaken",
      },
    };
    expect(getMetaText(match, "alice")).toBe("21:50 · 내 경기라이벌전");
  });

  it("일반 매치는 유형 이름이 없다", () => {
    expect(getMetaText({ ...makeMatch(false), specialMatch: null })).toBe("21:50");
  });
});

describe("MatchRow 시간 표기", () => {
  it("date-time은 날짜·요일·시각을 보인다", () => {
    expect(getMetaText(makeMatch(false), undefined, "date-time")).toBe(
      "11월 13일 금 21:50",
    );
    expect(getMetaText(makeMatch(true), undefined, "date-time")).toBe(
      "11월 13일 금 21:50 · 평점 미반영",
    );
  });

  it("완료 경기는 점수 입력 시각, 진행 중 경기는 시작 시각을 보인다", () => {
    expect(getMetaText(makeMatch(false))).toBe("21:50");
    expect(
      getMetaText({ ...makeMatch(false), status: "created", scores: [], completedAt: null }),
    ).toBe("21:40");
  });
});

/** 승패 띠 값과 팀 줄 이름 순서를 뽑는다 */
const getResultView = (match: MatchInfo, resultPlayerId?: string) => {
  const markup = renderToStaticMarkup(
    <MatchRow match={match} resultPlayerId={resultPlayerId} />,
  );
  const result = /data-match-result="(win|lose)"/.exec(markup)?.[1] ?? null;
  const teamLabels = [...markup.matchAll(/<span class="min-w-0 flex-1 truncate[^"]*">([^<]+)<\/span>/g)].map(
    ([, label]) => label,
  );
  return { result, teamLabels };
};

describe("MatchRow 기준 회원 승패", () => {
  it("기준 회원이 이긴 경기는 그 팀을 위에 두고 승 띠를 붙인다", () => {
    expect(getResultView(makeMatch(false), "alice")).toEqual({
      result: "win",
      teamLabels: ["alice · bob", "carol · dave"],
    });
  });

  it("기준 회원이 진 경기도 그 팀을 위에 두고 패 띠를 붙인다", () => {
    expect(getResultView(makeMatch(false), "carol")).toEqual({
      result: "lose",
      teamLabels: ["carol · dave", "alice · bob"],
    });
  });

  it("기준 회원이 없으면 지금처럼 이긴 팀이 위이고 띠가 없다", () => {
    const loserFirst: MatchInfo = { ...makeMatch(false), scores: [{ scoreA: 7, scoreB: 11 }] };
    expect(getResultView(loserFirst)).toEqual({
      result: null,
      teamLabels: ["carol · dave", "alice · bob"],
    });
    expect(getResultView(loserFirst, "erin").result).toBeNull();
  });

  it("점수가 없거나 승자가 없으면 띠가 없다", () => {
    expect(
      getResultView({ ...makeMatch(false), status: "created", scores: [], completedAt: null }, "carol"),
    ).toEqual({ result: null, teamLabels: ["alice · bob", "carol · dave"] });
    expect(
      getResultView({ ...makeMatch(false), scores: [{ scoreA: 11, scoreB: 11 }] }, "carol").result,
    ).toBeNull();
  });
});
