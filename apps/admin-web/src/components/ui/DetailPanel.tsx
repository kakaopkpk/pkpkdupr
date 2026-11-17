import React from "react";

/** 목록 오른쪽 상세 패널(흰 카드). ListWithPanel의 panel에 넣는다. */
export const DetailPanel: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, leading, onClose, children }) => (
  // 최대 높이 = 화면 높이 − 위아래 여백(ListWithPanel sticky top-7 28px × 2)
  <section className="flex max-h-[calc(100vh-56px)] flex-col rounded-pk-lg bg-white">
    <header className="flex items-start gap-3 px-5 pt-5">
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-pk-17 font-bold text-pk-ink">{title}</h2>
        {subtitle && <div className="mt-0.5 text-pk-13 text-pk-sub">{subtitle}</div>}
      </div>
      <button
        type="button"
        aria-label="패널 닫기"
        onClick={onClose}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-pk-15 text-pk-muted hover:bg-pk-bg hover:text-pk-sub focus-visible:outline-2 focus-visible:outline-pk-primary"
      >
        ✕
      </button>
    </header>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{children}</div>
  </section>
);

/** 패널 안 구획. 제목은 12px 굵은 회색 라벨이다. */
export const PanelSection: React.FC<{ title?: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section>
    {title && <h3 className="mb-2 text-pk-12 font-bold text-pk-muted">{title}</h3>}
    {children}
  </section>
);
