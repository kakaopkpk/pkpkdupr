import { describe, expect, it } from "vitest";
import { getNextShowCycle } from "./usePlayOnShow";

const hidden = { isVisible: false, playKey: null, lastKey: 0 };

describe("getNextShowCycle", () => {
  it("보이고 준비되면 새 회차를 연다", () => {
    expect(getNextShowCycle(hidden, true, true)).toEqual({ isVisible: true, playKey: 1, lastKey: 1 });
  });

  it("준비 전에는 회차를 열지 않고, 같은 보임 안에서 준비되면 연다", () => {
    const waiting = getNextShowCycle(hidden, true, false);
    expect(waiting.playKey).toBeNull();
    expect(getNextShowCycle(waiting, true, true).playKey).toBe(1);
  });

  it("같은 보임 안의 리렌더·재조회로는 회차가 바뀌지 않는다", () => {
    const playing = getNextShowCycle(hidden, true, true);
    expect(getNextShowCycle(playing, true, true)).toBe(playing);
    expect(getNextShowCycle(playing, true, false)).toBe(playing);
  });

  it("숨겼다 다시 보이면 새 회차를 연다", () => {
    const playing = getNextShowCycle(hidden, true, true);
    const covered = getNextShowCycle(playing, false, true);
    expect(covered.playKey).toBeNull();
    expect(getNextShowCycle(covered, false, true)).toBe(covered);
    expect(getNextShowCycle(covered, true, true).playKey).toBe(2);
  });

  it("숨김 중에는 준비돼도 회차를 열지 않는다", () => {
    expect(getNextShowCycle(hidden, false, true)).toBe(hidden);
  });
});
