import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { ACHIEVEMENTS } from "@pkpkdupr/shared/achievements";
import {
  fetchUnseenAchievements,
  formatAchievementProgress,
  getAchievementProgressRatio,
  getDisplayedAchievementProgress,
  getCelebrationPointSteps,
  interpolateAchievementProgress,
  markAchievementsSeen,
  trackAchievementWrite,
} from "@/lib/achievements";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const seen = { achievementId: "wins-1", earnedMatchId: "Mmatch01" };

describe("업적 확인 처리와 미확인 조회", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("확인 처리 요청이 끝난 뒤에 미확인을 조회한다", async () => {
    let resolveSeen: (response: Response) => void = () => {};
    vi.mocked(apiFetch).mockImplementation((path) =>
      path === "/api/me/achievements/seen"
        ? new Promise((resolve) => {
            resolveSeen = resolve;
          })
        : Promise.resolve(Response.json({ achievements: [], points: 0 })),
    );

    const marking = markAchievementsSeen([seen]);
    const fetching = fetchUnseenAchievements();
    await Promise.resolve();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/me/achievements/seen",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ achievements: [seen] }),
      }),
    );

    resolveSeen(new Response(null, { status: 204 }));
    await marking;
    await expect(fetching).resolves.toEqual({ achievements: [], points: 0 });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/me/achievements/unseen");
  });

  it("확인 처리가 실패해도 미확인 조회는 진행한다", async () => {
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path === "/api/me/achievements/seen"
          ? new Response(null, { status: 500 })
          : Response.json({ achievements: [] }),
      ),
    );

    await expect(markAchievementsSeen([seen])).rejects.toThrow();
    // 점수가 없는 응답(점수 추가 전 서버)은 null로 받는다
    await expect(fetchUnseenAchievements()).resolves.toEqual({
      achievements: [],
      points: null,
    });
  });

  it("보낼 업적이 없으면 요청하지 않는다", async () => {
    await markAchievementsSeen([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("업적 진행 표시", () => {
  const definition = (id: string) => {
    const found = ACHIEVEMENTS.find((item) => item.id === id);
    if (!found) throw new Error(`업적 ${id}가 없습니다.`);
    return found;
  };
  const progress = (id: string, current: number, ratedDoublesMatches = 10) => ({
    id,
    earned: false,
    earnedAt: null,
    earnedMatchId: null,
    current,
    target: definition(id).target,
    ratedDoublesMatches,
  });

  it("평점 업적은 최고 복식 평점을 소수 셋째 자리로, 평점이 없으면 –로 보여 준다", () => {
    expect(
      formatAchievementProgress(
        definition("rating-4.0"),
        progress("rating-4.0", 3.61),
      ),
    ).toBe("최고 3.610");
    expect(
      formatAchievementProgress(definition("rating-3.5"), progress("rating-3.5", 0)),
    ).toBe("최고 –");
  });

  it("진행 애니메이션 도중에는 숫자는 0부터, 평점은 3.000부터, 채우기 전 경기 수는 0부터 센다", () => {
    const format = (id: string, current: number, t: number, matches = 10) =>
      formatAchievementProgress(
        definition(id),
        interpolateAchievementProgress(
          definition(id),
          progress(id, current, matches),
          t,
        ),
      );
    expect(format("streak-10", 6, 0)).toBe("최고 0");
    expect(format("streak-10", 6, 0.5)).toBe("최고 3");
    expect(format("matches-50", 30, 0.5)).toBe("15/50");
    expect(format("rating-3.5", 3.212, 0)).toBe("최고 3.000");
    expect(format("rating-low-2.0", 2.45, 0.5)).toBe("최저 2.725");
    expect(format("rating-3.5", 0, 0.5)).toBe("최고 –");
    expect(format("rating-3.5", 0, 0.5, 7)).toBe("복식 4/10경기");
    const done = progress("streak-10", 6);
    expect(interpolateAchievementProgress(definition("streak-10"), done, 1)).toBe(
      done,
    );
  });

  it("낮은 평점 업적은 최저 복식 평점으로 보여 준다", () => {
    expect(
      formatAchievementProgress(
        definition("rating-low-2.0"),
        progress("rating-low-2.0", 2.45),
      ),
    ).toBe("최저 2.450");
  });

  it("평점 업적은 복식 10경기를 채우기 전이면 경기 수로 보여 주고 막대도 경기 수 비율이다", () => {
    expect(
      formatAchievementProgress(
        definition("rating-low-2.5"),
        progress("rating-low-2.5", 0, 7),
      ),
    ).toBe("복식 7/10경기");
    expect(
      getAchievementProgressRatio(
        definition("rating-3.0"),
        progress("rating-3.0", 0, 7),
      ),
    ).toBeCloseTo(0.7);
  });

  it("평점 업적 막대는 기본 평점 3.0에서 목표까지 오른 비율이고, 3.0은 2.5에서 출발한다", () => {
    expect(
      getAchievementProgressRatio(
        definition("rating-4.0"),
        progress("rating-4.0", 3.5),
      ),
    ).toBeCloseTo(0.5);
    expect(
      getAchievementProgressRatio(
        definition("rating-3.5"),
        progress("rating-3.5", 2.8),
      ),
    ).toBe(0);
    expect(
      getAchievementProgressRatio(
        definition("rating-3.0"),
        progress("rating-3.0", 2.75),
      ),
    ).toBeCloseTo(0.5);
    expect(
      getAchievementProgressRatio(definition("wins-10"), progress("wins-10", 4)),
    ).toBeCloseTo(0.4);
  });

  it("낮은 평점 업적 막대는 3.0에서 목표까지 내려간 비율이다", () => {
    expect(
      getAchievementProgressRatio(
        definition("rating-low-2.0"),
        progress("rating-low-2.0", 2.5),
      ),
    ).toBeCloseTo(0.5);
    expect(
      getAchievementProgressRatio(
        definition("rating-low-2.5"),
        progress("rating-low-2.5", 0),
      ),
    ).toBe(0);
  });
});

describe("축하 연출 업적 점수", () => {
  it("장마다 그 장까지 받은 점수를 더해 마지막 장의 새 점수가 합계다", () => {
    expect(
      getCelebrationPointSteps([{ points: 10 }, { points: 0 }, { points: 25 }], 100),
    ).toEqual([
      { before: 65, after: 75 },
      { before: 75, after: 75 },
      { before: 75, after: 100 },
    ]);
  });
});

describe("모범생 진행 표시", () => {
  const rulesGuide = ACHIEVEMENTS.find((item) => item.id === "rules-guide")!;
  const unearned = {
    id: "rules-guide",
    earned: false,
    earnedAt: null,
    earnedMatchId: null,
    current: 0,
    target: 15,
  };

  it("내 업적이면 이 기기에서 본 장 수로 보인다", () => {
    const displayed = getDisplayedAchievementProgress(rulesGuide, unearned, {
      isMine: true,
      rulesGuideSeenCount: 7,
    });
    expect(displayed?.progress?.current).toBe(7);
    expect(formatAchievementProgress(rulesGuide, displayed?.progress)).toBe(
      "7/15",
    );
  });

  it("남의 못 받은 모범생은 진행을 보이지 않는다", () => {
    expect(
      getDisplayedAchievementProgress(rulesGuide, unearned, {
        isMine: false,
        rulesGuideSeenCount: 7,
      }),
    ).toBeNull();
  });

  it("받은 모범생과 다른 업적은 서버 진행 그대로다", () => {
    const earned = { ...unearned, earned: true, current: 15 };
    expect(
      getDisplayedAchievementProgress(rulesGuide, earned, {
        isMine: false,
        rulesGuideSeenCount: 0,
      }),
    ).toEqual({ progress: earned });
    const wins = ACHIEVEMENTS.find((item) => item.id === "wins-10")!;
    const winsProgress = { ...unearned, id: "wins-10", current: 3, target: 10 };
    expect(
      getDisplayedAchievementProgress(wins, winsProgress, {
        isMine: false,
        rulesGuideSeenCount: 0,
      }),
    ).toEqual({ progress: winsProgress });
  });
});

describe("업적 쓰기 뒤 미확인 조회", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({ achievements: [], points: 0 }),
    );
  });

  it("규칙 안내 완독 같은 업적 쓰기가 끝난 뒤에 미확인을 조회한다", async () => {
    let finishWrite: () => void = () => {};
    const write = trackAchievementWrite(
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      }),
    );
    const fetching = fetchUnseenAchievements();
    await Promise.resolve();
    expect(apiFetch).not.toHaveBeenCalled();

    finishWrite();
    await write;
    await fetching;
    expect(apiFetch).toHaveBeenCalledWith("/api/me/achievements/unseen");
  });
});
