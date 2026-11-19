import { describe, expect, it } from "vitest";
import { getPlayerJoinedAt } from "../player";

describe("getPlayerJoinedAt", () => {
  const createdAt = new Date("2026-01-01T00:00:00Z");

  it("승급 시각이 있으면 승급 시각을 돌려준다", () => {
    const promotedAt = new Date("2026-11-19T00:00:00Z");
    expect(getPlayerJoinedAt({ createdAt, promotedAt })).toBe(promotedAt);
  });

  it("승급 시각이 null이거나 없으면 가입 시각을 돌려준다", () => {
    expect(getPlayerJoinedAt({ createdAt, promotedAt: null })).toBe(createdAt);
    expect(getPlayerJoinedAt({ createdAt })).toBe(createdAt);
  });
});
