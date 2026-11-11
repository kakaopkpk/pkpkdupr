import React, { useState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/authMessages";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface PasswordChangeFormProps {
  submitLabel?: string;
  /** 입력 검증을 통과한 새 비밀번호로 호출한다. 실패하면 Error를 던진다. */
  onSubmit: (newPassword: string) => Promise<void>;
  onSuccess?: () => void;
  /** 어두운 그라데이션 배경(강제 변경 화면) 위에 놓일 때 */
  tone?: "light" | "dark";
}

const PasswordChangeForm: React.FC<PasswordChangeFormProps> = ({
  submitLabel = "변경",
  onSubmit,
  onSuccess,
  tone = "light",
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
  const message = newPasswordError || confirmPasswordError || submitError;
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

  const inputClassName =
    "app-mobile-input w-full rounded-xl border bg-white px-4 py-3 text-base outline-none";
  const messageClassName =
    tone === "dark"
      ? "rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
      : "text-sm text-error";

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      {!isOnline ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          비밀번호 변경은 온라인 연결이 필요합니다.
        </div>
      ) : null}

      <input
        type="password"
        placeholder={`새 비밀번호 (${PASSWORD_MIN_LENGTH}자 이상)`}
        autoComplete="new-password"
        value={newPassword}
        disabled={!isOnline || isSubmitting}
        onChange={(event) => {
          setNewPassword(event.target.value);
          setSubmitError(null);
        }}
        className={inputClassName}
      />
      <input
        type="password"
        placeholder="새 비밀번호 확인"
        autoComplete="new-password"
        value={confirmPassword}
        disabled={!isOnline || isSubmitting}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          setSubmitError(null);
        }}
        className={inputClassName}
      />

      {message ? <p className={messageClassName}>{message}</p> : null}

      <button
        type="submit"
        disabled={isSubmitDisabled}
        className="app-action-button w-full rounded-xl bg-pkpk-accent-bg py-3 font-semibold text-pkpk-dark shadow-sm transition-colors hover:bg-[#d7dc17] disabled:opacity-60"
      >
        {isSubmitting ? "변경 중..." : submitLabel}
      </button>
    </form>
  );
};

export default PasswordChangeForm;
