import React, { useState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/authMessages";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PkButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Form";

interface PasswordChangeFormProps {
  /** 기본 "변경하기" */
  submitLabel?: string;
  /** 입력 검증을 통과한 새 비밀번호로 호출한다. 실패하면 Error를 던진다. */
  onSubmit: (newPassword: string) => Promise<void>;
  onSuccess?: () => void;
}

const PasswordChangeForm: React.FC<PasswordChangeFormProps> = ({
  submitLabel = "변경하기",
  onSubmit,
  onSuccess,
}) => {
  const isOnline = useOnlineStatus();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const newPasswordError =
    newPassword.length > 0 && newPassword.length < PASSWORD_MIN_LENGTH
      ? `새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`
      : null;
  const confirmPasswordError =
    confirmPassword.length > 0 && newPassword !== confirmPassword
      ? "새 비밀번호 확인이 일치하지 않습니다."
      : null;
  const validationMessage = newPasswordError || confirmPasswordError;
  const message = validationMessage || submitError;
  const isSubmitDisabled =
    isSubmitting ||
    !isOnline ||
    !newPassword ||
    !confirmPassword ||
    !!newPasswordError ||
    !!confirmPasswordError;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitDisabled) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      onSuccess?.();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "비밀번호를 변경하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // 부모가 세로 flex이면 남는 높이를 차지해 버튼이 아래쪽에 놓인다.
    <form onSubmit={handleSubmit} className="flex w-full flex-1 flex-col gap-3.5">
      {!isOnline ? (
        <div className="rounded-pk-sm bg-pk-primary-soft px-4 py-3 text-pk-13 text-pk-primary">
          비밀번호 변경은 온라인 연결이 필요합니다.
        </div>
      ) : null}

      <TextField
        label="새 비밀번호"
        type="password"
        placeholder={`${PASSWORD_MIN_LENGTH}자 이상`}
        autoComplete="new-password"
        value={newPassword}
        disabled={!isOnline || isSubmitting}
        error={!!newPasswordError}
        onChange={(event) => {
          setNewPassword(event.target.value);
          setSubmitError(null);
        }}
      />
      <TextField
        label="새 비밀번호 확인"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        disabled={!isOnline || isSubmitting}
        error={!!confirmPasswordError}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          setSubmitError(null);
        }}
      />

      {message ? (
        // 입력 중 바뀌는 검증 문구는 status로 두고, 제출 실패만 alert로 즉시 알린다.
        <p
          role={validationMessage ? "status" : "alert"}
          className="-mt-1 text-pk-13 font-bold text-pk-down"
        >
          {message}
        </p>
      ) : null}

      <PkButton
        type="submit"
        size="lg"
        fullWidth
        className="mt-auto"
        disabled={isSubmitDisabled}
      >
        {isSubmitting ? "변경 중..." : submitLabel}
      </PkButton>
    </form>
  );
};

export default PasswordChangeForm;
