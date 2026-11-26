import React from "react";
import { buttonPressClassName, rowPressClassName } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { BookIcon } from "@/components/ui/Icons";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  closeRulesGuideCard,
  RULES_GUIDE_CARD_COUNT,
  useRulesGuideSeenCount,
} from "@/lib/rulesGuide";

const CloseIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * 홈 소식 맨 위의 피클볼 기본 규칙 안내 카드. 누르면 안내 화면을 열고, 본 장 수를 진행률로 보인다.
 * X로 닫거나 모든 장을 다 보면 그 기기에서는 다시 나오지 않는다(보일지는 호출부가 useIsRulesGuideCardHidden으로 정함)
 */
const RulesGuideNewsCard: React.FC = () => {
  const { openRulesGuide } = useAppNavigation();
  const seenCount = useRulesGuideSeenCount();

  return (
    <article
      onClick={(event) => {
        // 닫기 버튼은 따로 처리한다
        if ((event.target as HTMLElement).closest("button")) return;
        openRulesGuide();
      }}
      className={cx(
        "flex cursor-pointer flex-col gap-3 rounded-pk-lg bg-white p-4",
        rowPressClassName,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pk-primary-soft text-pk-primary"
        >
          <BookIcon size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-pk-15 font-bold text-pk-ink">
            피클볼 기본 규칙
          </span>
          <span className="text-pk-13 text-pk-sub">
            {RULES_GUIDE_CARD_COUNT}장 중 {seenCount}장 읽음
          </span>
        </div>
        <button type="button" onClick={openRulesGuide} className="sr-only">
          피클볼 기본 규칙 보기
        </button>
        <button
          type="button"
          aria-label="규칙 안내 닫기"
          onClick={closeRulesGuideCard}
          className={cx(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-pk-quiet",
            buttonPressClassName,
          )}
        >
          <CloseIcon />
        </button>
      </div>
      <ProgressBar
        ratio={seenCount / RULES_GUIDE_CARD_COUNT}
        className="h-1.5"
      />
    </article>
  );
};

export default RulesGuideNewsCard;
