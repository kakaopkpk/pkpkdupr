import React from "react";

/** 섹션 제목 13/700 + 오른쪽 슬롯 */
export const SectionLabel: React.FC<{
  children: React.ReactNode;
  right?: React.ReactNode;
}> = ({ children, right }) => (
  <div className="flex min-h-7 items-center justify-between px-1">
    <h2 className="text-pk-13 font-bold text-pk-sub">{children}</h2>
    {right}
  </div>
);

/** 블루 13/700 텍스트 링크(터치 영역 44px) */
export const TextLink: React.FC<{
  children: React.ReactNode;
  onPress: () => void;
}> = ({ children, onPress }) => (
  <button
    type="button"
    onClick={onPress}
    className="inline-flex min-h-11 items-center text-pk-13 font-bold text-pk-primary"
  >
    {children}
  </button>
);
