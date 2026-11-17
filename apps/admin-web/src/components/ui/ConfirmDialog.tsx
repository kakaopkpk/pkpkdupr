import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { InlineError } from "./InlineError";

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "처리하지 못했어요. 다시 시도해 주세요.";

/**
 * 확인 버튼을 누르면 onConfirm이 끝날 때까지 두 버튼을 잠근다.
 * onConfirm이 throw하면 닫지 않고 그 메시지를 대화상자 안에 보인다. 성공하면 onClose를 부른다.
 */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  cancelLabel?: string;
}> = ({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  cancelLabel = "취소",
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setPending(false);
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      onClose();
    } catch (err) {
      setPending(false);
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      dismissDisabled={pending}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="soft" disabled={pending} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button disabled={pending} onClick={() => void handleConfirm()}>
            {pending ? "처리 중…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {description && <div>{description}</div>}
        <InlineError message={error} />
      </div>
    </Dialog>
  );
};
