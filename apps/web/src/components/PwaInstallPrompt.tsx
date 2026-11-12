import React, { useEffect, useMemo, useReducer, useState } from "react";
import { IoShareOutline } from "react-icons/io5";
import { toKstDateKey } from "@pkpkdupr/shared/session";
import SystemToast from "@/components/SystemToast";
import { PkButton } from "@/components/ui/Button";
import { useIsSaveFailureNoticeVisible } from "@/context/SystemNoticeContext";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const isStandaloneDisplay = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  ("standalone" in window.navigator &&
    Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
    ));

const isLocalhost = () =>
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const isIosLike = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
  (window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1);

const isSafari = () => {
  const userAgent = window.navigator.userAgent;

  return (
    /safari/i.test(userAgent) &&
    !/crios|fxios|edgios|opios|chrome|android/i.test(userAgent)
  );
};

const isIosSafari = () => isIosLike() && isSafari();

const isAndroidLike = () => /android/i.test(window.navigator.userAgent);

const isMobileInstallTarget = () => isIosLike() || isAndroidLike();

// 닫거나 추가한 KST 날짜를 기억해 그날은 다시 띄우지 않는다
const INSTALL_PROMPT_DISMISSED_DATE_STORAGE_KEY =
  "pkpkdupr:install-prompt-dismissed-date";

const readInstallPromptDismissedDate = (): string | null => {
  try {
    return localStorage.getItem(INSTALL_PROMPT_DISMISSED_DATE_STORAGE_KEY);
  } catch {
    return null;
  }
};

const rememberInstallPromptDismissedDate = (dateKey: string) => {
  try {
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_DATE_STORAGE_KEY, dateKey);
  } catch {
    // 저장소를 쓸 수 없으면 이번 실행 동안만 닫힌다
  }
};

type InstallPromptKind = "ios-safari" | "installable";

interface PwaInstallPromptProps {
  /** 홈 탭이 보이고 그 위를 덮는 화면·메뉴가 없을 때 true */
  isActive: boolean;
}

const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({ isActive }) => {
  const isSaveFailureVisible = useIsSaveFailureNoticeVisible();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window === "undefined" ? false : isStandaloneDisplay(),
  );
  const [dismissedDateKey, setDismissedDateKey] = useState(() =>
    typeof window === "undefined" ? null : readInstallPromptDismissedDate(),
  );
  // 앱을 켜 둔 채 날짜가 바뀌어도 다시 보이게 화면으로 돌아올 때 다시 그려 오늘 날짜를 새로 읽는다
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  // iOS Safari에서 "추가"를 누르면 공유 메뉴 안내로 바뀐다
  const [isIosGuideOpen, setIsIosGuideOpen] = useState(false);

  const installPromptKind = useMemo<InstallPromptKind | null>(() => {
    if (typeof window === "undefined" || !isMobileInstallTarget()) {
      return null;
    }

    if (!window.isSecureContext && !isLocalhost()) {
      return null;
    }

    if (isIosSafari()) {
      return "ios-safari";
    }

    return deferredPrompt ? "installable" : null;
  }, [deferredPrompt]);

  useEffect(() => {
    setIsInstalled(isStandaloneDisplay());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") rerender();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const isDismissedToday = dismissedDateKey === toKstDateKey(new Date());
  const isVisible =
    isActive &&
    !isInstalled &&
    (!isDismissedToday || isIosGuideOpen) &&
    !!installPromptKind &&
    !isSaveFailureVisible;

  if (!isVisible) {
    return null;
  }

  const rememberDismissedToday = () => {
    const dateKey = toKstDateKey(new Date());
    rememberInstallPromptDismissedDate(dateKey);
    setDismissedDateKey(dateKey);
  };

  const dismiss = () => {
    rememberDismissedToday();
    setIsIosGuideOpen(false);
  };

  const handleAdd = async () => {
    rememberDismissedToday();

    if (installPromptKind === "ios-safari") {
      setIsIosGuideOpen(true);
      return;
    }

    if (!deferredPrompt) {
      return;
    }

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch (err) {
      console.error("Failed to show install prompt", err);
    }
    // 한 번 쓴 beforeinstallprompt 이벤트는 다시 prompt()할 수 없다
    setDeferredPrompt(null);
  };

  const closeButton = (
    <button
      type="button"
      aria-label="닫기"
      className="flex size-11 shrink-0 items-center justify-center text-xl text-pk-muted touch-manipulation"
      onClick={dismiss}
    >
      ×
    </button>
  );

  if (isIosGuideOpen) {
    return (
      <SystemToast className="z-30" actions={closeButton}>
        <span className="text-pk-13 font-semibold text-pk-sub">
          Safari 하단의{" "}
          <span
            className="inline-flex translate-y-0.5 items-center gap-0.5 rounded-md border border-border bg-white px-1 py-0.5 text-pk-primary"
            aria-label="공유하기 버튼"
            role="img"
          >
            <IoShareOutline className="size-3.5" />
            <span className="text-[10px] font-bold">공유</span>
          </span>{" "}
          버튼을 누른 뒤 [홈 화면에 추가]를 선택해주세요.
        </span>
      </SystemToast>
    );
  }

  return (
    <SystemToast
      className="z-30"
      actions={
        <>
          <PkButton
            size="md"
            onClick={() => void handleAdd()}
          >
            추가
          </PkButton>
          {closeButton}
        </>
      }
    >
      홈 화면에 추가하면 앱처럼 열려요
    </SystemToast>
  );
};

export default PwaInstallPrompt;
