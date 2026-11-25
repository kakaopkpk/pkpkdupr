import React from "react";
import { buttonPressClassName, rowPressClassName } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  dismissRulesGuideCard,
  RULES_GUIDE_CARD_COUNT,
} from "@/lib/rulesGuide";

const BookIcon: React.FC = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    <path d="M9 8h7M9 12h5" />
  </svg>
);

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
 * 홈 소식 맨 위의 피클볼 기본 규칙 안내 카드. 누르면 안내 화면을 열고, X로 닫을 수 있다.
 * 어느 쪽이든 그 기기에서는 다시 나오지 않는다(보일지는 호출부가 useIsRulesGuideCardDismissed로 정함)
 */
const RulesGuideNewsCard: React.FC = () => {
  const { openRulesGuide } = useAppNavigation();

  return (
    <article
      onClick={(event) => {
        // 닫기 버튼은 따로 처리한다
        if ((event.target as HTMLElement).closest("button")) return;
        openRulesGuide();
      }}
      className={cx(
        "flex cursor-pointer items-center gap-3 rounded-pk-lg bg-white p-4",
        rowPressClassName,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pk-primary-soft text-pk-primary"
      >
        <BookIcon />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-pk-15 font-bold text-pk-ink">
          피클볼 기본 규칙
        </span>
        <span className="text-pk-13 text-pk-sub">
          규칙 카드 {RULES_GUIDE_CARD_COUNT}장
        </span>
      </div>
      <button type="button" onClick={openRulesGuide} className="sr-only">
        피클볼 기본 규칙 보기
      </button>
      <button
        type="button"
        aria-label="규칙 안내 닫기"
        onClick={dismissRulesGuideCard}
        className={cx(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-pk-quiet",
          buttonPressClassName,
        )}
      >
        <CloseIcon />
      </button>
    </article>
  );
};

export default RulesGuideNewsCard;
