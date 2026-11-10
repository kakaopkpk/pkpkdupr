import { describe, expect, it, vi } from "vitest";
import { AutoApprovalService } from "../services/AutoApprovalService";

const completedMatch = { id: "match-auto" } as any;

const createRepository = (
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
) => ({
  completeExpiredAutoApprovals: vi.fn().mockResolvedValue([]),
  findAutoApprovedMatchesAwaitingRating: vi
    .fn()
    .mockResolvedValue([completedMatch]),
  markAutoApprovalRatingApplied: vi.fn().mockResolvedValue(true),
  clearAutoApprovalRatingApplied: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("AutoApprovalService", () => {
  it("만료 경기를 완료하고 표시를 선점한 뒤 평점을 반영한다", async () => {
    const repository = createRepository({
      completeExpiredAutoApprovals: vi.fn().mockResolvedValue([completedMatch]),
    });
    const authService = {
      applyMatchResultToRatings: vi.fn().mockResolvedValue([]),
    };
    const now = new Date("2026-07-31T10:00:00.000Z");

    const result = await new AutoApprovalService(
      repository as any,
      authService as any,
    ).process(now);

    expect(repository.completeExpiredAutoApprovals).toHaveBeenCalledWith(now);
    expect(repository.markAutoApprovalRatingApplied).toHaveBeenCalledWith(
      completedMatch.id,
      now,
    );
    expect(authService.applyMatchResultToRatings).toHaveBeenCalledWith(
      completedMatch,
    );
    expect(
      repository.markAutoApprovalRatingApplied.mock.invocationCallOrder[0],
    ).toBeLessThan(
      authService.applyMatchResultToRatings.mock.invocationCallOrder[0],
    );
    expect(repository.clearAutoApprovalRatingApplied).not.toHaveBeenCalled();
    expect(result).toEqual({
      completedMatches: [completedMatch],
      appliedRatingCount: 1,
    });
  });

  it("선점에 실패한 경기는 평점 반영을 건너뛰고 건수에 세지 않는다", async () => {
    const repository = createRepository({
      markAutoApprovalRatingApplied: vi.fn().mockResolvedValue(false),
    });
    const authService = {
      applyMatchResultToRatings: vi.fn().mockResolvedValue([]),
    };

    const result = await new AutoApprovalService(
      repository as any,
      authService as any,
    ).process();

    expect(authService.applyMatchResultToRatings).not.toHaveBeenCalled();
    expect(repository.clearAutoApprovalRatingApplied).not.toHaveBeenCalled();
    expect(result.appliedRatingCount).toBe(0);
  });

  it("평점 반영에 실패하면 선점 표시를 되돌려 다음 주기에 재시도한다", async () => {
    const repository = createRepository();
    const authService = {
      applyMatchResultToRatings: vi.fn().mockRejectedValue(new Error("failed")),
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await new AutoApprovalService(
      repository as any,
      authService as any,
    ).process();

    expect(repository.clearAutoApprovalRatingApplied).toHaveBeenCalledWith(
      completedMatch.id,
    );
    expect(result.appliedRatingCount).toBe(0);
    errorSpy.mockRestore();
  });
});
