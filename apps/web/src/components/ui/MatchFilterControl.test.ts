import { describe, expect, it } from "vitest";
import { getMatchFilterOptions } from "./MatchFilterControl";

describe("getMatchFilterOptions", () => {
  it("전체·내 경기 라벨 뒤에 개수를 붙이고 0도 그대로 보인다", () => {
    expect(getMatchFilterOptions(7, 0)).toEqual([
      { value: "all", label: "전체 7" },
      { value: "mine", label: "내 경기 0" },
    ]);
  });
});
