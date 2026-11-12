import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SystemToast from "@/components/SystemToast";
import { PkButton } from "@/components/ui/Button";

const SAVE_FAILURE_IDLE_DISMISS_MS = 10_000;
const TOAST_DEFAULT_DURATION_MS = 5_000;

export interface SaveFailureNoticeOptions {
  /**
   * "다시 시도"를 누르면 실행. 정상 종료(resolve)하면 토스트가 닫힌다.
   * 실패는 throw(reject)로 알려야 하며, 그러면 토스트가 남아 다시 시도할 수 있다.
   */
  onRetry: () => void | Promise<void>;
}

export interface ToastOptions {
  message: string;
  /** 오른쪽 파란 동작 글자. 누르면 토스트를 닫고 onAction을 부른다 */
  actionLabel?: string;
  onAction?: () => void;
  /** 기본 5000 */
  durationMs?: number;
}

export interface SystemNoticeContextValue {
  /**
   * 저장 실패 알림. 네트워크 오류(fetch 자체 실패·오프라인)에만 쓴다.
   * 서버가 돌려준 4xx·5xx 오류는 각 화면이 인라인으로 보인다.
   */
  showSaveFailure: (options: SaveFailureNoticeOptions) => void;
  /** 하단 바 위 알약 토스트. 새로 띄우면 이전 토스트를 바꾼다. 저장 실패 알림이 떠 있는 동안은 가려진다 */
  showToast: (options: ToastOptions) => void;
}

const SystemNoticeContext = createContext<SystemNoticeContextValue | null>(
  null,
);

/** 하단 토스트 우선순위(저장 실패·일반 토스트 > 업데이트 > 홈 화면 추가) 판단용 */
const SystemNoticeVisibleContext = createContext(false);

export const SystemNoticeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [saveFailure, setSaveFailure] =
    useState<SaveFailureNoticeOptions | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  // 실패가 다시 오거나 재시도가 끝날 때마다 바뀌어 10초 무동작 타이머를 다시 건다
  const [idleTimerKey, setIdleTimerKey] = useState(0);
  // 재시도 중 새 실패가 와서 교체됐으면 이전 재시도 결과로 닫지 않는다
  const saveFailureRef = useRef<SaveFailureNoticeOptions | null>(null);
  // id는 같은 내용을 다시 띄워도 표시 시간을 새로 세기 위해 쓴다
  const [toast, setToast] = useState<
    (ToastOptions & { id: number }) | null
  >(null);
  const toastIdRef = useRef(0);

  const showSaveFailure = useCallback((options: SaveFailureNoticeOptions) => {
    saveFailureRef.current = options;
    setSaveFailure(options);
    setIdleTimerKey((key) => key + 1);
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    toastIdRef.current += 1;
    setToast({ ...options, id: toastIdRef.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const toastId = toast.id;
    const timeoutId = window.setTimeout(
      () =>
        setToast((current) => (current?.id === toastId ? null : current)),
      toast.durationMs ?? TOAST_DEFAULT_DURATION_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const handleToastAction = () => {
    const onAction = toast?.onAction;
    setToast(null);
    onAction?.();
  };

  useEffect(() => {
    if (!saveFailure || isRetrying) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveFailureRef.current = null;
      setSaveFailure(null);
    }, SAVE_FAILURE_IDLE_DISMISS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [idleTimerKey, isRetrying, saveFailure]);

  const handleRetry = async () => {
    const current = saveFailureRef.current;
    if (!current || isRetrying) {
      return;
    }

    setIsRetrying(true);
    try {
      await current.onRetry();
      if (saveFailureRef.current === current) {
        saveFailureRef.current = null;
        setSaveFailure(null);
      }
    } catch (err) {
      console.error("Failed to retry save", err);
    } finally {
      setIsRetrying(false);
      setIdleTimerKey((key) => key + 1);
    }
  };

  const value = useMemo<SystemNoticeContextValue>(
    () => ({ showSaveFailure, showToast }),
    [showSaveFailure, showToast],
  );

  return (
    <SystemNoticeContext.Provider value={value}>
      <SystemNoticeVisibleContext.Provider
        value={saveFailure !== null || toast !== null}
      >
        {children}
        {saveFailure ? (
          // 열린 바텀시트·드로어(layer 50~80)보다 위
          <SystemToast
            className="z-[1000]"
            actions={
              <PkButton
                size="md"
                variant="soft"
                disabled={isRetrying}
                onClick={() => void handleRetry()}
              >
                다시 시도
              </PkButton>
            }
          >
            저장하지 못했어요
          </SystemToast>
        ) : toast ? (
          <SystemToast
            key={toast.id}
            variant="pill"
            className="z-[1000]"
            actions={
              toast.actionLabel ? (
                <button
                  type="button"
                  onClick={handleToastAction}
                  className="h-11 shrink-0 rounded-full px-3 text-pk-15 font-extrabold text-pk-primary active:opacity-70"
                >
                  {toast.actionLabel}
                </button>
              ) : null
            }
          >
            {toast.message}
          </SystemToast>
        ) : null}
      </SystemNoticeVisibleContext.Provider>
    </SystemNoticeContext.Provider>
  );
};

export const useSystemNotice = (): SystemNoticeContextValue => {
  const context = useContext(SystemNoticeContext);
  if (!context) {
    throw new Error("useSystemNotice must be used within SystemNoticeProvider");
  }
  return context;
};

/** 저장 실패 알림이나 일반 토스트가 떠 있으면 true. 다른 하단 토스트는 그동안 숨는다 */
export const useIsSystemNoticeVisible = () =>
  useContext(SystemNoticeVisibleContext);
