import { describe, expect, it } from "vitest";
import {
  EMPTY_SLOTS,
  addSlotPlayer,
  getNextSlotIndex,
  getSlotTeams,
  removeSlotPlayer,
  slotsFromTeams,
  swapSlots,
  type RecordSlots,
} from "./recordMatch.utils";

const fill = (...ids: string[]) =>
  ids.reduce<RecordSlots>((slots, id) => addSlotPlayer(slots, id), EMPTY_SLOTS);

describe("addSlotPlayer", () => {
  it("왼쪽부터 첫 빈자리(1→2→3→4)에 채운다", () => {
    expect(fill("a")).toEqual(["a", null, null, null]);
    expect(fill("a", "b")).toEqual(["a", "b", null, null]);
    expect(fill("a", "b", "c", "d")).toEqual(["a", "b", "c", "d"]);
  });

  it("중간에 빈자리가 생기면 그 자리부터 다시 채운다", () => {
    const slots = removeSlotPlayer(fill("a", "b", "c"), "a");
    expect(addSlotPlayer(slots, "e")).toEqual(["e", "b", "c", null]);
  });

  it("고른 빈자리가 있으면 그 자리에 채운다", () => {
    expect(addSlotPlayer(fill("a"), "b", 2)).toEqual(["a", null, "b", null]);
  });

  it("고른 자리가 이미 차 있으면 왼쪽부터 첫 빈자리에 채운다", () => {
    expect(addSlotPlayer(fill("a"), "b", 0)).toEqual(["a", "b", null, null]);
  });

  it("이미 자리에 있거나 자리가 다 차면 그대로 둔다", () => {
    const full = fill("a", "b", "c", "d");
    expect(addSlotPlayer(full, "e")).toBe(full);
    const one = fill("a");
    expect(addSlotPlayer(one, "a")).toBe(one);
  });
});

describe("getNextSlotIndex", () => {
  it("고른 빈자리 → 왼쪽 첫 빈자리 → 없음 순으로 정한다", () => {
    expect(getNextSlotIndex(EMPTY_SLOTS)).toBe(0);
    expect(getNextSlotIndex(EMPTY_SLOTS, 3)).toBe(3);
    expect(getNextSlotIndex(fill("a"), 0)).toBe(1);
    expect(getNextSlotIndex(fill("a", "b", "c", "d"))).toBeNull();
  });
});

describe("removeSlotPlayer", () => {
  it("그 자리만 비우고 다른 플레이어는 움직이지 않는다", () => {
    expect(removeSlotPlayer(fill("a", "b", "c"), "b")).toEqual([
      "a",
      null,
      "c",
      null,
    ]);
    expect(removeSlotPlayer(fill("a", "b", "c"), "c")).toEqual([
      "a",
      "b",
      null,
      null,
    ]);
  });
});

describe("swapSlots", () => {
  it("두 플레이어 자리를 맞바꾼다", () => {
    expect(swapSlots(fill("a", "b", "c", "d"), 1, 2)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
  });

  it("빈자리로는 옮긴다", () => {
    expect(swapSlots(fill("a", "b"), 1, 2)).toEqual(["a", null, "b", null]);
  });
});

describe("getSlotTeams", () => {
  it("양 팀 1명씩이면 단식, 2명씩이면 복식 팀이다", () => {
    expect(getSlotTeams(["a", null, "b", null])).toEqual([["a"], ["b"]]);
    expect(getSlotTeams([null, "a", null, "b"])).toEqual([["a"], ["b"]]);
    expect(getSlotTeams(fill("a", "b", "c", "d"))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("한쪽 팀에만 2명이거나 인원이 맞지 않으면 null이다", () => {
    expect(getSlotTeams(fill("a", "b"))).toBeNull();
    expect(getSlotTeams(fill("a", "b", "c"))).toBeNull();
    expect(getSlotTeams(EMPTY_SLOTS)).toBeNull();
  });
});

describe("slotsFromTeams", () => {
  it("팀 순서대로 자리에 그대로 둔다", () => {
    expect(slotsFromTeams([["a"], ["b"]])).toEqual(["a", null, "b", null]);
    expect(slotsFromTeams([["a", "b"], ["c", "d"]])).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
