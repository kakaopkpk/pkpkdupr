import { describe, expect, it, vi } from "vitest";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import type {
  SessionPraiseCandidate,
  SessionPraiseResponse,
} from "@pkpkdupr/shared/sessionPraise";
import type { MatchSessionReportInfo } from "@/lib/rankings";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import {
  buildMyRecordShareTarget,
  buildSessionSummaryShareTarget,
  getSessionReportShareFileName,
  getSessionReportShareText,
  getSessionShareDateLabel,
  getSessionShareMetaLabel,
  getSharedPraisedCandidates,
} from "@/lib/sessionReportShare";

const playerReport = (
  id: string,
  overrides: Partial<SessionPlayerReport> = {},
): SessionPlayerReport => ({
  player: { id, username: id } as SessionPlayerReport["player"],
  matchCount: 3,
  wins: 2,
  losses: 1,
  ratingBefore: 3,
  ratingAfter: 3.05,
  ratingDelta: 0.05,
  rankBefore: 6,
  rankAfter: 5,
  ...overrides,
});

const makeReport = (
  players: SessionPlayerReport[],
  achievements: MatchSessionReportInfo["achievements"] = [],
): MatchSessionReportInfo => ({
  session: {
    id: "S1",
    name: "수요 번개",
    kind: "custom",
    date: "2026-11-18T09:00:00.000Z",
    dateKey: "2026-11-18",
    startTime: "18:00",
    location: "야탑초등학교",
    participantCount: 10,
    matchCount: 7,
  },
  players,
  topRiser: players[0] ?? null,
  achievements,
  winStreaks: {},
});

const candidate = (
  id: string,
  praiseCount: number,
  overrides: Partial<SessionPraiseCandidate> = {},
): SessionPraiseCandidate => ({
  player: { id, username: id } as SessionPraiseCandidate["player"],
  category: "mostWins",
  value: 3,
  praiseCount,
  ...overrides,
});

const makePraise = (
  candidates: SessionPraiseCandidate[],
  status: SessionPraiseResponse["status"] = "closed",
): SessionPraiseResponse => ({
  session: { id: "S1", name: "수요 번개", kind: "custom" },
  status,
  candidates,
  myTargetPlayerId: null,
});

describe("getSharedPraisedCandidates", () => {
  it("마감 뒤 칭찬 5개 이상 받은 후보만 후보 순서대로 넣는다", () => {
    const praise = makePraise([candidate("a", 4), candidate("b", 7), candidate("c", 5)]);
    expect(getSharedPraisedCandidates(praise).map((item) => item.player.id)).toEqual(["b", "c"]);
  });

  it("마감 전이거나 칭찬하지 않는 세션이면 비운다", () => {
    expect(getSharedPraisedCandidates(makePraise([candidate("a", 9)], "open"))).toEqual([]);
    expect(getSharedPraisedCandidates(null)).toEqual([]);
  });
});

describe("buildSessionSummaryShareTarget", () => {
  it("평점이 오른 회원을 상승폭 순으로 3명까지 넣는다", () => {
    const report = makeReport([
      playerReport("a", { ratingDelta: 0.03 }),
      playerReport("b", { ratingDelta: 0.1 }),
      playerReport("c", { ratingDelta: 0.02 }),
      playerReport("d", { ratingDelta: 0.04 }),
      playerReport("e", { ratingDelta: -0.02 }),
    ]);
    const target = buildSessionSummaryShareTarget(report, null);
    expect(target.risers.map((riser) => riser.player.id)).toEqual(["b", "d", "a"]);
    expect(target.participantCount).toBe(10);
    expect(target.matchCount).toBe(7);
    expect(target.praised).toEqual([]);
  });

  it("떨어졌거나 보합이거나 전후 평점이 없는 회원은 빼서 없으면 빈 목록이다", () => {
    const report = makeReport([
      playerReport("a", { ratingDelta: 0.0004 }),
      playerReport("b", { ratingDelta: 0, ratingBefore: null }),
      playerReport("c", { ratingDelta: -0.01 }),
    ]);
    expect(buildSessionSummaryShareTarget(report, null).risers).toEqual([]);
  });
});

describe("buildMyRecordShareTarget", () => {
  const me = { id: "me", username: "brad.ley" };

  it("내가 경기하지 않았으면 null", () => {
    const report = makeReport([playerReport("a"), playerReport("me", { matchCount: 0 })]);
    expect(buildMyRecordShareTarget(report, null, me)).toBeNull();
    expect(buildMyRecordShareTarget(report, null, null)).toBeNull();
  });

  it("평점·순위 변동·승패·내 업적을 넣는다", () => {
    const report = makeReport(
      [playerReport("me", { ratingAfter: 2.98, ratingDelta: -0.02, rankBefore: 6, rankAfter: 8, wins: 1, losses: 3 })],
      [
        { playerId: "me", achievementId: "streak-3", earnedAt: "2026-11-18T10:00:00.000Z" },
        { playerId: "other", achievementId: "hard-won", earnedAt: "2026-11-18T10:00:00.000Z" },
        { playerId: "me", achievementId: "no-such-achievement", earnedAt: "2026-11-18T10:00:00.000Z" },
      ] as unknown as MatchSessionReportInfo["achievements"],
    );
    const target = buildMyRecordShareTarget(report, null, me);
    expect(target).toMatchObject({
      username: "brad.ley",
      ratingAfter: 2.98,
      ratingDelta: -0.02,
      rankAfter: 8,
      rankChange: -2,
      wins: 1,
      losses: 3,
      praise: null,
      achievementIds: ["streak-3"],
    });
  });

  it("전후 평점이 없으면 변화량, 세션 전 순위가 없으면 순위 변동을 null로 둔다", () => {
    const report = makeReport([
      playerReport("me", { ratingBefore: null, ratingAfter: 3.1, rankBefore: null, rankAfter: 9 }),
    ]);
    expect(buildMyRecordShareTarget(report, null, me)).toMatchObject({
      ratingDelta: null,
      rankAfter: 9,
      rankChange: null,
    });
  });

  it("마감 뒤 내가 5개 이상 받았을 때만 칭찬 상자를 넣는다", () => {
    const report = makeReport([playerReport("me")]);
    const praised = makePraise([candidate("me", 5, { category: "winStreak", value: 3 })]);
    expect(buildMyRecordShareTarget(report, praised, me)?.praise).toEqual({
      category: "winStreak",
      value: 3,
      praiseCount: 5,
    });
    expect(buildMyRecordShareTarget(report, makePraise([candidate("me", 4)]), me)?.praise).toBeNull();
    expect(
      buildMyRecordShareTarget(report, makePraise([candidate("me", 9)], "open"), me)?.praise,
    ).toBeNull();
  });
});

describe("문구·파일 이름", () => {
  const report = makeReport([playerReport("me")]);
  const summary = buildSessionSummaryShareTarget(report, null);
  const mine = buildMyRecordShareTarget(report, null, { id: "me", username: "brad.ley" })!;

  it("이름 아래 줄은 날짜 · 장소, 아래 줄 날짜는 연도와 요일까지", () => {
    expect(getSessionShareMetaLabel(summary.session)).toBe("11월 18일 수 · 야탑초등학교");
    expect(getSessionShareMetaLabel({ ...summary.session, location: " " })).toBe("11월 18일 수");
    expect(getSessionShareDateLabel(summary.session)).toBe("2026년 11월 18일 수");
  });

  it("공유 문구와 파일 이름", () => {
    expect(getSessionReportShareText(summary)).toBe("수요 번개 세션 요약이에요");
    expect(getSessionReportShareText(mine)).toBe("brad.ley님의 수요 번개 기록이에요");
    expect(getSessionReportShareFileName(summary)).toBe("pkpkdupr-session-S1.png");
    expect(getSessionReportShareFileName(mine)).toBe("pkpkdupr-session-S1-me.png");
  });
});
