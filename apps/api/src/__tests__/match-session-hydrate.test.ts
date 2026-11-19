import { describe, expect, it } from "vitest";
import { hydrateMatch } from "../repositories/MatchRepository";

describe("hydrateMatch의 session", () => {
  it("세션 종류와 시작·종료 시각을 응답에 담는다", () => {
    const match = hydrateMatch({
      id: "match-1",
      teams: [{ players: [] }, { players: [] }],
      session: {
        id: "Ssessn01",
        name: "대회",
        date: "2026-11-17T15:00:00.000Z",
        location: "야탑초등학교",
        kind: "tournament",
        startTime: "22:00",
        endTime: "02:00",
      },
    });

    expect(match.session).toMatchObject({
      id: "Ssessn01",
      kind: "tournament",
      startTime: "22:00",
      endTime: "02:00",
    });
  });

  it("시각이 없는 세션은 null로 담는다", () => {
    const match = hydrateMatch({
      id: "match-1",
      teams: [{ players: [] }, { players: [] }],
      session: {
        id: "Ssessn01",
        name: "번개",
        date: "2026-11-17T15:00:00.000Z",
        location: "야탑초등학교",
        kind: "custom",
      },
    });

    expect(match.session).toMatchObject({
      kind: "custom",
      startTime: null,
      endTime: null,
    });
  });
});
