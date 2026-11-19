import { describe, expect, it } from "vitest";
import {
  findMyNextBracketMatch,
  formatBracketRoundLabel,
  getBracketTeamAverageRating,
  groupBracketRounds,
} from "@/lib/tournament";
import type { MatchInfo } from "@/types/match";

const ME = "Pme00001";

type TestPlayer = MatchInfo["teams"][number]["players"][number];

const player = (
  id: string,
  duprRating: TestPlayer["duprRating"] = null,
): TestPlayer => ({ id, username: id, duprRating }) as TestPlayer;

const makeMatch = (
  overrides: Partial<MatchInfo> & Pick<MatchInfo, "id">,
  playerIds: [string[], string[]] = [
    ["Pa", "Pb"],
    ["Pc", "Pd"],
  ],
): MatchInfo =>
  ({
    type: "unrestricted-doubles",
    source: "admin_created",
    creatorPlayerId: "Padmin",
    status: "scheduled",
    teams: [
      { id: `${overrides.id}-A`, name: "Team A", players: playerIds[0].map((id) => player(id)) },
      { id: `${overrides.id}-B`, name: "Team B", players: playerIds[1].map((id) => player(id)) },
    ],
    resultSubmittedByPlayerId: null,
    resultSubmittedAt: null,
    location: "야탑초등학교",
    matchStartsAt: "2026-11-19T01:00:00.000Z",
    createdAt: "2026-11-18T01:00:00.000Z",
    updatedAt: "2026-11-18T01:00:00.000Z",
    completedAt: null,
    ratingExcluded: false,
    round: null,
    ...overrides,
  }) as MatchInfo;

describe("groupBracketRounds", () => {
  it("라운드 오름차순으로 묶고 라운드 없는 경기는 맨 끝 null 묶음이다", () => {
    const groups = groupBracketRounds([
      makeMatch({ id: "m-free", round: null }),
      makeMatch({ id: "m-r2", round: 2 }),
      makeMatch({ id: "m-r1", round: 1 }),
      makeMatch({ id: "m-legacy", round: undefined }),
    ]);

    expect(groups.map((group) => group.round)).toEqual([1, 2, null]);
    expect(groups[2]?.matches.map((match) => match.id)).toEqual([
      "m-free",
      "m-legacy",
    ]);
  });

  it("묶음 안은 만든 순서이고 같으면 id 순이다", () => {
    const groups = groupBracketRounds([
      makeMatch({ id: "m-c", round: 1, createdAt: "2026-11-18T03:00:00.000Z" }),
      makeMatch({ id: "m-b", round: 1, createdAt: "2026-11-18T01:00:00.000Z" }),
      makeMatch({ id: "m-a", round: 1, createdAt: "2026-11-18T01:00:00.000Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.matches.map((match) => match.id)).toEqual([
      "m-a",
      "m-b",
      "m-c",
    ]);
  });

  it("취소 경기는 빼고, 남은 경기가 없는 라운드는 묶음을 만들지 않는다", () => {
    const groups = groupBracketRounds([
      makeMatch({ id: "m-cancel", round: 1, status: "cancelled" }),
      makeMatch({ id: "m-r2", round: 2, status: "completed" }),
    ]);

    expect(groups).toEqual([
      { round: 2, matches: [expect.objectContaining({ id: "m-r2" })] },
    ]);
  });

  it("입력 배열 순서를 바꾸지 않는다", () => {
    const matches = [
      makeMatch({ id: "m-r2", round: 2 }),
      makeMatch({ id: "m-r1", round: 1 }),
    ];
    groupBracketRounds(matches);
    expect(matches.map((match) => match.id)).toEqual(["m-r2", "m-r1"]);
  });
});

describe("findMyNextBracketMatch", () => {
  it("내 예정 경기 중 가장 앞 라운드 경기를 고른다", () => {
    const next = findMyNextBracketMatch(
      [
        makeMatch({ id: "m-r3", round: 3 }, [[ME, "Pb"], ["Pc", "Pd"]]),
        makeMatch({ id: "m-r2-other", round: 2 }),
        makeMatch({ id: "m-r2", round: 2 }, [["Pa", "Pb"], ["Pc", ME]]),
      ],
      ME,
    );
    expect(next?.id).toBe("m-r2");
  });

  it("진행 중·끝난·취소 경기는 고르지 않고, 없으면 null이다", () => {
    const mine: [string[], string[]] = [[ME, "Pb"], ["Pc", "Pd"]];
    expect(
      findMyNextBracketMatch(
        [
          makeMatch({ id: "m-live", round: 1, status: "created" }, mine),
          makeMatch({ id: "m-done", round: 1, status: "completed" }, mine),
          makeMatch({ id: "m-cancel", round: 1, status: "cancelled" }, mine),
        ],
        ME,
      ),
    ).toBeNull();
  });

  it("라운드 있는 경기가 라운드 없는 경기보다 앞이고, 같은 라운드는 만든 순서다", () => {
    const mine: [string[], string[]] = [[ME, "Pb"], ["Pc", "Pd"]];
    expect(
      findMyNextBracketMatch(
        [
          makeMatch({ id: "m-free", round: null }, mine),
          makeMatch(
            { id: "m-late", round: 4, createdAt: "2026-11-18T05:00:00.000Z" },
            mine,
          ),
          makeMatch(
            { id: "m-early", round: 4, createdAt: "2026-11-18T02:00:00.000Z" },
            mine,
          ),
        ],
        ME,
      )?.id,
    ).toBe("m-early");
  });
});

describe("formatBracketRoundLabel", () => {
  it("라운드 번호와 라운드 없는 묶음 이름", () => {
    expect(formatBracketRoundLabel(3)).toBe("3라운드");
    expect(formatBracketRoundLabel(null)).toBe("그 밖의 경기");
  });
});

describe("getBracketTeamAverageRating", () => {
  it("복식 경기는 복식 평점 평균이고 평점 없는 선수는 3.0으로 친다", () => {
    const match = makeMatch({ id: "m" });
    const teams = [
      {
        ...match.teams[0],
        players: [
          player("Pa", { singles: 5, doubles: 4 }),
          player("Pguest", null),
        ],
      },
      {
        ...match.teams[1],
        players: [
          player("Pc", { singles: 4, doubles: null }),
          player("Pd", { singles: 4, doubles: 3.5 }),
        ],
      },
    ] as MatchInfo["teams"];

    expect(getBracketTeamAverageRating({ ...match, teams }, 0)).toBe(3.5);
    expect(getBracketTeamAverageRating({ ...match, teams }, 1)).toBe(3.25);
  });

  it("단식 경기는 단식 평점을 쓴다", () => {
    const match = makeMatch({ id: "m", type: "singles" }, [["Pa"], ["Pb"]]);
    const teams = [
      { ...match.teams[0], players: [player("Pa", { singles: 4.2, doubles: 3 })] },
      { ...match.teams[1], players: [player("Pb", null)] },
    ] as MatchInfo["teams"];

    expect(getBracketTeamAverageRating({ ...match, teams }, 0)).toBe(4.2);
    expect(getBracketTeamAverageRating({ ...match, teams }, 1)).toBe(3);
  });
});
