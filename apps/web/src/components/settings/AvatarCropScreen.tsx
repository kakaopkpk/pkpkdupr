import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PkButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { cropAvatarImage } from "@/utils/avatar";
import {
  type AvatarCropView,
  type AvatarImageSize,
  clampAvatarCropView,
  getAvatarCropSourceRect,
  getDisplayedImageSize,
  INITIAL_AVATAR_CROP_VIEW,
  isInitialAvatarCropView,
  zoomAvatarCropViewAt,
} from "@/utils/avatarCrop";

export interface AvatarCropScreenProps {
  isOpen: boolean;
  /** false면 숨긴다(다른 탭을 보는 동안) */
  isActive: boolean;
  /** z-index */
  layer: number;
  /** 고른 사진의 object URL. 바뀌면 처음 상태로 돌아간다 */
  sourceUrl: string | null;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onPickAgain: () => void;
  /** 사진을 읽거나 자르지 못했을 때 */
  onError: (message: string) => void;
  /** 원 안 영역을 자른 JPEG data URL */
  onConfirm: (dataUrl: string) => void;
}

/** 조정 영역 가장자리와 원 사이 여백(px)과 원 지름 상한(px) */
const CIRCLE_MARGIN_PX = 24;
const CIRCLE_MAX_DIAMETER_PX = 280;
/** 두 번 탭 판정: 두 탭 사이 시간(ms)과 거리(px) */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;
const DOUBLE_TAP_SCALE = 2;
/** 트랙패드 핀치(ctrl+wheel) 한 칸이 바꾸는 크기 비율 */
const WHEEL_ZOOM_SENSITIVITY = 0.01;

interface PointerPoint {
  x: number;
  y: number;
}

const getMidpoint = (points: PointerPoint[]): PointerPoint => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

const getDistance = (a: PointerPoint, b: PointerPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 고른 사진을 원 안에 맞추는 전체 화면. 한 손가락으로 옮기고 두 손가락 핀치(1~4배)로 크기를 바꾸며,
 * 두 번 탭하면 2배와 처음 크기를 오간다. "이 사진으로 변경"을 눌러야 원 안 영역을 잘라 넘긴다.
 */
const AvatarCropScreen: React.FC<AvatarCropScreenProps> = ({
  isOpen,
  isActive,
  layer,
  sourceUrl,
  error,
  isSaving,
  onCancel,
  onPickAgain,
  onError,
  onConfirm,
}) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<AvatarImageSize | null>(null);
  const [view, setView] = useState<AvatarCropView>(INITIAL_AVATAR_CROP_VIEW);
  const [isDragging, setIsDragging] = useState(false);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const gestureRef = useRef<{ mid: PointerPoint; distance: number } | null>(null);
  const lastTapRef = useRef<{ time: number; point: PointerPoint } | null>(null);
  const isVisible = isOpen && isActive;

  const diameter = Math.max(
    0,
    Math.min(
      areaSize.width - CIRCLE_MARGIN_PX * 2,
      areaSize.height - CIRCLE_MARGIN_PX * 2,
      CIRCLE_MAX_DIAMETER_PX,
    ),
  );

  // 다른 사진을 고르면 처음 상태에서 다시 시작한다
  useEffect(() => {
    setImageSize(null);
    setView(INITIAL_AVATAR_CROP_VIEW);
  }, [sourceUrl]);

  // 손가락이 닿은 채 닫히면 pointerup이 오지 않으므로, 닫힐 때 제스처 상태를 비운다
  useEffect(() => {
    if (isVisible) return;
    pointersRef.current.clear();
    gestureRef.current = null;
    lastTapRef.current = null;
    setIsDragging(false);
  }, [isVisible]);

  useEffect(() => {
    const area = areaRef.current;
    if (!isOpen || !area) return;
    const observer = new ResizeObserver(([entry]) => {
      setAreaSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [isOpen]);

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

  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        event.preventDefault();
        onCancelRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, isVisible]);

  /** 조정 영역 안 화면 좌표를 원 중심 기준 원 지름 단위로 바꾼다 */
  const toCircleUnits = useCallback(
    (clientX: number, clientY: number): PointerPoint => {
      const rect = areaRef.current?.getBoundingClientRect();
      if (!rect || diameter <= 0) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - rect.width / 2) / diameter,
        y: (clientY - rect.top - rect.height / 2) / diameter,
      };
    },
    [diameter],
  );

  // 데스크톱 트랙패드 핀치는 ctrl+wheel로 들어온다. 일반 스크롤은 확대에 쓰지 않는다
  useEffect(() => {
    const area = areaRef.current;
    if (!isOpen || !area || !imageSize) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const focal = toCircleUnits(event.clientX, event.clientY);
      setView((current) =>
        zoomAvatarCropViewAt(
          current,
          current.scale * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
          focal,
          imageSize,
        ),
      );
    };
    area.addEventListener("wheel", handleWheel, { passive: false });
    return () => area.removeEventListener("wheel", handleWheel);
  }, [imageSize, isOpen, toCircleUnits]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSize || isSaving) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 이미 끝난 포인터면 캡처 없이 이어 간다
    }
    const point = toCircleUnits(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, point);
    gestureRef.current = null;
    setIsDragging(true);

    if (pointersRef.current.size !== 1) return;
    const now = performance.now();
    const lastTap = lastTapRef.current;
    if (
      lastTap &&
      now - lastTap.time < DOUBLE_TAP_MS &&
      getDistance(lastTap.point, point) * diameter < DOUBLE_TAP_SLOP_PX
    ) {
      lastTapRef.current = null;
      setView((current) =>
        current.scale < DOUBLE_TAP_SCALE - 0.05
          ? zoomAvatarCropViewAt(current, DOUBLE_TAP_SCALE, point, imageSize)
          : INITIAL_AVATAR_CROP_VIEW,
      );
      return;
    }
    lastTapRef.current = { time: now, point };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSize || !pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(
      event.pointerId,
      toCircleUnits(event.clientX, event.clientY),
    );
    const points = [...pointersRef.current.values()];
    const mid = getMidpoint(points);
    const distance = points.length >= 2 ? getDistance(points[0], points[1]) : 0;
    const previous = gestureRef.current;
    gestureRef.current = { mid, distance };
    if (!previous) return;

    setView((current) => {
      const moved = {
        ...current,
        x: current.x + mid.x - previous.mid.x,
        y: current.y + mid.y - previous.mid.y,
      };
      if (points.length < 2 || previous.distance <= 0) {
        return clampAvatarCropView(moved, imageSize);
      }
      return zoomAvatarCropViewAt(
        moved,
        moved.scale * (distance / previous.distance),
        mid,
        imageSize,
      );
    });
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    // 손가락 수가 바뀌면 남은 손가락 기준으로 다시 잡는다
    gestureRef.current = null;
    if (pointersRef.current.size === 0) setIsDragging(false);
  };

  const confirm = () => {
    const image = imageRef.current;
    if (!image || !imageSize || isSaving) return;
    try {
      onConfirm(
        cropAvatarImage(image, getAvatarCropSourceRect(view, imageSize)),
      );
    } catch (cropError) {
      onError(
        cropError instanceof Error
          ? cropError.message
          : "이미지를 처리하지 못했습니다.",
      );
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  const displayed = imageSize ? getDisplayedImageSize(imageSize, view.scale) : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="프로필 사진 이동 및 크기 조절"
      className={cx(
        "fixed inset-0 bg-pk-ink text-white animate-pk-fade-in motion-reduce:animate-none",
        !isActive && "pointer-events-none invisible",
      )}
      style={{ zIndex: layer }}
    >
      <div className="app-shell-width mx-auto flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[calc(16px+env(safe-area-inset-bottom))]">
        <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            className="justify-self-start px-3 py-2 text-pk-15 font-bold disabled:opacity-40"
          >
            취소
          </button>
          <h2 className="text-pk-15 font-extrabold">이동 및 크기 조절</h2>
          <button
            type="button"
            disabled={isSaving || !imageSize || isInitialAvatarCropView(view)}
            onClick={() => setView(INITIAL_AVATAR_CROP_VIEW)}
            className="justify-self-end px-3 py-2 text-pk-15 font-bold text-pk-primary-line disabled:opacity-40"
          >
            원래대로
          </button>
        </header>

        <div
          ref={areaRef}
          className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {sourceUrl ? (
            <img
              key={sourceUrl}
              ref={imageRef}
              src={sourceUrl}
              alt="고른 사진"
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (!naturalWidth || !naturalHeight) {
                  onError("이미지 크기를 확인하지 못했습니다.");
                  return;
                }
                setImageSize({ width: naturalWidth, height: naturalHeight });
              }}
              onError={() => onError("이미지를 읽지 못했습니다.")}
              className={cx(
                "pointer-events-none absolute top-1/2 left-1/2 max-w-none",
                !displayed && "invisible",
              )}
              style={
                displayed
                  ? {
                      width: displayed.width * diameter,
                      height: displayed.height * diameter,
                      transform: `translate(calc(-50% + ${view.x * diameter}px), calc(-50% + ${view.y * diameter}px))`,
                    }
                  : undefined
              }
            />
          ) : null}
          {diameter > 0 ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full shadow-[0_0_0_9999px] shadow-pk-ink/65 ring-2 ring-white/85 ring-inset"
              style={{ width: diameter, height: diameter }}
            >
              {/* 끄는 동안만 3등분 안내선 */}
              <div
                className={cx(
                  "absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none",
                  isDragging ? "opacity-100" : "opacity-0",
                )}
              >
                <span className="absolute inset-y-0 left-1/3 w-px bg-white/45" />
                <span className="absolute inset-y-0 left-2/3 w-px bg-white/45" />
                <span className="absolute inset-x-0 top-1/3 h-px bg-white/45" />
                <span className="absolute inset-x-0 top-2/3 h-px bg-white/45" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 px-4 pt-3">
          {error ? (
            // 어두운 바탕에서도 읽히게 흰 바탕 위에 빨강 글자로 둔다
            <p
              role="alert"
              className="rounded-pk-sm bg-white px-3 py-2 text-pk-13 font-bold text-pk-down"
            >
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <PkButton
              variant="soft"
              size="lg"
              disabled={isSaving}
              onClick={onPickAgain}
            >
              다시 고르기
            </PkButton>
            <PkButton
              size="lg"
              className="flex-1"
              disabled={!imageSize || isSaving}
              onClick={confirm}
            >
              {isSaving ? "변경 중..." : "이 사진으로 변경"}
            </PkButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AvatarCropScreen;
