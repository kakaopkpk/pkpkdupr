import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { PkButton } from "./Button";
import { cx } from "./cx";

export interface ConfirmDialogProps {
  isOpen: boolean;
  /** false면 숨긴다(다른 탭을 보는 동안). 기본 true */
  isActive?: boolean;
  /** z-index. 띄운 시트보다 높아야 한다 */
  layer: number;
  title: string;
  /** 제목 아래 내용 */
  children?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  /** true면 두 버튼을 끄고 Esc·딤으로도 닫히지 않는다 */
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * 시트 위에 띄우는 가운데 확인 창. 바텀시트를 겹쳐 쌓지 않을 때 쓴다.
 * 열리면 취소 버튼에 포커스를 두고 Tab은 창 안에서만 돈다. Esc·딤 누르기는 취소와 같다.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  isActive = true,
  layer,
  title,
  children,
  cancelLabel = "취소",
  confirmLabel,
  isConfirming = false,
  onCancel,
  onConfirm,
}) => {
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 호출부가 매 렌더 새 콜백을 넘겨도 keydown 리스너를 다시 붙이지 않게 ref로 읽는다
  const onCancelRef = useRef(onCancel);
  const isVisible = isOpen && isActive;

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  // 열리면 취소 버튼으로 포커스를 옮기고, 닫히면 원래 포커스로 돌려준다
  useEffect(() => {
    if (!isVisible) return;
    const previousFocus = document.activeElement;
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isConfirming) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      // 뒤 시트로 포커스가 빠지지 않게 창 안의 누를 수 있는 요소 사이에서만 돈다
      event.preventDefault();
      const focusables = Array.from(
        sectionRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      );
      if (focusables.length === 0) return;
      const index = focusables.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const nextIndex =
        index === -1
          ? 0
          : (index + step + focusables.length) % focusables.length;
      focusables[nextIndex].focus({ preventScroll: true });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConfirming, isVisible]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 flex items-center justify-center",
        !isActive && "pointer-events-none invisible",
      )}
      style={{ zIndex: layer }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-pk-ink/45 animate-pk-fade-in motion-reduce:animate-none"
        onClick={() => {
          if (!isConfirming) onCancel();
        }}
      />
      <div className="app-shell-width pointer-events-none relative mx-auto flex w-full justify-center px-6">
        <section
          ref={sectionRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="pointer-events-auto flex w-full flex-col gap-4 rounded-pk-lg bg-white px-4 pt-6 pb-4 text-pk-ink shadow-[0_8px_24px] shadow-pk-ink/12 animate-pk-pop motion-reduce:animate-none"
        >
          <h2
            id={titleId}
            className="px-1 text-center text-pk-17 font-extrabold tracking-[-0.02em]"
          >
            {title}
          </h2>
          {children}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <PkButton
              ref={cancelRef}
              variant="soft"
              size="lg"
              disabled={isConfirming}
              onClick={onCancel}
            >
              {cancelLabel}
            </PkButton>
            <PkButton
              size="lg"
              fullWidth
              disabled={isConfirming}
              onClick={onConfirm}
            >
              {confirmLabel}
            </PkButton>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
};
