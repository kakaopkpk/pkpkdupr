import React from "react";

/** 시트 제목 22/800 + 부제 + 오른쪽 슬롯 */
export const SheetTitle: React.FC<{
  title: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ title, sub, right }) => (
  <div className="flex items-start justify-between gap-2 px-1 pt-0.5">
    <div className="flex min-w-0 flex-col gap-0.5">
      <h2 className="text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
        {title}
      </h2>
      {sub ? <div className="text-pk-13 text-pk-sub">{sub}</div> : null}
    </div>
    {right ? <div className="flex shrink-0 items-center">{right}</div> : null}
  </div>
);
