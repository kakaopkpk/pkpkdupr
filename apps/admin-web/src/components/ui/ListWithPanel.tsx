import React from "react";

/** 목록 + 오른쪽 상세 패널. panel이 null이면 목록이 전체 폭이다. */
export const ListWithPanel: React.FC<{
  list: React.ReactNode;
  panel: React.ReactNode | null;
}> = ({ list, panel }) => (
  <div className="flex items-start gap-5">
    <div className="min-w-0 flex-1">{list}</div>
    {panel !== null && panel !== undefined && (
      <div className="sticky top-7 w-[400px] shrink-0">{panel}</div>
    )}
  </div>
);
