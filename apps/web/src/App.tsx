import { Spinner } from "@heroui/react";
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import OfflineBanner from "./components/OfflineBanner";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import { AppUpdateProvider } from "./context/AppUpdateContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import DevQrs from "./pages/DevQrs";
import ForceChangePassword from "./pages/ForceChangePassword";
import Login from "./pages/Login";

const KEYBOARD_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

const isIosLike = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
  (window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1);

const isKeyboardInputElement = (
  element: Element | null | undefined,
): boolean => {
  if (!element) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }

  if (element instanceof HTMLInputElement) {
    const inputType = element.type.toLowerCase();
    return (
      KEYBOARD_INPUT_TYPES.has(inputType) && !element.readOnly && !element.disabled
    );
  }

  return (
    element instanceof HTMLElement &&
    element.isContentEditable &&
    element.getAttribute("contenteditable") !== "false"
  );
};

function AppRoutes() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden">
        <Spinner
          aria-label="앱 로딩 중"
          className="text-[#409eff]"
          color="current"
          size="md"
        />
      </div>
    );
  }

  if (status === "signedOut") {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (status === "mustChangePassword") {
    return (
      <Routes>
        <Route
          path="/force-change-password"
          element={<ForceChangePassword />}
        />
        <Route
          path="*"
          element={<Navigate to="/force-change-password" replace />}
        />
      </Routes>
    );
  }

  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/dev/qrs" element={<DevQrs />} />}
      <Route path="/" element={<BottomNav />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const location = useLocation();
  const isFullWidthDevPage =
    import.meta.env.DEV && location.pathname === "/dev/qrs";

  useEffect(() => {
    if (typeof window === "undefined" || !isIosLike()) {
      return;
    }

    const root = document.documentElement;
    const viewportMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    );
    const previousViewportContent = viewportMeta?.getAttribute("content");
    const listenerOptions = { capture: true, passive: false };
    const preventGestureZoom = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };
    const preventMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1 && event.cancelable) {
        event.preventDefault();
      }
    };

    root.dataset.iosViewportLocked = "true";
    if (viewportMeta) {
      viewportMeta.setAttribute(
        "content",
        `${previousViewportContent ?? ""}, minimum-scale=1, maximum-scale=1, user-scalable=no`,
      );
    }

    document.addEventListener(
      "gesturestart",
      preventGestureZoom,
      listenerOptions,
    );
    document.addEventListener(
      "gesturechange",
      preventGestureZoom,
      listenerOptions,
    );
    document.addEventListener("dblclick", preventGestureZoom, listenerOptions);
    document.addEventListener(
      "touchmove",
      preventMultiTouchZoom,
      listenerOptions,
    );

    return () => {
      document.removeEventListener("gesturestart", preventGestureZoom, true);
      document.removeEventListener("gesturechange", preventGestureZoom, true);
      document.removeEventListener("dblclick", preventGestureZoom, true);
      document.removeEventListener("touchmove", preventMultiTouchZoom, true);
      delete root.dataset.iosViewportLocked;

      if (viewportMeta) {
        if (previousViewportContent == null) {
          viewportMeta.removeAttribute("content");
        } else {
          viewportMeta.setAttribute("content", previousViewportContent);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let isKeyboardInputFocused = isKeyboardInputElement(document.activeElement);

    const updateViewportMetrics = () => {
      const visualViewport = window.visualViewport;
      const keyboardOffset = isKeyboardInputFocused
        ? Math.max(
            0,
            window.innerHeight -
              (visualViewport?.height ?? window.innerHeight) -
              (visualViewport?.offsetTop ?? 0),
          )
        : 0;

      document.documentElement.style.setProperty(
        "--app-keyboard-offset",
        `${Math.round(keyboardOffset)}px`,
      );
    };

    const syncKeyboardFocusState = () => {
      isKeyboardInputFocused = isKeyboardInputElement(document.activeElement);
      updateViewportMetrics();
    };

    const handleFocusOut = () => {
      window.requestAnimationFrame(syncKeyboardFocusState);
    };

    updateViewportMetrics();

    window.addEventListener("resize", updateViewportMetrics);
    window.addEventListener("focusin", syncKeyboardFocusState);
    window.addEventListener("focusout", handleFocusOut);
    window.visualViewport?.addEventListener("resize", updateViewportMetrics);
    window.visualViewport?.addEventListener("scroll", updateViewportMetrics);

    return () => {
      window.removeEventListener("resize", updateViewportMetrics);
      window.removeEventListener("focusin", syncKeyboardFocusState);
      window.removeEventListener("focusout", handleFocusOut);
      window.visualViewport?.removeEventListener("resize", updateViewportMetrics);
      window.visualViewport?.removeEventListener("scroll", updateViewportMetrics);
    };
  }, []);

  return (
    <div
      className={
        isFullWidthDevPage
          ? "h-full w-full min-w-[320px] overflow-hidden bg-amber-50"
          : "flex h-full w-full min-w-[320px] justify-center overflow-hidden bg-gray-900"
      }
    >
      <main
        className={
          isFullWidthDevPage
            ? "h-full w-full overflow-y-auto overflow-x-hidden"
            : "h-full w-full max-w-[480px] overflow-hidden bg-white shadow-none min-[481px]:shadow-lg"
        }
      >
        <AppUpdateProvider>
          <AuthProvider>
            <OfflineBanner />
            <PwaInstallPrompt />
            <PwaUpdatePrompt />
            <AppRoutes />
          </AuthProvider>
        </AppUpdateProvider>
      </main>
    </div>
  );
}

export default App;
