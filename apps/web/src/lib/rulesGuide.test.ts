import { afterEach, describe, expect, it, vi } from "vitest";

const createStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
};

// 숨김 상태를 모듈 안에도 기억하므로 테스트마다 새로 불러온다
const loadModule = async () => {
  vi.resetModules();
  return import("./rulesGuide");
};

describe("rulesGuide", () => {
  it("keeps the home card count in sync with the guide cards", async () => {
    const { RULES_GUIDE_CARD_COUNT } = await loadModule();
    const { RULES_GUIDE_CARDS } = await import(
      "@/components/rules/RulesGuideCards"
    );

    expect(RULES_GUIDE_CARD_COUNT).toBe(RULES_GUIDE_CARDS.length);
  });


  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dismisses the home card on this device", async () => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);
    const {
      RULES_GUIDE_DISMISSED_STORAGE_KEY,
      dismissRulesGuideCard,
      isRulesGuideCardDismissed,
    } = await loadModule();
    expect(isRulesGuideCardDismissed()).toBe(false);

    dismissRulesGuideCard();

    expect(isRulesGuideCardDismissed()).toBe(true);
    expect(storage.values.get(RULES_GUIDE_DISMISSED_STORAGE_KEY)).toBe("1");
  });

  it("reads a dismissal saved earlier on this device", async () => {
    vi.stubGlobal(
      "localStorage",
      createStorage({ "pkpkdupr:rules-guide-dismissed": "1" }),
    );
    const { isRulesGuideCardDismissed } = await loadModule();

    expect(isRulesGuideCardDismissed()).toBe(true);
  });

  it("keeps the card dismissed for this run when storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { dismissRulesGuideCard, isRulesGuideCardDismissed } =
      await loadModule();
    expect(isRulesGuideCardDismissed()).toBe(false);

    expect(() => dismissRulesGuideCard()).not.toThrow();
    expect(isRulesGuideCardDismissed()).toBe(true);
  });
});
