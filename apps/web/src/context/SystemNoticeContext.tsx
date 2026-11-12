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

export interface SaveFailureNoticeOptions {
  /**
   * "다시 시도"를 누르면 실행. 정상 종료(resolve)하면 토스트가 닫힌다.
   * 실패는 throw(reject)로 알려야 하며, 그러면 토스트가 남아 다시 시도할 수 있다.
   */
  onRetry: () => void | Promise<void>;
}

/**
 * 저장 실패 알림. 네트워크 오류(fetch 자체 실패·오프라인)에만 쓴다.
 * 서버가 돌려준 4xx·5xx 오류는 각 화면이 인라인으로 보인다.
 */
export interface SystemNoticeContextValue {
  showSaveFailure: (options: SaveFailureNoticeOptions) => void;
}

const SystemNoticeContext = createContext<SystemNoticeContextValue | null>(
  null,
);

/** 하단 토스트 우선순위(저장 실패 > 업데이트 > 홈 화면 추가) 판단용 */
const SaveFailureVisibleContext = createContext(false);

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

  const showSaveFailure = useCallback((options: SaveFailureNoticeOptions) => {
    saveFailureRef.current = options;
    setSaveFailure(options);
    setIdleTimerKey((key) => key + 1);
  }, []);

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
    () => ({ showSaveFailure }),
    [showSaveFailure],
  );

  return (
    <SystemNoticeContext.Provider value={value}>
      <SaveFailureVisibleContext.Provider value={saveFailure !== null}>
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
        ) : null}
      </SaveFailureVisibleContext.Provider>
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

export const useIsSaveFailureNoticeVisible = () =>
  useContext(SaveFailureVisibleContext);
