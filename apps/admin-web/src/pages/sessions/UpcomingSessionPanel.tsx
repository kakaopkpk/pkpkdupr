import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import type { MatchSessionDetail } from "@pkpkdupr/shared/session";
import { isClientError } from "../../api/client";
import { deleteSessionAsAdmin, fetchSessionDetail } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DetailPanel, PanelSection } from "../../components/ui/DetailPanel";
import { useToast } from "../../components/ui/Toast";
import { getLoadErrorMessage } from "./sessionErrors";
import { SessionParticipantsEditor } from "./SessionParticipantsEditor";
import {
  DangerSection,
  formatSessionSubtitle,
  PanelStatus,
  SessionPanelTitle,
} from "./SessionPanelParts";
import { SkipAutoRegularDialog } from "./SkipAutoRegularDialog";
import { TournamentBracketSection } from "./TournamentBracketSection";

/** 오늘·미래 세션 패널. 모든 세션을 고칠 수 있고, 자동 정기 세션은 '정기 쉬는 날로 지정', 그 밖의 세션은 삭제가 있다 */
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
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  const isRegular = session.kind === "regular";
  const isAutoRegular = isRegular && session.autoCreated;
  const isTournament = session.kind === "tournament";

  useEffect(() => {
    let canceled = false;
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
    // 수정으로 이름·날짜가 바뀌거나 대진이 바뀌면 다시 읽는다
  }, [session.id, session.updatedAt, detailReloadKey]);

  const handleParticipantsChanged = useCallback(
    (next: MatchSessionDetail) => {
      setDetail(next);
      onParticipantsChanged();
    },
    [onParticipantsChanged],
  );

  const handleBracketChanged = useCallback(() => {
    setDetailReloadKey((key) => key + 1);
    onParticipantsChanged();
  }, [onParticipantsChanged]);

  const participantIds = useMemo(
    () => detail?.participants.map((participant) => participant.id) ?? null,
    [detail],
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
    showToast(`'${session.name}' 세션을 지웠어요`);
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
              {isAutoRegular
                ? "자동으로 만든 정기 세션이라 종류를 바꿀 수 없어요."
                : "정기 세션 날짜와 시간은 고정이에요."}
            </span>
          )}
        </>
      }
      onClose={onClose}
    >
      <Button variant="soft" size="sm" onClick={() => onEdit(session)}>
        {isAutoRegular
          ? "이름·장소 수정"
          : isRegular
            ? "이름·종류·장소 수정"
            : "이름·종류·날짜·시간 수정"}
      </Button>

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

      {isTournament ? (
        <TournamentBracketSection
          sessionId={session.id}
          players={players}
          participantIds={participantIds}
          onChanged={handleBracketChanged}
        />
      ) : (
        <PanelSection title={`경기 ${matchCount}`}>
          <PanelStatus>경기는 회원 앱에서 시작·기록해요.</PanelStatus>
        </PanelSection>
      )}

      {isAutoRegular ? (
        <DangerSection
          title="정기 쉬는 날로 지정"
          description={`세션과 참여 신청 ${participantCount}명을 지우고 구글 캘린더 일정도 지워요. 이 날은 정기 쉬는 날로 남아요. 경기가 있으면 지정할 수 없어요.`}
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={hasMatches}
              onClick={() => setSkipConfirmOpen(true)}
            >
              정기 쉬는 날로 지정…
            </Button>
          }
        />
      ) : (
        <DangerSection
          title="세션 삭제"
          description="세션과 참여 신청을 지우고 구글 캘린더 일정도 지워요. 지워도 정기 쉬는 날이 새로 생기지 않아요. 경기가 있으면 지울 수 없어요."
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
        title={`'${session.name}' 세션을 지울까요?`}
        description={`참여 신청 ${participantCount}명이 함께 지워져요.`}
        confirmLabel="세션 삭제"
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
      <SkipAutoRegularDialog
        session={skipConfirmOpen ? session : null}
        participantCount={participantCount}
        onClose={() => setSkipConfirmOpen(false)}
        onDone={onDeleted}
      />
    </DetailPanel>
  );
};
