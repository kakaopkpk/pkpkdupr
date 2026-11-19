import React from "react";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import { isClientError } from "../../api/client";
import { deleteSessionAsAdmin } from "../../api/sessions";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { formatShortDateWithWeekday, getSessionDateKey } from "./sessionDates";
import { getLoadErrorMessage } from "./sessionErrors";

/**
 * 자동 정기 세션을 지워 그 날짜를 정기 쉬는 날로 지정하는 확인 대화상자.
 * 오늘·미래 자동 정기 세션을 지우면 서버가 그 날짜를 정기 쉬는 날로 남긴다.
 */
export const SkipAutoRegularDialog: React.FC<{
  session: ManagedMatchSession | null;
  participantCount: number;
  onClose: () => void;
  onDone: () => void;
}> = ({ session, participantCount, onClose, onDone }) => {
  const { showToast } = useToast();
  const dateLabel = session ? formatShortDateWithWeekday(getSessionDateKey(session)) : "";

  const handleConfirm = async () => {
    if (!session) return;
    try {
      await deleteSessionAsAdmin(session.id);
    } catch (err) {
      // 4xx는 확인 대화상자 안 문구로 보이고, 네트워크·5xx는 토스트로 알린 뒤 닫는다
      if (isClientError(err)) throw err;
      showToast(getLoadErrorMessage(err, "처리하지 못했어요. 다시 시도해 주세요."));
      return;
    }
    showToast(`${dateLabel}요일을 정기 쉬는 날로 지정했어요`);
    onDone();
  };

  return (
    <ConfirmDialog
      open={!!session}
      title={`${dateLabel}요일을 정기 쉬는 날로 지정할까요?`}
      description={`'${session?.name ?? ""}' 세션과 참여 신청 ${participantCount}명이 지워지고, 구글 캘린더 일정도 지워져요.`}
      confirmLabel="정기 쉬는 날로 지정"
      onConfirm={handleConfirm}
      onClose={onClose}
    />
  );
};
