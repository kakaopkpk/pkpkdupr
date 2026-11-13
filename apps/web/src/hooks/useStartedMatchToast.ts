import { useCallback } from "react";
import type { MatchInfo } from "@/types/match";
import { getErrorMessage } from "@/components/record/recordMatch.utils";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import { isNetworkError } from "@/lib/errors";
import { deleteMatch } from "@/lib/matches";

/**
 * "같은 멤버로 한 판 더"로 진행 중 경기를 만든 직후 띄우는 토스트.
 * "취소"를 누르면 방금 만든 경기를 삭제 API로 지운다(점수가 없어 평점 영향이 없다).
 */
export const useStartedMatchToast = () => {
  const { showSaveFailure, showToast } = useSystemNotice();
  const { notifyDataChanged } = useAppNavigation();

  return useCallback(
    (match: Pick<MatchInfo, "id" | "updatedAt">) => {
      const cancel = async () => {
        await deleteMatch(match.id, match.updatedAt);
        notifyDataChanged();
      };
      // 그사이 누가 점수를 넣었으면(409) 지우지 않고 서버 문구를 알린다
      const showRejection = (err: unknown) =>
        showToast({ message: getErrorMessage(err, "경기를 지우지 못했어요.") });

      showToast({
        message: "진행 중 경기를 만들었어요",
        actionLabel: "취소",
        onAction: () => {
          void cancel().catch((err: unknown) => {
            if (!isNetworkError(err)) {
              showRejection(err);
              return;
            }
            showSaveFailure({
              // 다시 시도에서 서버가 거절하면 저장 실패 알림을 닫고 거절 문구를 보인다
              onRetry: () =>
                cancel().catch((retryError: unknown) => {
                  if (isNetworkError(retryError)) throw retryError;
                  showRejection(retryError);
                }),
            });
          });
        },
      });
    },
    [notifyDataChanged, showSaveFailure, showToast],
  );
};
