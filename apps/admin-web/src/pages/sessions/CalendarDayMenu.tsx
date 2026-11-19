import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../components/ui/cx";

export interface CalendarDayMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** 화면 가장자리와 메뉴 사이에 남길 여백(px) */
const VIEWPORT_GAP = 8;

/**
 * 달력 날짜 우클릭 메뉴. 누른 자리(화면 좌표)에 뜨고, 바깥 누르기·Esc·스크롤·창 크기 변경으로 닫힌다.
 * 열리면 첫 항목에 포커스를 두고 위·아래 화살표로 옮긴다.
 */
export const CalendarDayMenu: React.FC<{
  /** 맨 위 회색 머리줄(날짜 · 그날 상태) */
  heading: string;
  position: { x: number; y: number };
  items: CalendarDayMenuItem[];
  onClose: () => void;
}> = ({ heading, position, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [placed, setPlaced] = useState(position);

  // 화면 밖으로 넘치면 안쪽으로 당긴다
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPlaced({
      x: Math.max(
        VIEWPORT_GAP,
        Math.min(position.x, window.innerWidth - width - VIEWPORT_GAP),
      ),
      y: Math.max(
        VIEWPORT_GAP,
        Math.min(position.y, window.innerHeight - height - VIEWPORT_GAP),
      ),
    });
  }, [position]);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();

    const close = () => onCloseRef.current();
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    buttons[(current + step + buttons.length) % buttons.length]?.focus();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={heading}
      onKeyDown={moveFocus}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-50 min-w-[210px] rounded-pk-sm border border-pk-divider bg-white py-1 shadow-[0_8px_24px_color-mix(in_oklab,var(--color-pk-ink)_14%,transparent)]"
      style={{ left: placed.x, top: placed.y }}
    >
      <div className="px-3 pb-1 pt-1 text-pk-12 font-bold text-pk-muted">{heading}</div>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cx(
            "flex h-9 w-full items-center px-3 text-left text-pk-15 text-pk-ink",
            "hover:bg-pk-bg focus-visible:bg-pk-bg focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:text-pk-muted disabled:hover:bg-white",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
};
