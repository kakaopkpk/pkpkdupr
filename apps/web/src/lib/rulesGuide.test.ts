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

// 본 장·닫음을 모듈 안에도 기억하므로 테스트마다 새로 불러온다
const loadModule = async () => {
  vi.resetModules();
  return import("./rulesGuide");
};

describe("rulesGuide", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the home card count in sync with the guide cards", async () => {
    const { RULES_GUIDE_CARD_COUNT } = await loadModule();
    const { RULES_GUIDE_CARDS } = await import(
      "@/components/rules/RulesGuideCards"
    );

    expect(RULES_GUIDE_CARD_COUNT).toBe(RULES_GUIDE_CARDS.length);
  });

  it("labels each card with its section and position in the section", async () => {
    const { RULES_GUIDE_CARDS } = await import(
      "@/components/rules/RulesGuideCards"
    );

    expect(RULES_GUIDE_CARDS.map((card) => card.eyebrow)).toEqual([
      "개요 1/3",
      "개요 2/3",
      "개요 3/3",
      "치는 법 1/4",
      "치는 법 2/4",
      "치는 법 3/4",
      "치는 법 4/4",
      "서브 1/4",
      "서브 2/4",
      "서브 3/4",
      "서브 4/4",
      "정리",
      "부록 1/3",
      "부록 2/3",
      "부록 3/3",
    ]);
  });

  it("keeps the home card until every card has been seen", async () => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);
    const {
      RULES_GUIDE_CARD_COUNT,
      RULES_GUIDE_SEEN_STORAGE_KEY,
      getRulesGuideSeenCount,
      isRulesGuideCardHidden,
      markRulesGuideCardSeen,
    } = await loadModule();

    markRulesGuideCardSeen(0);
    markRulesGuideCardSeen(0);
    markRulesGuideCardSeen(RULES_GUIDE_CARD_COUNT - 1);
    expect(getRulesGuideSeenCount()).toBe(2);
    expect(isRulesGuideCardHidden()).toBe(false);
    expect(storage.values.get(RULES_GUIDE_SEEN_STORAGE_KEY)).toBe(
      JSON.stringify([0, RULES_GUIDE_CARD_COUNT - 1]),
    );

    for (let index = 0; index < RULES_GUIDE_CARD_COUNT; index += 1) {
      markRulesGuideCardSeen(index);
    }
    expect(getRulesGuideSeenCount()).toBe(RULES_GUIDE_CARD_COUNT);
    expect(isRulesGuideCardHidden()).toBe(true);
  });

  it("hides the home card once it is closed", async () => {
    const storage = createStorage();
    vi.stubGlobal("localStorage", storage);
    const {
      RULES_GUIDE_CLOSED_STORAGE_KEY,
      closeRulesGuideCard,
      isRulesGuideCardHidden,
    } = await loadModule();
    expect(isRulesGuideCardHidden()).toBe(false);

    closeRulesGuideCard();

    expect(isRulesGuideCardHidden()).toBe(true);
    expect(storage.values.get(RULES_GUIDE_CLOSED_STORAGE_KEY)).toBe("1");
  });

  it("reads progress saved earlier and ignores invalid card numbers", async () => {
    vi.stubGlobal(
      "localStorage",
      createStorage({
        "pkpkdupr:rules-guide-seen": JSON.stringify([0, 3, 3, 15, -1, 1.5, "2"]),
        // 열기만 해도 써지던 옛 키는 읽지 않는다
        "pkpkdupr:rules-guide-dismissed": "1",
      }),
    );
    const { getRulesGuideSeenCount, isRulesGuideCardHidden } =
      await loadModule();

    expect(getRulesGuideSeenCount()).toBe(2);
    expect(isRulesGuideCardHidden()).toBe(false);
  });

  it("treats broken saved progress as nothing seen", async () => {
    vi.stubGlobal(
      "localStorage",
      createStorage({ "pkpkdupr:rules-guide-seen": "{" }),
    );
    const { getRulesGuideSeenCount } = await loadModule();

    expect(getRulesGuideSeenCount()).toBe(0);
  });

  it("remembers progress for this run when storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const {
      closeRulesGuideCard,
      getRulesGuideSeenCount,
      isRulesGuideCardHidden,
      markRulesGuideCardSeen,
    } = await loadModule();
    expect(isRulesGuideCardHidden()).toBe(false);

    expect(() => markRulesGuideCardSeen(1)).not.toThrow();
    expect(getRulesGuideSeenCount()).toBe(1);
    expect(() => closeRulesGuideCard()).not.toThrow();
    expect(isRulesGuideCardHidden()).toBe(true);
  });
});
