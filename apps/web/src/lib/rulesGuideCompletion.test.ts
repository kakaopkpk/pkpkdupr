import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};

// 본 장·보낸 상태를 모듈 안에 기억하므로 테스트마다 새로 불러온다
const loadModules = async () => {
  vi.resetModules();
  const guide = await import("./rulesGuide");
  const completion = await import("./rulesGuideCompletion");
  return { ...guide, ...completion };
};

const readAll = (
  markRulesGuideCardSeen: (index: number) => void,
  count: number,
) => {
  for (let index = 0; index < count; index += 1) markRulesGuideCardSeen(index);
};

describe("규칙 안내 완독 전송", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("모든 장을 보기 전에는 보내지 않는다", async () => {
    const { submitRulesGuideCompletion, markRulesGuideCardSeen, RULES_GUIDE_CARD_COUNT } =
      await loadModules();
    markRulesGuideCardSeen(RULES_GUIDE_CARD_COUNT - 1);

    await expect(submitRulesGuideCompletion()).resolves.toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("모든 장을 봤으면 한 번만 보낸다", async () => {
    const { submitRulesGuideCompletion, markRulesGuideCardSeen, RULES_GUIDE_CARD_COUNT } =
      await loadModules();
    readAll(markRulesGuideCardSeen, RULES_GUIDE_CARD_COUNT);

    const [first, concurrent] = await Promise.all([
      submitRulesGuideCompletion(),
      submitRulesGuideCompletion(),
    ]);
    await expect(submitRulesGuideCompletion()).resolves.toBe(false);

    expect(first).toBe(true);
    expect(concurrent).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/me/rules-guide/complete", {
      method: "POST",
    });
  });

  it("보내다 실패하면 다음에 다시 보낸다", async () => {
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { submitRulesGuideCompletion, markRulesGuideCardSeen, RULES_GUIDE_CARD_COUNT } =
      await loadModules();
    readAll(markRulesGuideCardSeen, RULES_GUIDE_CARD_COUNT);

    await expect(submitRulesGuideCompletion()).resolves.toBe(false);
    await expect(submitRulesGuideCompletion()).resolves.toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("앱 진입 때 서버에 완독이 있으면 보내지 않고, 없으면 다시 보낸다", async () => {
    const { syncRulesGuideCompletion, markRulesGuideCardSeen, RULES_GUIDE_CARD_COUNT } =
      await loadModules();
    readAll(markRulesGuideCardSeen, RULES_GUIDE_CARD_COUNT);

    await expect(
      syncRulesGuideCompletion("2026-11-26T09:00:00.000Z"),
    ).resolves.toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();

    await expect(syncRulesGuideCompletion(null)).resolves.toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
