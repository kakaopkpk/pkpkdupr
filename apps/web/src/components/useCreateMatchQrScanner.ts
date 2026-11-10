import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import type { VerifyPlayerQrTokenResponse } from "@pkpkdupr/shared/qr";
import { apiFetch } from "@/lib/api";
import { triggerHapticFeedback } from "@/lib/haptics";
import {
  getCameraErrorMessage,
  normalizeMatchMember,
  type MatchMember,
  type QrScannerStatus,
} from "./CreateMatchDrawerBody.utils";

interface UseCreateMatchQrScannerParams {
  isAuthenticated: boolean;
  isOnline?: boolean;
  selectedMatchMembersRef: React.RefObject<MatchMember[]>;
  onQrScannerOpenChange?: (isOpen: boolean) => void;
  closeQrScannerRequestKey?: number;
}

const MAX_MATCH_MEMBER_COUNT = 4;

const useCreateMatchQrScanner = ({
  isAuthenticated,
  isOnline = true,
  selectedMatchMembersRef,
  onQrScannerOpenChange,
  closeQrScannerRequestKey = 0,
}: UseCreateMatchQrScannerParams) => {
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [qrScannerStatus, setQrScannerStatus] =
    useState<QrScannerStatus>("idle");
  const [qrScannerError, setQrScannerError] = useState<string | null>(null);
  const [pendingQrMember, setPendingQrMember] = useState<MatchMember | null>(
    null,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const lastScannedPayloadRef = useRef<string | null>(null);
  const lastHandledCloseQrScannerRequestKeyRef = useRef(0);

  const stopQrScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;

    const video = videoRef.current;
    if (video) {
      const stream = video.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  const closeQrScanner = useCallback(() => {
    stopQrScanner();
    onQrScannerOpenChange?.(false);
    setIsQrScannerOpen(false);
    setQrScannerStatus("idle");
    setQrScannerError(null);
    setPendingQrMember(null);
    lastScannedPayloadRef.current = null;
  }, [onQrScannerOpenChange, stopQrScanner]);

  const showQrScannerError = useCallback((message: string) => {
    setQrScannerStatus("error");
    setQrScannerError(message);
    setPendingQrMember(null);
    lastScannedPayloadRef.current = null;
  }, []);

  const verifyScannedQrPayload = useCallback(
    async (payload: string) => {
      if (!isAuthenticated) {
        showQrScannerError("로그인이 필요해요.");
        return;
      }
      if (!isOnline) {
        showQrScannerError(
          "오프라인에서는 QR 코드를 검증할 수 없습니다. 온라인 연결이 필요합니다.",
        );
        return;
      }

      if (selectedMatchMembersRef.current.length >= MAX_MATCH_MEMBER_COUNT) {
        showQrScannerError("매치 멤버는 최대 4명까지 추가할 수 있어요.");
        return;
      }

      try {
        setQrScannerStatus("verifying");
        setQrScannerError(null);
        setPendingQrMember(null);

        const res = await apiFetch("/api/player-qr-token/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ payload }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "QR 코드를 검증하지 못했어요.");
        }

        const data = (await res.json()) as VerifyPlayerQrTokenResponse;
        const nextMember = normalizeMatchMember(data.player);
        if (!nextMember) {
          throw new Error("유효한 멤버 정보가 아니에요.");
        }

        if (
          selectedMatchMembersRef.current.some(
            (member) => member.id === nextMember.id,
          )
        ) {
          showQrScannerError(
            `${nextMember.username}님은 이미 추가된 멤버예요.`,
          );
          return;
        }

        if (selectedMatchMembersRef.current.length >= MAX_MATCH_MEMBER_COUNT) {
          showQrScannerError("매치 멤버는 최대 4명까지 추가할 수 있어요.");
          return;
        }

        setPendingQrMember(nextMember);
        setQrScannerStatus("confirm");
      } catch (err) {
        showQrScannerError(
          err instanceof Error ? err.message : "QR 코드를 검증하지 못했어요.",
        );
      }
    },
    [isOnline, selectedMatchMembersRef, showQrScannerError, isAuthenticated],
  );

  useEffect(() => {
    if (!isQrScannerOpen || qrScannerStatus !== "scanning") {
      return;
    }

    let isCancelled = false;

    const startScanner = async () => {
      const video = videoRef.current;
      if (!video) {
        showQrScannerError("QR 스캐너 화면을 준비하지 못했어요.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        showQrScannerError("이 브라우저에서는 카메라 스캔을 사용할 수 없어요.");
        return;
      }

      try {
        stopQrScanner();
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 250,
          delayBetweenScanSuccess: 500,
        });

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result, _error, controls) => {
            if (!result || lastScannedPayloadRef.current) {
              return;
            }

            const payload = result.getText();
            if (!payload) {
              return;
            }

            lastScannedPayloadRef.current = payload;
            triggerHapticFeedback(40);
            controls.stop();
            scannerControlsRef.current = null;
            void verifyScannedQrPayload(payload);
          },
        );

        if (isCancelled) {
          controls.stop();
          return;
        }

        scannerControlsRef.current = controls;
      } catch (err) {
        if (!isCancelled) {
          showQrScannerError(getCameraErrorMessage(err));
        }
      }
    };

    void startScanner();

    return () => {
      isCancelled = true;
      stopQrScanner();
    };
  }, [
    isQrScannerOpen,
    qrScannerStatus,
    showQrScannerError,
    stopQrScanner,
    verifyScannedQrPayload,
  ]);

  useEffect(() => stopQrScanner, [stopQrScanner]);

  useEffect(
    () => () => {
      onQrScannerOpenChange?.(false);
    },
    [onQrScannerOpenChange],
  );

  useEffect(() => {
    if (
      !closeQrScannerRequestKey ||
      !isQrScannerOpen ||
      closeQrScannerRequestKey <=
        lastHandledCloseQrScannerRequestKeyRef.current
    ) {
      return;
    }

    lastHandledCloseQrScannerRequestKeyRef.current = closeQrScannerRequestKey;
    closeQrScanner();
  }, [closeQrScanner, closeQrScannerRequestKey, isQrScannerOpen]);

  const openQrScanner = useCallback(() => {
    if (!isAuthenticated || selectedMatchMembersRef.current.length >= MAX_MATCH_MEMBER_COUNT) {
      return;
    }

    stopQrScanner();
    lastHandledCloseQrScannerRequestKeyRef.current = closeQrScannerRequestKey;
    onQrScannerOpenChange?.(true);
    setIsQrScannerOpen(true);
    setQrScannerStatus("scanning");
    setQrScannerError(null);
    setPendingQrMember(null);
    lastScannedPayloadRef.current = null;
  }, [
    closeQrScannerRequestKey,
    onQrScannerOpenChange,
    selectedMatchMembersRef,
    stopQrScanner,
    isAuthenticated,
  ]);

  const retryQrScan = useCallback(() => {
    stopQrScanner();
    setQrScannerStatus("scanning");
    setQrScannerError(null);
    setPendingQrMember(null);
    lastScannedPayloadRef.current = null;
  }, [stopQrScanner]);

  return {
    videoRef,
    isQrScannerOpen,
    qrScannerStatus,
    qrScannerError,
    pendingQrMember,
    openQrScanner,
    retryQrScan,
    closeQrScanner,
  };
};

export default useCreateMatchQrScanner;
