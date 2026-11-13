import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import {
  excludeLocallySeenAchievements,
  markAchievementsSeen,
} from "@/lib/achievements";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const earned = (achievementId: string, earnedMatchId: string) => ({
  playerId: "Pme00001",
  achievementId,
  earnedMatchId,
  earnedAt: "2026-11-13T10:00:00.000Z",
});

describe("markAchievementsSeen", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("확인 처리를 보내고, 요청이 끝나기 전에도 같은 획득 건을 미확인 조회 결과에서 뺀다", async () => {
    let resolveRequest: (response: Response) => void = () => {};
    vi.mocked(apiFetch).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const request = markAchievementsSeen([earned("wins-1", "Mmatch01")]);

    expect(
      excludeLocallySeenAchievements([
        earned("wins-1", "Mmatch01"),
        // 다른 경기로 다시 받은 건은 남는다
        earned("wins-1", "Mmatch02"),
        earned("matches-1", "Mmatch01"),
      ]),
    ).toEqual([earned("wins-1", "Mmatch02"), earned("matches-1", "Mmatch01")]);
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/me/achievements/seen",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          achievements: [{ achievementId: "wins-1", earnedMatchId: "Mmatch01" }],
        }),
      }),
    );

    resolveRequest(new Response(null, { status: 204 }));
    await expect(request).resolves.toBeUndefined();
  });

  it("확인 처리가 실패하면 다시 조회 결과에 남긴다", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      markAchievementsSeen([earned("wins-10", "Mmatch01")]),
    ).rejects.toThrow();
    expect(
      excludeLocallySeenAchievements([earned("wins-10", "Mmatch01")]),
    ).toEqual([earned("wins-10", "Mmatch01")]);
  });

  it("다른 회원이 같은 경기로 받은 같은 업적은 빼지 않는다", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 204 }));
    await markAchievementsSeen([earned("wins-50", "Mmatch01")]);

    const other = { ...earned("wins-50", "Mmatch01"), playerId: "Pother01" };
    expect(excludeLocallySeenAchievements([other])).toEqual([other]);
  });

  it("보낼 업적이 없으면 요청하지 않는다", async () => {
    await markAchievementsSeen([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
