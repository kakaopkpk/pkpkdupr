import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TOAST_DURATION_MS = 4_000;

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** 결과 알림을 화면 아래 가운데에 띄운다. 새 알림이 오면 이전 것을 바꿔 마지막 것만 보인다. */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextIdRef = useRef(0);

  const showToast = useCallback((message: string) => {
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    setToast({ id, message });
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setToast((current) => (current?.id === id ? null : current));
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center"
        >
          {toast && (
            <div
              key={toast.id}
              className="max-w-[560px] rounded-pk-sm bg-pk-ink px-5 py-3 text-pk-15 font-semibold text-white"
            >
              {toast.message}
            </div>
          )}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};
