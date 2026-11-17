import React, { useCallback, useEffect, useState } from "react";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import type { MatchSessionDetail } from "@pkpkdupr/shared/session";
import { isClientError } from "../../api/client";
import { deleteSessionAsAdmin, fetchSessionDetail } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DetailPanel, PanelSection } from "../../components/ui/DetailPanel";
import { useToast } from "../../components/ui/Toast";
import { formatShortDateWithWeekday, getSessionDateKey } from "./sessionDates";
import { getLoadErrorMessage } from "./sessionErrors";
import { SessionParticipantsEditor } from "./SessionParticipantsEditor";
import {
  DangerSection,
  formatSessionSubtitle,
  PanelStatus,
  SessionPanelTitle,
} from "./SessionPanelParts";

/** 오늘·미래 세션 패널. 정기 세션은 '이 날 취소', 회원 세션은 수정·삭제가 있다 */
export const UpcomingSessionPanel: React.FC<{
  session: ManagedMatchSession;
  players: AdminPlayer[];
  onClose: () => void;
  onEdit: (session: ManagedMatchSession) => void;
  /** 참여자가 바뀌면 달력 알약 숫자를 맞추려고 부른다 */
  onParticipantsChanged: () => void;
  onDeleted: () => void;
}> = ({ session, players, onClose, onEdit, onParticipantsChanged, onDeleted }) => {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<MatchSessionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isRegular = session.kind === "regular";
  const dateKey = getSessionDateKey(session);

  useEffect(() => {
    let canceled = false;
    setDetail(null);
    setLoadError(null);
    fetchSessionDetail(session.id)
      .then((next) => {
        if (!canceled) setDetail(next);
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setLoadError(getLoadErrorMessage(err, "세션을 불러오지 못했어요."));
        }
      });
    return () => {
      canceled = true;
    };
    // 수정으로 이름·날짜가 바뀌면 다시 읽는다
  }, [session.id, session.updatedAt]);

  const handleParticipantsChanged = useCallback(
    (next: MatchSessionDetail) => {
      setDetail(next);
      onParticipantsChanged();
    },
    [onParticipantsChanged],
  );

  const matchCount = detail?.matchCount ?? session.matchCount;
  const participantCount = detail?.participants.length ?? session.participantIds.length;
  const hasMatches = matchCount > 0;

  const handleDelete = async () => {
    try {
      await deleteSessionAsAdmin(session.id);
    } catch (err) {
      // 4xx는 확인 대화상자 안 문구로 보이고, 네트워크·5xx는 토스트로 알린 뒤 닫는다
      if (isClientError(err)) throw err;
      showToast(getLoadErrorMessage(err, "처리하지 못했어요. 다시 시도해 주세요."));
      return;
    }
    showToast(
      isRegular
        ? `${formatShortDateWithWeekday(dateKey)}요 정기운동을 취소했어요`
        : `'${session.name}' 세션을 지웠어요`,
    );
    onDeleted();
  };

  return (
    <DetailPanel
      title={<SessionPanelTitle session={session} />}
      subtitle={
        <>
          <span className="block">{formatSessionSubtitle(session, session.location)}</span>
          {isRegular && (
            <span className="mt-0.5 block text-pk-12 text-pk-muted">
              정기 세션 이름과 시간은 고정이에요.
            </span>
          )}
        </>
      }
      onClose={onClose}
    >
      {!isRegular && (
        <Button variant="soft" size="sm" onClick={() => onEdit(session)}>
          이름·날짜·시간 수정
        </Button>
      )}

      {detail ? (
        <SessionParticipantsEditor
          detail={detail}
          players={players}
          onChanged={handleParticipantsChanged}
        />
      ) : (
        <PanelSection title={`참여자 ${participantCount}`}>
          <PanelStatus>{loadError ?? "참여자를 불러오는 중…"}</PanelStatus>
        </PanelSection>
      )}

      <PanelSection title={`경기 ${matchCount}`}>
        <PanelStatus>경기는 회원 앱에서 시작·기록해요.</PanelStatus>
      </PanelSection>

      {isRegular ? (
        <DangerSection
          title="이 날 정기운동 취소"
          description={`세션과 참여 신청 ${participantCount}명을 지우고 구글 캘린더 일정도 지워요. 이 날짜는 쉬는 날로 남아요. 경기가 하나라도 있으면 취소할 수 없어요.`}
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={hasMatches}
              onClick={() => setConfirmOpen(true)}
            >
              이 날 취소…
            </Button>
          }
        />
      ) : (
        <DangerSection
          title="세션 삭제"
          description="세션과 참여 신청을 지우고 구글 캘린더 일정도 지워요. 쉬는 날로 남지 않아요. 경기가 있으면 지울 수 없어요."
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={hasMatches}
              onClick={() => setConfirmOpen(true)}
            >
              세션 삭제…
            </Button>
          }
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={
          isRegular
            ? `${formatShortDateWithWeekday(dateKey)}요 정기운동을 취소할까요?`
            : `'${session.name}' 세션을 지울까요?`
        }
        description={
          isRegular
            ? `참여 신청 ${participantCount}명이 지워지고, 이 날짜는 쉬는 날로 남아요.`
            : `참여 신청 ${participantCount}명이 함께 지워져요.`
        }
        confirmLabel={isRegular ? "이 날 취소" : "세션 삭제"}
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </DetailPanel>
  );
};
