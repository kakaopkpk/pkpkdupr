import React from "react";
import { BackIcon } from "./Icons";

/** 탭 화면 머리. 제목 26/800 */
export const TabHeader: React.FC<{
  title: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ title, sub, right }) => (
  <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-4">
    <div className="flex min-w-0 flex-col gap-0.5">
      <h1 className="text-pk-26 font-extrabold leading-[1.25] tracking-[-0.02em] text-pk-ink">
        {title}
      </h1>
      {sub ? <div className="text-pk-13 text-pk-sub">{sub}</div> : null}
    </div>
    {right ? <div className="flex shrink-0 items-center">{right}</div> : null}
  </header>
);

/** 상세 화면 머리. 44px 뒤로 버튼 + 제목 17/800 */
export const DetailHeader: React.FC<{
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, right }) => (
  <header className="flex items-center gap-0.5 px-3 pt-2 pb-2">
    <button
      type="button"
      aria-label="뒤로"
      onClick={onBack}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-pk-ink active:bg-pk-neutral"
    >
      <BackIcon />
    </button>
    <h1 className="min-w-0 flex-1 truncate text-pk-17 font-extrabold text-pk-ink">
      {title}
    </h1>
    {right ? <div className="flex shrink-0 items-center">{right}</div> : null}
  </header>
);
