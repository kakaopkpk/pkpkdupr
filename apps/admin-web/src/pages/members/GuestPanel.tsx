import React, { useState } from "react";
import { ADMIN_ISSUED_PASSWORD, isValidUsername } from "@pkpkdupr/shared/auth";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { promoteGuest } from "../../api/players";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { DetailPanel, PanelSection } from "../../components/ui/DetailPanel";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { useToast } from "../../components/ui/Toast";
import { formatGuestAddedSummary, runConfirmedAction, type Gender } from "./memberModel";
import {
  DeleteMemberSection,
  FieldHint,
  GenderControl,
  UsernameEditor,
  useConfirm,
  type PanelCallbacks,
} from "./panelParts";

export const GuestPanel: React.FC<{
  player: AdminPlayer;
  isSelf: boolean;
  topSlot: React.ReactNode;
  callbacks: PanelCallbacks;
  onClose: () => void;
}> = ({ player, isSelf, topSlot, callbacks, onClose }) => {
  const { showToast } = useToast();
  const { requestConfirm, confirmDialog } = useConfirm();
  const [genderDraft, setGenderDraft] = useState<Gender | "">(player.gender ?? "");

  // 승급은 저장된 아이디 기준이다. 입력칸에서 고친 아이디는 먼저 변경해야 반영된다
  const usernameReady = isValidUsername(player.username);
  const canPromote = genderDraft !== "" && usernameReady;

  const requestPromote = () => {
    if (!genderDraft) return;
    const gender = genderDraft;
    requestConfirm({
      title: "정회원으로 승급",
      description: `${player.username}를 정회원으로 승급할까요? 로그인 계정을 만들고 임시 비밀번호는 ${ADMIN_ISSUED_PASSWORD}예요.`,
      confirmLabel: "승급",
      onConfirm: () =>
        runConfirmedAction(async () => {
          await promoteGuest(player.id, { gender });
          showToast(`${player.username}를 정회원으로 승급했어요`);
          callbacks.onIssued("created");
          await callbacks.reload();
        }, showToast),
    });
  };

  return (
    <DetailPanel
      leading={<PlayerAvatar player={player} size={40} />}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{player.username}</span>
          <Chip>게스트</Chip>
        </span>
      }
      subtitle={formatGuestAddedSummary(player) ?? undefined}
      onClose={onClose}
    >
      {topSlot}

      <div className="rounded-pk-sm bg-pk-bg p-3.5">
        <p className="text-pk-13 font-bold text-pk-ink">
          {player.ratingExcludedMatchCount}경기 · 모두 평점 미반영
        </p>
        <p className="mt-1 text-pk-12 text-pk-sub">
          게스트가 낀 경기는 같은 경기 정회원 평점도 바꾸지 않아요. 승급해도 이{" "}
          {player.ratingExcludedMatchCount}경기는 계속 미반영이에요.
        </p>
      </div>

      <PanelSection title="아이디">
        <UsernameEditor
          player={player}
          buttonLabel="변경"
          hint="로그인 아이디 형식이 아니면 먼저 바꿔야 승급할 수 있어요."
          reload={callbacks.reload}
        />
      </PanelSection>

      <PanelSection title="성별 (승급에 필요)">
        <GenderControl value={genderDraft} onChange={setGenderDraft} />
      </PanelSection>

      <div>
        <Button className="w-full" disabled={!canPromote} onClick={requestPromote}>
          정회원으로 승급
        </Button>
        {!usernameReady ? (
          <FieldHint>아이디를 로그인 형식으로 바꾼 뒤 승급할 수 있어요.</FieldHint>
        ) : (
          !genderDraft && <FieldHint>성별을 고르면 승급할 수 있어요.</FieldHint>
        )}
      </div>

      <PanelSection title="회원 삭제">
        <DeleteMemberSection
          player={player}
          isSelf={isSelf}
          requestConfirm={requestConfirm}
          onDeleted={callbacks.onDeleted}
        />
      </PanelSection>

      {confirmDialog}
    </DetailPanel>
  );
};
