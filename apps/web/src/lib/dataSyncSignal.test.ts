import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRemoteInvalidationBatcher,
  parseDataSyncKinds,
} from "@/lib/dataSyncSignal";

describe("parseDataSyncKinds", () => {
  it("아는 종류만 중복 없이 고른다", () => {
    expect(
      parseDataSyncKinds({ kinds: ["matches", "unknown", "matches", 1, "players"] }),
    ).toEqual(["matches", "players"]);
  });

  it.each([null, undefined, "matches", { kinds: "matches" }, {}])(
    "형식이 틀리면 빈 배열이다(%j)",
    (payload) => {
      expect(parseDataSyncKinds(payload)).toEqual([]);
    },
  );
});

describe("createRemoteInvalidationBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("무작위 지연 뒤 지연 중 온 종류를 합쳐 한 번 무효화한다", () => {
    const invalidate = vi.fn();
    const batcher = createRemoteInvalidationBatcher(invalidate, {
      maxDelayMs: 1_500,
      random: () => 0.5,
    });

    batcher.schedule(["matches"]);
    vi.advanceTimersByTime(500);
    batcher.schedule(["ratings", "matches"]);
    vi.advanceTimersByTime(249);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(["matches", "ratings"]);

    batcher.schedule(["sessions"]);
    vi.advanceTimersByTime(750);
    expect(invalidate).toHaveBeenLastCalledWith(["sessions"]);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("빈 종류는 무효화를 걸지 않는다", () => {
    const invalidate = vi.fn();
    const batcher = createRemoteInvalidationBatcher(invalidate);
    batcher.schedule([]);
    vi.runAllTimers();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("flush는 걸린 종류를 바로 무효화하고 cancel은 버린다", () => {
    const invalidate = vi.fn();
    const batcher = createRemoteInvalidationBatcher(invalidate, {
      random: () => 1,
    });

    batcher.schedule(["matches"]);
    batcher.flush();
    expect(invalidate).toHaveBeenCalledWith(["matches"]);

    batcher.schedule(["sessions"]);
    batcher.cancel();
    vi.runAllTimers();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
