import { describe, expect, it } from "vitest";
import type { SpecialMatchCelebration } from "@pkpkdupr/shared/specialMatch";
import type { MatchInfo } from "@/types/match";
import {
  CHALLENGE_STEP_MS,
  CHALLENGE_SWAP_MS,
  SCENE_START_MS,
  getChallengeCountSteps,
  getSceneBeatTimes,
  getSceneEndMs,
  isViewerOnWinningTeam,
  toSpecialMatchShareTarget,
} from "./specialMatchCelebration.utils";

const player = (id: string) => ({ id, username: id });

const challenge = (
  challengerBefore: number,
  defenderBefore: number,
): Extract<SpecialMatchCelebration, { kind: "challenge" }> => ({
  kind: "challenge",
  defender: { player: player("def"), rankBefore: defenderBefore, rankAfter: defenderBefore + 1 },
  challenger: { player: player("cha"), rankBefore: challengerBefore, rankAfter: defenderBefore },
});

const match = {
  id: "m1",
  type: "mixed_doubles",
  completedAt: "2026-11-23T11:00:00.000Z",
  matchStartsAt: "2026-11-23T10:30:00.000Z",
  session: { id: "s1", name: "월요 정기운동", date: "2026-11-23", kind: "regular", startTime: null, endTime: null },
} as unknown as MatchInfo;

describe("getChallengeCountSteps", () => {
  it("지키던 쪽과 1 차이가 될 때까지 한 칸씩 오른다", () => {
    expect(getChallengeCountSteps(challenge(7, 3))).toBe(3);
  });

  it("이미 1 차이면 오르지 않고 바로 자리를 바꾼다", () => {
    expect(getChallengeCountSteps(challenge(4, 3))).toBe(0);
    expect(getSceneBeatTimes(challenge(4, 3))).toEqual([SCENE_START_MS]);
  });
});

describe("getSceneBeatTimes·getSceneEndMs", () => {
  it("도전 성공은 오르는 박자들 뒤 자리 바꿈 한 번이고 자리를 다 바꾸면 끝난다", () => {
    const celebration = challenge(6, 3);
    expect(getSceneBeatTimes(celebration)).toEqual([
      SCENE_START_MS,
      SCENE_START_MS + CHALLENGE_STEP_MS,
      SCENE_START_MS + CHALLENGE_STEP_MS * 2,
    ]);
    expect(getSceneEndMs(celebration)).toBe(SCENE_START_MS + CHALLENGE_STEP_MS * 2 + CHALLENGE_SWAP_MS);
  });

  it("최강자전은 연승 저지 박자 뒤에 이긴 쪽 타오름이 한 번 더 있다", () => {
    const stopper: SpecialMatchCelebration = {
      kind: "streak_stopper",
      stopped: { player: player("a"), streakBefore: 7 },
    };
    const champions: SpecialMatchCelebration = {
      kind: "champions",
      winner: { player: player("w"), streakBefore: 5 },
      loser: { player: player("l"), streakBefore: 6 },
    };
    expect(getSceneBeatTimes(champions).slice(0, 2)).toEqual(getSceneBeatTimes(stopper));
    expect(getSceneBeatTimes(champions)).toHaveLength(3);
    expect(getSceneEndMs(champions)).toBeGreaterThan(getSceneEndMs(stopper));
  });
});

describe("isViewerOnWinningTeam", () => {
  const recorded = {
    teams: [{ players: [player("a"), player("b")] }, { players: [player("c"), player("d")] }],
    scores: [{ scoreA: 11, scoreB: 7 }],
  } as unknown as MatchInfo;

  it("이긴 팀에 있으면 true", () => {
    expect(isViewerOnWinningTeam(recorded, "b")).toBe(true);
  });

  it("진 팀·경기하지 않은 기록자·로그인 정보 없음은 false", () => {
    expect(isViewerOnWinningTeam(recorded, "c")).toBe(false);
    expect(isViewerOnWinningTeam(recorded, "z")).toBe(false);
    expect(isViewerOnWinningTeam(recorded, null)).toBe(false);
  });

  it("점수가 없으면 false", () => {
    expect(isViewerOnWinningTeam({ ...recorded, scores: [] }, "a")).toBe(false);
  });
});

describe("toSpecialMatchShareTarget", () => {
  it("도전 성공은 도전한 쪽이 위 줄(▲), 지키던 쪽이 넘어선 회원(▼)이다", () => {
    expect(toSpecialMatchShareTarget(challenge(5, 3), match, "me")).toEqual({
      matchId: "m1",
      username: "me",
      playedAt: "2026-11-23T11:00:00.000Z",
      sessionName: "월요 정기운동",
      kind: "challenge",
      category: "doubles",
      winner: { player: player("cha"), rank: 3, change: 2 },
      passed: { player: player("def"), rank: 4, change: 1 },
    });
  });

  it("최강자전 이긴 쪽 연승은 이 경기까지 센 값(직전 + 1)이다", () => {
    const target = toSpecialMatchShareTarget(
      {
        kind: "champions",
        winner: { player: player("w"), streakBefore: 5 },
        loser: { player: player("l"), streakBefore: 8 },
      },
      { ...match, session: undefined, completedAt: null },
      "w",
    );
    expect(target).toMatchObject({
      kind: "king-win",
      winnerStreak: 6,
      brokenStreak: 8,
      sessionName: null,
      playedAt: "2026-11-23T10:30:00.000Z",
    });
  });

  it("연승 저지는 끊긴 회원과 직전 연승을 옮긴다", () => {
    expect(
      toSpecialMatchShareTarget(
        { kind: "streak_stopper", stopped: { player: player("s"), streakBefore: 9 } },
        match,
        "me",
      ),
    ).toMatchObject({ kind: "streak-break", loser: player("s"), brokenStreak: 9 });
  });
});
