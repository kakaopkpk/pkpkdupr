import { describe, expect, it, vi } from "vitest";
import { createPullToRefreshStore } from "@/lib/pullToRefreshStore";

describe("createPullToRefreshStore", () => {
  it("바꾼 필드만 덮어쓰고 구독자에게 알린다", () => {
    const store = createPullToRefreshStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ distance: 40, status: "pulling" });
    store.set({ status: "armed" });

    expect(store.get()).toEqual({ distance: 40, status: "armed" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("값이 같으면 스냅샷을 유지하고 알리지 않는다", () => {
    const store = createPullToRefreshStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const snapshot = store.get();

    store.set({ distance: 0, status: "idle" });

    expect(store.get()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  it("구독을 풀면 더 알리지 않는다", () => {
    const store = createPullToRefreshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.set({ distance: 10 });

    expect(listener).not.toHaveBeenCalled();
  });
});
