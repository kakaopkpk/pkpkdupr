import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import { useDimmedThemeColor } from "@/lib/themeColor";

/** 확대한 사진 원의 지름(px) */
export const AVATAR_ZOOM_SIZE = 240;
const TRANSITION_MS = 280;
const TRANSITION = `transform ${TRANSITION_MS}ms var(--ease-pk-move)`;
/** 아래로 이만큼 넘게 끌고 놓으면 닫는다 */
const DISMISS_DRAG_PX = 80;
/** 이만큼 움직이기 전까지는 누르기로 본다 */
const DRAG_START_PX = 4;
/** 끄는 거리에 따른 축소·옅어짐은 이 거리에서 멈춘다 */
const DRAG_EFFECT_MAX_PX = 200;

interface AvatarZoomViewerProps {
  /** 셸 깊이 기준으로 열려 있는지. false가 되면 원래 아바타 자리로 줄어들며 닫힌다 */
  isOpen: boolean;
  imageUrl: string;
  username: string;
  /** 커지기 시작하고 줄어들어 돌아갈 아바타 */
  originRef: React.RefObject<HTMLElement | null>;
  /** 누르기·끌어 내리기·Escape로 닫아 달라고 할 때 */
  onRequestClose: () => void;
  /** 닫힘 전환이 끝나 화면에서 사라졌을 때 */
  onExited: () => void;
}

type Phase = "hidden" | "opening" | "open" | "closing";

/** 화면 가운데 원을 rect 자리·크기로 옮기는 transform */
const getTransformTo = (rect: DOMRect | undefined) => {
  if (!rect) return "scale(0.2)";
  const left = (window.innerWidth - AVATAR_ZOOM_SIZE) / 2;
  const top = (window.innerHeight - AVATAR_ZOOM_SIZE) / 2;
  const scale = rect.width / AVATAR_ZOOM_SIZE;
  return `translate(${rect.left - left}px, ${rect.top - top}px) scale(${scale})`;
};

/** 사진 원의 transform과 딤의 opacity를 함께 바꾼다. animate가 false면 바로 옮긴다 */
const applyPose = (
  photo: HTMLElement,
  dim: HTMLElement,
  transform: string,
  opacity: number,
  animate: boolean,
) => {
  photo.style.transition = animate ? TRANSITION : "none";
  photo.style.transform = transform;
  dim.style.transition = animate
    ? `opacity ${TRANSITION_MS}ms var(--ease-pk-move)`
    : "none";
  dim.style.opacity = String(opacity);
};

/**
 * 프로필 사진 확대 보기. 아바타 자리에서 화면 가운데 240px 원으로 커지고, 뒤 화면은 어둡고 흐려진다.
 * 어디든 누르기·아래로 끌어 내리기·Escape·기기 뒤로가기(연 쪽의 useLayerDepth)로 닫는다.
 * 매 프레임 렌더를 피하려고 이동·끌기 스타일은 DOM에 직접 쓴다.
 */
const AvatarZoomViewer: React.FC<AvatarZoomViewerProps> = ({
  isOpen,
  imageUrl,
  username,
  originRef,
  onRequestClose,
  onExited,
}) => {
  const [phase, setPhase] = useState<Phase>("hidden");
  const dialogRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    offset: number;
    isDragging: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const onRequestCloseRef = useRef(onRequestClose);
  const onExitedRef = useRef(onExited);

  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
    onExitedRef.current = onExited;
  }, [onExited, onRequestClose]);

  // 딤(bg-pk-ink/42)과 같은 투명도. 닫히며 줄어드는 동안은 바로 걷는다
  useDimmedThemeColor(phase === "opening" || phase === "open", 0.42);

  const finishClose = useCallback(() => {
    setPhase("hidden");
    onExitedRef.current();
  }, []);

  // 열림: 아바타 자리에 두고 다음 프레임에 가운데로 옮긴다
  useLayoutEffect(() => {
    if (!isOpen) return;
    setPhase("opening");
  }, [isOpen]);

  useLayoutEffect(() => {
    const photo = photoRef.current;
    const dim = dimRef.current;
    if (!photo || !dim) return;

    if (phase !== "opening") return;
    if (!prefersReducedMotion()) {
      const origin = getTransformTo(
        originRef.current?.getBoundingClientRect(),
      );
      applyPose(photo, dim, origin, 0, false);
      // 시작 위치를 그린 뒤 전환을 켜야 커지는 움직임이 보인다
      photo.getBoundingClientRect();
    }
    applyPose(photo, dim, "none", 1, !prefersReducedMotion());
    setPhase("open");
  }, [originRef, phase]);

  // 닫힘: 원래 아바타 자리로 줄어든 뒤 사라진다
  useEffect(() => {
    if (isOpen || phase === "hidden" || phase === "closing") return;
    const photo = photoRef.current;
    const dim = dimRef.current;
    if (!photo || !dim || prefersReducedMotion()) {
      finishClose();
      return;
    }
    setPhase("closing");
    const origin = getTransformTo(originRef.current?.getBoundingClientRect());
    applyPose(photo, dim, origin, 0, true);
    const timer = window.setTimeout(finishClose, TRANSITION_MS);
    return () => window.clearTimeout(timer);
    // phase가 closing으로 바뀌어도 타이머는 유지해야 하므로 phase 변화로 정리하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (phase !== "open") return;
    dialogRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onRequestCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (phase !== "open") return;
    suppressClickRef.current = false;
    // 화면 밖에서 손을 떼도 pointerup을 받도록 포인터를 붙잡는다
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, offset: 0, isDragging: false };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    const photo = photoRef.current;
    const dim = dimRef.current;
    if (!drag || !photo || !dim) return;
    const offset = Math.max(0, event.clientY - drag.startY);
    if (!drag.isDragging && offset < DRAG_START_PX) return;
    drag.isDragging = true;
    drag.offset = offset;
    const effect = Math.min(offset, DRAG_EFFECT_MAX_PX);
    applyPose(
      photo,
      dim,
      `translateY(${offset}px) scale(${1 - effect / 1000})`,
      1 - effect / 300,
      false,
    );
  };

  const handlePointerEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.isDragging) return;
    // 끌기를 마친 손가락의 click으로 닫히지 않게 한다
    suppressClickRef.current = true;
    if (drag.offset > DISMISS_DRAG_PX) {
      onRequestCloseRef.current();
      return;
    }
    const photo = photoRef.current;
    const dim = dimRef.current;
    if (!photo || !dim) return;
    applyPose(photo, dim, "none", 1, true);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (phase === "open") onRequestCloseRef.current();
  };

  if (phase === "hidden" || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${username} 프로필 사진`}
      tabIndex={-1}
      className="fixed inset-0 touch-none outline-none"
      style={{ zIndex: GLOBAL_LAYER.avatarZoom }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div
        ref={dimRef}
        aria-hidden="true"
        className="absolute inset-0 bg-pk-ink/42 backdrop-blur-[14px]"
        style={{ opacity: 0 }}
      />
      <div
        ref={photoRef}
        className="absolute overflow-hidden rounded-full bg-pk-neutral shadow-[0_20px_50px] shadow-pk-ink/30 ring-4 ring-white will-change-transform"
        style={{
          // 창 크기·회전이 바뀌어도 가운데에 있도록 CSS로 가운데에 둔다
          left: `calc(50% - ${AVATAR_ZOOM_SIZE / 2}px)`,
          top: `calc(50% - ${AVATAR_ZOOM_SIZE / 2}px)`,
          width: AVATAR_ZOOM_SIZE,
          height: AVATAR_ZOOM_SIZE,
          transformOrigin: "0 0",
        }}
      >
        <img
          src={imageUrl}
          alt={`${username} 프로필 사진`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
    </div>,
    document.body,
  );
};

export default AvatarZoomViewer;
