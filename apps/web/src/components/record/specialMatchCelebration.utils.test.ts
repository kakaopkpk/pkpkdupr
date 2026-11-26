import { describe, expect, it } from "vitest";
import type { SpecialMatchCelebration } from "@pkpkdupr/shared/specialMatch";
import type { MatchInfo } from "@/types/match";
import {
  RIVAL_STEP_MS,
  RIVAL_PASS_MS,
  SCENE_START_MS,
  getRivalCountSteps,
  getSceneBeatTimes,
  getSceneEndMs,
  isViewerOnWinningTeam,
  toSpecialMatchShareTarget,
} from "./specialMatchCelebration.utils";

const player = (id: string) => ({ id, username: id });

const rival = (
  attackerBefore: number,
  defenderBefore: number,
): Extract<SpecialMatchCelebration, { kind: "rival" }> => ({
  kind: "rival",
  defender: { player: player("def"), rankBefore: defenderBefore, rankAfter: defenderBefore + 1 },
  attacker: { player: player("cha"), rankBefore: attackerBefore, rankAfter: defenderBefore },
});

const match = {
  id: "m1",
  type: "mixed_doubles",
  completedAt: "2026-11-23T11:00:00.000Z",
  matchStartsAt: "2026-11-23T10:30:00.000Z",
  session: { id: "s1", name: "월요 정기운동", date: "2026-11-23", kind: "regular", startTime: null, endTime: null },
} as unknown as MatchInfo;

describe("getRivalCountSteps", () => {
  it("지키던 쪽과 1 차이가 될 때까지 한 칸씩 오른다", () => {
    expect(getRivalCountSteps(rival(7, 3))).toBe(3);
  });

  it("이미 1 차이면 오르지 않고 바로 넘어선다", () => {
    expect(getRivalCountSteps(rival(4, 3))).toBe(0);
    expect(getSceneBeatTimes(rival(4, 3))).toEqual([SCENE_START_MS]);
  });
});

describe("getSceneBeatTimes·getSceneEndMs", () => {
  it("라이벌전 승리는 오르는 박자들 뒤 넘어서기 한 번이고 지키던 쪽 얼굴이 다 흐려지면 끝난다", () => {
    const celebration = rival(6, 3);
    expect(getSceneBeatTimes(celebration)).toEqual([
      SCENE_START_MS,
      SCENE_START_MS + RIVAL_STEP_MS,
      SCENE_START_MS + RIVAL_STEP_MS * 2,
    ]);
    expect(getSceneEndMs(celebration)).toBe(SCENE_START_MS + RIVAL_STEP_MS * 2 + RIVAL_PASS_MS);
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

describe("도전 성공 연출", () => {
  const challenge: Extract<SpecialMatchCelebration, { kind: "challenge" }> = {
    kind: "challenge",
    defeated: [player("martin.bok"), player("sean.oh")],
    ratingGap: 0.253,
  };

  it("박자는 연승 저지와 같은 도장 떨어짐·박힘이다", () => {
    expect(getSceneBeatTimes(challenge)).toEqual(
      getSceneBeatTimes({ kind: "streak_stopper", stopped: { player: player("s"), streakBefore: 3 } }),
    );
    expect(getSceneEndMs(challenge)).toBeGreaterThan(getSceneBeatTimes(challenge)[1]!);
  });

  it("공유 대상은 진 팀 두 사람과 평점 차를 옮긴다", () => {
    expect(toSpecialMatchShareTarget(challenge, match, "scarlett.yoon")).toMatchObject({
      kind: "challenge-win",
      username: "scarlett.yoon",
      defeated: challenge.defeated,
      ratingGap: 0.253,
    });
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
  it("라이벌전 승리는 공격 쪽이 이긴 회원(▲), 지키던 쪽이 넘어선 회원(▼)이다", () => {
    expect(toSpecialMatchShareTarget(rival(5, 3), match, "me")).toEqual({
      matchId: "m1",
      username: "me",
      playedAt: "2026-11-23T11:00:00.000Z",
      sessionName: "월요 정기운동",
      kind: "rival",
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
