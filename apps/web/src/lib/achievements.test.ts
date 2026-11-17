import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { ACHIEVEMENTS } from "@pkpkdupr/shared/achievements";
import {
  fetchUnseenAchievements,
  formatAchievementProgress,
  getAchievementProgressRatio,
  markAchievementsSeen,
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
        : Promise.resolve(Response.json({ achievements: [] })),
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
    await expect(fetching).resolves.toEqual([]);
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
    await expect(fetchUnseenAchievements()).resolves.toEqual([]);
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
