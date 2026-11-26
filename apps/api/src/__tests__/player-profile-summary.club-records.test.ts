import type { AchievementMatch } from "@pkpkdupr/shared/achievements";
import type { Match } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import { describe, expect, it, vi } from "vitest";
import { buildPlayerProfileSummary } from "../services/PlayerProfileSummaryService";

// 고정 데이터가 업적 기준 시각 전 경기라 기존·새 업적 지표 모두 기준 시각 없이 센다.
vi.mock("@pkpkdupr/shared/achievementCountStart", () => ({
  ACHIEVEMENT_COUNT_START: new Date(0),
  SECOND_ACHIEVEMENT_SET_COUNT_START: new Date(0),
  CHALLENGER_ACHIEVEMENT_COUNT_START: new Date(0),
  TOURNAMENT_ACHIEVEMENT_COUNT_START: new Date(0),
}));

const now = new Date("2026-11-12T12:00:00.000Z");

const makePlayer = (id: string): Player => ({
  isGuest: false,
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
});

const me = makePlayer("Pmeplayr");
const veteran = makePlayer("Pveteran");
const opponentA = makePlayer("Popponta");
const opponentB = makePlayer("Popponb1");

/** 나와 veteran이 한 팀인 복식 경기. 내 경기만 보면 veteran의 첫 경기처럼 보인다 */
const myMatch: Match = {
  ratingExcluded: false,
  id: "Mmymatch",
  type: "unrestricted-doubles",
  source: "player_created",
  creatorPlayerId: me.id,
  status: "completed",
  teams: [
    { id: "team-a", name: "Team A", players: [me, veteran] },
    { id: "team-b", name: "Team B", players: [opponentA, opponentB] },
  ],
  scores: [{ scoreA: 11, scoreB: 7 }],
  resultSubmittedByPlayerId: me.id,
  resultSubmittedAt: now,
  location: "야탑초등학교",
  matchStartsAt: new Date(now.getTime() - 60 * 60 * 1000),
  completedAt: now,
  createdAt: now,
  updatedAt: now,
};

/** veteran이 전에 뛴 경기(내 경기 목록에는 없다) */
const veteranEarlierMatch: AchievementMatch = {
  id: "Mveteran",
  type: "unrestricted-doubles",
  status: "completed",
  completedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  teams: [
    { players: [{ id: veteran.id }, { id: opponentA.id }] },
    { players: [{ id: opponentB.id }, { id: "Pother01" }] },
  ],
  scores: [{ scoreA: 11, scoreB: 7 }],
  session: null,
};

const welcomeOf = (achievementMatches?: readonly AchievementMatch[]) =>
  buildPlayerProfileSummary(
    [myMatch],
    me.id,
    { singles: [], doubles: [] },
    me.id,
    now,
    undefined,
    undefined,
    achievementMatches,
  ).achievements.find((item) => item.id === "welcome");

describe("buildPlayerProfileSummary 다른 회원 기록이 필요한 업적", () => {
  it("전체 경기를 받으면 파트너의 이전 경기를 보고 환영 인사를 주지 않는다", () => {
    expect(welcomeOf([veteranEarlierMatch, myMatch])).toMatchObject({
      earned: false,
      current: 0,
    });
  });

  it("전체 경기가 없으면 내 경기만으로 잘못 받지 않게 받지 않은 상태로 둔다", () => {
    expect(welcomeOf()).toMatchObject({
      earned: false,
      earnedMatchId: null,
      current: 0,
    });
  });
});
