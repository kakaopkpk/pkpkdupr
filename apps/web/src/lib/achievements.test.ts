import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import {
  fetchUnseenAchievements,
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
