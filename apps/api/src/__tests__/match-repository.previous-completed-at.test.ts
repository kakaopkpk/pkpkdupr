import { MatchRepository } from "@pkpkdupr/db";
import { describe, expect, it, vi } from "vitest";

const createRepository = (rows: unknown[]) => {
  const execute = vi.fn().mockResolvedValue({ rows });
  const repository = new MatchRepository({}, { execute });
  return { repository, execute };
};

const before = new Date("2026-08-01T10:00:00.000Z");

describe("MatchRepository.findPreviousCompletedAt", () => {
  it("이전 완료 경기가 없으면(MAX가 NULL) null을 반환한다", async () => {
    const { repository, execute } = createRepository([{ completed_at: null }]);

    await expect(
      repository.findPreviousCompletedAt("player-1", ["singles"], before),
    ).resolves.toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("결과 행이 없어도 null을 반환한다", async () => {
    const { repository } = createRepository([]);

    await expect(
      repository.findPreviousCompletedAt("player-1", ["singles"], before),
    ).resolves.toBeNull();
  });

  it("이전 완료 경기가 있으면 completed_at을 Date로 반환한다", async () => {
    const seconds = Math.floor(
      new Date("2026-07-01T09:30:00.000Z").getTime() / 1000,
    );
    const { repository } = createRepository([{ completed_at: seconds }]);

    const result = await repository.findPreviousCompletedAt(
      "player-1",
      ["singles"],
      before,
    );

    expect(result).toEqual(new Date("2026-07-01T09:30:00.000Z"));
  });
});
