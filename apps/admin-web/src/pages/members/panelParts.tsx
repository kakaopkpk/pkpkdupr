import React, { useState } from "react";
import { ADMIN_ISSUED_PASSWORD, isValidUsername } from "@pkpkdupr/shared/auth";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { deletePlayer, resetPlayerPassword, updatePlayerUsername } from "../../api/players";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { InlineError } from "../../components/ui/InlineError";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { TextInput } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import {
  GENDER_LABEL,
  reportActionError,
  runConfirmedAction,
  type Gender,
  type IssuedKind,
} from "./memberModel";

export interface PanelCallbacks {
  /** 회원 목록·기록을 다시 읽는다. 실패해도 throw하지 않는다 */
  reload: () => Promise<void>;
  onIssued: (kind: IssuedKind) => void;
  onDeleted: (username: string) => void;
}

export interface ConfirmRequest {
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

/** 패널 하나에 확인 대화상자 하나. request를 넣으면 열린다 */
export const useConfirm = () => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const dialog = (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ""}
      description={request?.description}
      confirmLabel={request?.confirmLabel ?? ""}
      onConfirm={request?.onConfirm ?? (() => undefined)}
      onClose={() => setRequest(null)}
    />
  );
  return { requestConfirm: setRequest, confirmDialog: dialog };
};

export const FieldHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-1.5 text-pk-12 text-pk-muted">{children}</p>
);

const genderOptions = (["M", "F"] as const).map((value) => ({
  value,
  label: GENDER_LABEL[value],
}));

/** 남/여. value가 ""이면 아무것도 고르지 않은 상태다 */
export const GenderControl: React.FC<{
  value: Gender | "";
  onChange: (value: Gender) => void;
  ariaLabel?: string;
}> = ({ value, onChange, ariaLabel = "성별" }) => (
  <SegmentedControl<Gender | "">
    ariaLabel={ariaLabel}
    options={genderOptions}
    value={value}
    onChange={(next) => {
      if (next) onChange(next);
    }}
  />
);

/** 아이디 입력 + 변경 버튼. 값이 바뀌고 형식이 맞을 때만 버튼이 켜진다 */
export const UsernameEditor: React.FC<{
  player: AdminPlayer;
  buttonLabel: string;
  hint: string;
  reload: () => Promise<void>;
}> = ({ player, buttonLabel, hint, reload }) => {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(player.username);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const canSubmit = !pending && trimmed !== player.username && isValidUsername(trimmed);

  const handleSubmit = async () => {
    setPending(true);
    setError(null);
    try {
      const { player: updated } = await updatePlayerUsername(player.id, trimmed);
      setDraft(updated.username);
      showToast(`아이디를 ${updated.username}로 바꿨어요`);
      await reload();
    } catch (err) {
      reportActionError(err, setError, showToast);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) void handleSubmit();
        }}
      >
        <TextInput
          aria-label="아이디"
          value={draft}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
        <Button type="submit" variant="soft" disabled={!canSubmit}>
          {pending ? "바꾸는 중…" : buttonLabel}
        </Button>
      </form>
      {trimmed && !isValidUsername(trimmed) ? (
        <FieldHint>아이디 형식이 맞지 않아요. 영문·숫자·점(.)·밑줄(_)·하이픈(-)만 써요.</FieldHint>
      ) : (
        <FieldHint>{hint}</FieldHint>
      )}
      <div className="mt-1.5">
        <InlineError message={error} />
      </div>
    </div>
  );
};

/** 경기 기록이 없는 회원만 지울 수 있다. 관리자 자신은 지울 수 없다 */
/**
 * 비밀번호 초기화(계정이 없으면 로그인 계정 만들기) 줄. 확인을 받고 임시 비밀번호로 초기화한 뒤 발급 카드를 띄운다.
 * subject는 확인 문구의 주어와 조사("회원은"·"게스트는")다
 */
export const PasswordResetRow: React.FC<{
  player: AdminPlayer;
  subject: string;
  disabled: boolean;
  requestConfirm: (request: ConfirmRequest) => void;
  callbacks: PanelCallbacks;
}> = ({ player, subject, disabled, requestConfirm, callbacks }) => {
  const { showToast } = useToast();
  const label = player.hasLoginAccount ? "비밀번호 초기화" : "로그인 계정 만들기";

  const requestReset = () =>
    requestConfirm({
      title: label,
      description: player.hasLoginAccount
        ? `${player.username} 비밀번호를 ${ADMIN_ISSUED_PASSWORD}로 초기화할까요? ${subject} 다음 로그인 때 비밀번호를 새로 정해요.`
        : `${player.username} 로그인 계정을 만들까요? 임시 비밀번호는 ${ADMIN_ISSUED_PASSWORD}이고, ${subject} 첫 로그인 때 비밀번호를 새로 정해요.`,
      confirmLabel: player.hasLoginAccount ? "초기화" : "만들기",
      onConfirm: () =>
        runConfirmedAction(async () => {
          await resetPlayerPassword(player.id);
          showToast(
            player.hasLoginAccount
              ? `${player.username} 비밀번호를 초기화했어요`
              : `${player.username} 로그인 계정을 만들었어요`,
          );
          callbacks.onIssued(player.hasLoginAccount ? "reset" : "created");
          await callbacks.reload();
        }, showToast),
    });

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-pk-13 text-pk-sub">
        {player.hasLoginAccount ? "비밀번호를 잃어버렸을 때" : "로그인 계정이 없어요"}
      </span>
      <Button variant="outline" disabled={disabled} onClick={requestReset}>
        {label}
      </Button>
    </div>
  );
};

export const DeleteMemberSection: React.FC<{
  player: AdminPlayer;
  isSelf: boolean;
  requestConfirm: (request: ConfirmRequest) => void;
  onDeleted: (username: string) => void;
}> = ({ player, isSelf, requestConfirm, onDeleted }) => {
  const { showToast } = useToast();
  const hasMatches = player.matchCount > 0;
  const disabledReason = hasMatches
    ? "경기 기록이 있어 지울 수 없어요. 비활성으로 바꾸세요."
    : isSelf
      ? "내 계정은 지울 수 없어요."
      : null;

  return (
    <div>
      <Button
        variant="outline"
        disabled={disabledReason !== null}
        onClick={() =>
          requestConfirm({
            title: "회원 삭제",
            description: `${player.username}를 지울까요? 로그인 계정과 세션 참여 신청도 함께 지워지고 되돌릴 수 없어요.`,
            confirmLabel: "삭제",
            onConfirm: () =>
              runConfirmedAction(async () => {
                await deletePlayer(player.id);
                onDeleted(player.username);
              }, showToast),
          })
        }
      >
        회원 삭제…
      </Button>
      {disabledReason && <FieldHint>{disabledReason}</FieldHint>}
    </div>
  );
};
