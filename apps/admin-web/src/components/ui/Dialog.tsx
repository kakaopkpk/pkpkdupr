import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 기본 440px */
  width?: number;
  /** true면 Esc·바깥 클릭으로 닫히지 않는다(진행 중 등) */
  dismissDisabled?: boolean;
  /** 열릴 때 포커스할 요소. 없으면 대화상자 안 첫 포커스 가능 요소 */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  title,
  onClose,
  children,
  footer,
  width = 440,
  dismissDisabled = false,
  initialFocusRef,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // 핸들러가 바뀌어도 열려 있는 동안 효과를 다시 돌리지 않도록 최신 값을 ref로 읽는다
  const onCloseRef = useRef(onClose);
  const dismissDisabledRef = useRef(dismissDisabled);
  onCloseRef.current = onClose;
  dismissDisabledRef.current = dismissDisabled;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const initial =
      initialFocusRef?.current ??
      panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      panel;
    initial?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!dismissDisabledRef.current) {
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      // 포커스를 대화상자 안에 가둔다
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pk-ink/40 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !dismissDisabled) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ width }}
        className="flex max-h-full max-w-full flex-col rounded-pk-lg bg-white outline-none"
      >
        <h2 id={titleId} className="px-6 pt-6 text-pk-17 font-bold text-pk-ink">
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-3 text-pk-15 text-pk-sub">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 pb-6">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
};
