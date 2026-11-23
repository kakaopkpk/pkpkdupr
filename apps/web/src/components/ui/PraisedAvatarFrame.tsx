import React from "react";
import { SESSION_PRAISE_HIGHLIGHT_MIN } from "@pkpkdupr/shared/sessionPraise";
import { ThumbUpIcon } from "./Icons";

/**
 * 한 세션에서 칭찬을 SESSION_PRAISE_HIGHLIGHT_MIN개 이상 받은 회원 아바타에 앰버 링(2px)과
 * 오른쪽 아래 앰버 엄지 배지(지름 19, 흰 링 2)를 붙인다. 배지만 3.2초마다 톡 튀며 기운다(`.pk-praise-badge`).
 * 칭찬이 모자라면 아바타만 그린다
 */
export const PraisedAvatarFrame: React.FC<{
  praiseCount: number;
  children: React.ReactNode;
}> = ({ praiseCount, children }) => {
  if (praiseCount < SESSION_PRAISE_HIGHLIGHT_MIN) return <>{children}</>;
  return (
    <span className="relative inline-flex shrink-0">
      <span className="inline-flex rounded-full shadow-[0_0_0_2px_var(--color-pk-hl)]">
        {children}
      </span>
      <span
        aria-hidden="true"
        className="pk-praise-badge absolute -right-[5px] -bottom-1 flex size-[19px] items-center justify-center rounded-full bg-pk-hl text-pk-ink shadow-[0_0_0_2px_var(--color-white)]"
      >
        <ThumbUpIcon size={11} strokeWidth={2.6} />
      </span>
    </span>
  );
};

export default PraisedAvatarFrame;
