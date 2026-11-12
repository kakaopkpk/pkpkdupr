import React, { useEffect, useRef } from "react";
import SystemToast from "@/components/SystemToast";
import { PkButton } from "@/components/ui/Button";
import { useAppUpdate } from "@/context/AppUpdateContext";
import { useAuth } from "@/context/AuthContext";
import { useIsSystemNoticeVisible } from "@/context/SystemNoticeContext";
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
  const isOnline = useOnlineStatus();
  const { isAuthenticated, isLoading } = useAuth();
  const {
    isUpdateAvailable,
    isCheckingForUpdate,
    isApplyingUpdate,
    checkForUpdate,
    applyUpdate,
  } = useAppUpdate();
  const isSystemNoticeVisible = useIsSystemNoticeVisible();
  const lastAutoCheckAtRef = useRef(0);

  const isStandalone =
    typeof window !== "undefined" ? isStandaloneDisplay() : false;

  useEffect(() => {
    const checkForAvailableUpdate = () => {
      if (
        !isStandalone ||
        isLoading ||
        !isAuthenticated ||
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
    isLoading,
    isOnline,
    isStandalone,
  ]);

  if (
    !isStandalone ||
    isLoading ||
    !isAuthenticated ||
    !isUpdateAvailable ||
    isSystemNoticeVisible
  ) {
    return null;
  }

  const handleApplyUpdate = async () => {
    try {
      await applyUpdate();
    } catch (err) {
      console.error("Failed to apply app update", err);
    }
  };

  return (
    <SystemToast
      className="z-30"
      actions={
        <PkButton
          size="md"
          disabled={isCheckingForUpdate || isApplyingUpdate}
          onClick={() => void handleApplyUpdate()}
        >
          업데이트
        </PkButton>
      }
    >
      새 버전이 있어요
    </SystemToast>
  );
};

export default PwaUpdatePrompt;
