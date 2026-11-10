import type { Match } from "@pkpkdupr/shared/match";
import type { MatchRepository } from "../repositories/MatchRepository";
import type { AuthService } from "./AuthService";

type AutoApprovalMatchRepository = Pick<
  MatchRepository,
  | "completeExpiredAutoApprovals"
  | "findAutoApprovedMatchesAwaitingRating"
  | "markAutoApprovalRatingApplied"
  | "clearAutoApprovalRatingApplied"
>;

type AutoApprovalRatingService = Pick<AuthService, "applyMatchResultToRatings">;

/** 만료된 합의를 완료하고, 실패한 평점 반영도 다음 주기에 다시 시도합니다. */
export class AutoApprovalService {
  private isProcessing = false;

  constructor(
    private readonly matchRepository: AutoApprovalMatchRepository,
    private readonly authService: AutoApprovalRatingService,
  ) {}

  async process(now: Date = new Date()): Promise<{
    completedMatches: Match[];
    appliedRatingCount: number;
  }> {
    if (this.isProcessing) {
      return { completedMatches: [], appliedRatingCount: 0 };
    }

    this.isProcessing = true;
    try {
      const completedMatches =
        await this.matchRepository.completeExpiredAutoApprovals(now);
      const awaitingRating =
        await this.matchRepository.findAutoApprovedMatchesAwaitingRating();
      let appliedRatingCount = 0;

      for (const match of awaitingRating) {
        // 표시를 먼저 선점해, 동시에 실행된 다른 호출이 같은 경기를 중복 반영하지 못하게 합니다.
        // 선점 후 반영 전에 프로세스가 중단되면 표시만 남아 자동 재시도되지 않으므로
        // 관리자 평점 재계산으로 복구합니다.
        const claimed = await this.matchRepository.markAutoApprovalRatingApplied(
          match.id,
          now,
        );
        if (!claimed) {
          continue;
        }

        try {
          await this.authService.applyMatchResultToRatings(match);
          appliedRatingCount += 1;
        } catch (error) {
          console.error(
            `[AUTO_APPROVAL] 평점 반영 실패 (다음 주기에 재시도): ${match.id}`,
            error,
          );
          try {
            await this.matchRepository.clearAutoApprovalRatingApplied(match.id);
          } catch (clearError) {
            console.error(
              `[AUTO_APPROVAL] 평점 반영 표시 되돌리기 실패 (관리자 평점 재계산 필요): ${match.id}`,
              clearError,
            );
          }
        }
      }

      return { completedMatches, appliedRatingCount };
    } finally {
      this.isProcessing = false;
    }
  }
}
