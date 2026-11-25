import React, { useCallback, useEffect, useRef, useState } from "react";
import PushScreen from "@/components/PushScreen";
import {
  scrollCarouselToIndex,
  useCarouselSwipe,
} from "@/components/home/useCarouselSwipe";
import { PkButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { type TabKey, useTabNavigation } from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { RULES_GUIDE_CARDS } from "./RulesGuideCards";
import "./rulesGuide.css";

const TITLE = "피클볼 기본 규칙";
const CARD_COUNT = RULES_GUIDE_CARDS.length;

export interface RulesGuideScreenProps {
  /** 열어 달라는 요청. false가 되면 닫히는 움직임 뒤 onExited를 부른다 */
  isOpen: boolean;
  tabKey: TabKey;
  /** 화면 스택에서 이 화면을 구분하는 깊이 id */
  depthId: string;
  onClose: () => void;
  onExited: () => void;
}

/** 카드 아래 위치 점. 지금 카드는 블루로 길게, 나머지는 회색 작은 원 */
const PositionDots: React.FC<{ activeIndex: number }> = ({ activeIndex }) => (
  <div aria-hidden="true" className="flex shrink-0 justify-center gap-1.5 pt-4">
    {RULES_GUIDE_CARDS.map((card, index) => (
      <span
        key={card.n}
        className={cx(
          "h-1.5 rounded-full transition-colors duration-200 motion-reduce:transition-none",
          index === activeIndex ? "w-[18px] bg-pk-primary" : "w-1.5 bg-pk-quiet",
        )}
      />
    ))}
  </div>
);

/**
 * 카드 트랙. PushScreen이 본문을 열린 뒤에야 그리므로, 트랙이 생긴 다음 넘기기를 붙이도록
 * 화면 본문 안의 컴포넌트로 둔다. 지금 카드 번호는 onActiveIndexChange로 알린다
 */
const RulesGuideCarousel: React.FC<{
  trackRef: React.RefObject<HTMLDivElement | null>;
  onActiveIndexChange: (index: number) => void;
}> = ({ trackRef, onActiveIndexChange }) => {
  const activeIndex = useCarouselSwipe(trackRef, CARD_COUNT);

  useEffect(() => {
    onActiveIndexChange(activeIndex);
  }, [activeIndex, onActiveIndexChange]);

  return (
    <div className="flex h-full flex-col">
      {/* relative는 카드 offsetLeft를 트랙 기준으로 재기 위해서고, scroll-px-4는 카드 맞춤 위치의 여백이다 */}
      <div
        ref={trackRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={TITLE}
        className="relative flex min-h-0 flex-1 touch-pan-y scroll-px-4 gap-2.5 overflow-x-auto overscroll-x-contain px-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {RULES_GUIDE_CARDS.map((card, index) => {
          const isActive = index === activeIndex;
          const isLast = index === CARD_COUNT - 1;
          return (
            <article
              key={card.n}
              role="group"
              aria-roledescription="slide"
              aria-label={`${CARD_COUNT}장 중 ${index + 1}번째: ${card.title}`}
              inert={!isActive}
              style={
                {
                  "--pk-rules-still": `-${card.stillSeconds}s`,
                } as React.CSSProperties
              }
              className={cx(
                "pk-rules-card flex shrink-0 flex-col overflow-y-auto rounded-pk-lg bg-white",
                `pk-rules-c${card.n}`,
                !isActive && "pk-rules-paused",
                // 마지막 카드는 다음 카드가 없어 폭 가득이다
                isLast ? "w-full" : "w-[calc(100%-28px)]",
                card.hasFigure ? "gap-4 p-4" : "gap-3 px-4 pt-5 pb-2",
              )}
            >
              {/* 지금 카드가 될 때마다 새로 그려 움직임을 처음부터 재생한다 */}
              <React.Fragment key={isActive ? "active" : "idle"}>
                {card.render()}
              </React.Fragment>
            </article>
          );
        })}
      </div>
      <PositionDots activeIndex={activeIndex} />
    </div>
  );
};

/**
 * 신입 회원용 피클볼 기본 규칙 안내. 카드 12장을 한 장씩 좌우로 넘기며(다음 카드가 오른쪽에 살짝 보임),
 * 지금 카드의 그림만 움직이고 카드로 넘어올 때마다 처음부터 재생한다
 */
export default function RulesGuideScreen({
  isOpen,
  tabKey,
  depthId,
  onClose,
  onExited,
}: RulesGuideScreenProps): React.ReactElement {
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isLastCard = activeIndex === CARD_COUNT - 1;

  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });

  const close = useCallback(() => {
    if (!closeDepth(tabKey, depthId)) onClose();
  }, [closeDepth, depthId, onClose, tabKey]);

  const handleExited = useCallback(() => {
    restoreScrollTop(tabKey);
    onExited();
  }, [onExited, restoreScrollTop, tabKey]);

  const goTo = (index: number) => {
    if (trackRef.current) scrollCarouselToIndex(trackRef.current, index);
  };

  return (
    <PushScreen
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel={TITLE}
      title={TITLE}
      onBack={close}
      onExited={handleExited}
      headerRight={
        <span className="pr-2 text-pk-13 font-bold tabular-nums text-pk-sub">
          {activeIndex + 1} / {CARD_COUNT}
        </span>
      }
      actions={
        <div
          className={cx(
            "grid gap-2",
            activeIndex === 0
              ? "grid-cols-1"
              : "grid-cols-[auto_minmax(0,1fr)]",
          )}
        >
          {activeIndex > 0 ? (
            <PkButton
              variant="soft"
              size="lg"
              onClick={() => goTo(activeIndex - 1)}
            >
              이전
            </PkButton>
          ) : null}
          <PkButton
            size="lg"
            onClick={() => (isLastCard ? close() : goTo(activeIndex + 1))}
          >
            {isLastCard ? "다 읽었어요" : "다음"}
          </PkButton>
        </div>
      }
    >
      <RulesGuideCarousel
        trackRef={trackRef}
        onActiveIndexChange={setActiveIndex}
      />
    </PushScreen>
  );
}
