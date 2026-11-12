import React from "react";
import { ChevronRightIcon } from "./Icons";

/**
 * 섹션 제목 13/700 + 오른쪽 슬롯. 오른쪽에 44px 링크가 와도 머리 높이는 28px로 같다
 * (링크가 위아래로 8px씩 겹친다).
 */
export const SectionLabel: React.FC<{
  children: React.ReactNode;
  right?: React.ReactNode;
}> = ({ children, right }) => (
  <div className="flex h-7 items-center justify-between px-1">
    <h2 className="text-pk-13 font-bold text-pk-sub">{children}</h2>
    {right ? <div className="-my-2 flex items-center">{right}</div> : null}
  </div>
);

/** 글자 높이 가운데에 맞춘 링크 꺽쇠 */
export const LinkChevron: React.FC = () => (
  <ChevronRightIcon className="size-[1em] shrink-0" />
);

/** 블루 13/700 텍스트 링크(터치 영역 44px) */
export const TextLink: React.FC<{
  children: React.ReactNode;
  onPress: () => void;
  /** true면 끝에 ChevronRightIcon을 글자 높이 가운데로 붙인다 */
  chevron?: boolean;
}> = ({ children, onPress, chevron = false }) => (
  <button
    type="button"
    onClick={onPress}
    className="inline-flex min-h-11 items-center gap-0.5 text-pk-13 font-bold text-pk-primary"
  >
    {children}
    {chevron ? <LinkChevron /> : null}
  </button>
);
