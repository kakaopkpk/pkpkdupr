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

/**
 * 화면 이동(PushScreen) 머리. 위에 고정되며 44px 원형 뒤로 버튼 + 제목 17/800 한 줄(넘치면 말줄임) + 오른쪽 슬롯.
 * 위 여백은 상태 표시줄(safe-area)을 포함한다.
 */
export const DetailHeader: React.FC<{
  title: React.ReactNode;
  onBack: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, right }) => (
  <header className="flex shrink-0 items-center gap-0.5 bg-pk-bg px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2">
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
