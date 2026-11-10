import React, { useEffect, useRef, useState } from "react";
import { Alert, Button } from "@heroui/react";
import { useLocation } from "react-router-dom";
import { useAppUpdate } from "@/context/AppUpdateContext";
import { useAuth } from "@/context/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const isStandaloneDisplay = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  ("standalone" in window.navigator &&
    Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
    ));

const FOREGROUND_UPDATE_CHECK_DEBOUNCE_MS = 5_000;

const PwaUpdatePrompt: React.FC = () => {
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const { isAuthenticated, isLoading } = useAuth();
  const {
    isUpdateAvailable,
    isCheckingForUpdate,
    isApplyingUpdate,
    checkForUpdate,
    applyUpdate,
  } = useAppUpdate();
  const lastAutoCheckAtRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const isFullWidthDevPage =
    import.meta.env.DEV && location.pathname === "/dev/qrs";
  const isStandalone =
    typeof window !== "undefined" ? isStandaloneDisplay() : false;

  useEffect(() => {
    const checkForAvailableUpdate = () => {
      if (
        !isStandalone ||
        isLoading ||
        !isAuthenticated ||
        isFullWidthDevPage ||
        !isOnline
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastAutoCheckAtRef.current < FOREGROUND_UPDATE_CHECK_DEBOUNCE_MS) {
        return;
      }

      lastAutoCheckAtRef.current = now;
      void checkForUpdate().catch((err) => {
        console.error("Failed to auto-check app update", err);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForAvailableUpdate();
      }
    };

    checkForAvailableUpdate();
    window.addEventListener("focus", checkForAvailableUpdate);
    window.addEventListener("pageshow", checkForAvailableUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", checkForAvailableUpdate);
      window.removeEventListener("pageshow", checkForAvailableUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    checkForUpdate,
    isAuthenticated,
    isFullWidthDevPage,
    isLoading,
    isOnline,
    isStandalone,
  ]);

  if (
    !isStandalone ||
    isLoading ||
    !isAuthenticated ||
    isFullWidthDevPage ||
    !isUpdateAvailable
  ) {
    return null;
  }

  const handleApplyUpdate = async () => {
    setError(null);

    try {
      await applyUpdate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "업데이트 적용에 실패했습니다.",
      );
    }
  };

  return (
    <div className="fixed bottom-[calc(5.47rem+var(--safe-bottom)+var(--app-keyboard-offset))] left-1/2 z-30 app-shell-width -translate-x-1/2 px-3">
      <Alert
        status="accent"
        className="items-center rounded-2xl border border-pkpk-primary-bg/20 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
      >
        <Alert.Indicator className="shrink-0 self-center" />
        <Alert.Content className="min-w-0 gap-0 self-center">
          <Alert.Title className="text-sm font-bold text-pkpk-sub-font">
            새 버전이 있어요.
          </Alert.Title>
          <Alert.Description className="text-xs font-semibold text-[#888]">
            {error ?? "업데이트 후 다시 불러올게요."}
          </Alert.Description>
        </Alert.Content>
        <Button
          size="sm"
          className="shrink-0 rounded-full bg-pkpk-primary-bg px-3 text-white"
          isDisabled={isCheckingForUpdate || isApplyingUpdate}
          onPress={() => void handleApplyUpdate()}
        >
          {isApplyingUpdate ? "업데이트 중..." : "업데이트"}
        </Button>
      </Alert>
    </div>
  );
};

export default PwaUpdatePrompt;
