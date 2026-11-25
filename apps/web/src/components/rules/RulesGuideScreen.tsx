import React, { useCallback, useEffect, useState } from "react";
import PushScreen from "@/components/PushScreen";
import {
  scrollCarouselToIndex,
  useCarouselSwipe,
} from "@/components/home/useCarouselSwipe";
import { PkButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { type TabKey, useTabNavigation } from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { markRulesGuideCardSeen } from "@/lib/rulesGuide";
import { RULES_GUIDE_CARDS } from "./RulesGuideCards";
import { RuleHeading } from "./RulesGuideParts";
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
        key={card.title}
        className={cx(
          "h-1.5 rounded-full transition-colors duration-200 motion-reduce:transition-none",
          index === activeIndex ? "w-[18px] bg-pk-primary" : "w-1.5 bg-pk-quiet",
        )}
      />
    ))}
  </div>
);

/**
 * 신입 회원용 피클볼 기본 규칙 안내. 카드 12장을 한 장씩 좌우로 넘기며(다음 카드가 오른쪽에 살짝 보임),
 * 지금 카드의 그림만 움직이고 카드로 넘어올 때마다 처음부터 재생한다.
 * 지금 카드가 된 장을 그 기기의 본 장으로 남긴다(홈 규칙 안내 카드의 진행률)
 */
export default function RulesGuideScreen({
  isOpen,
  tabKey,
  depthId,
  onClose,
  onExited,
}: RulesGuideScreenProps): React.ReactElement {
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();
  // 트랙은 PushScreen이 열린 뒤에 그려지므로 콜백 ref로 받는다
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const activeIndex = useCarouselSwipe(track, CARD_COUNT);
  const isLastCard = activeIndex === CARD_COUNT - 1;

  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });

  // 지금 카드가 된 장을 본 장으로 센다. 12장을 다 보면 홈 규칙 안내 카드가 사라진다
  useEffect(() => {
    if (isOpen) markRulesGuideCardSeen(activeIndex);
  }, [activeIndex, isOpen]);

  const close = useCallback(() => {
    if (!closeDepth(tabKey, depthId)) onClose();
  }, [closeDepth, depthId, onClose, tabKey]);

  const handleExited = useCallback(() => {
    restoreScrollTop(tabKey);
    onExited();
  }, [onExited, restoreScrollTop, tabKey]);

  const goTo = (index: number) => {
    if (track) scrollCarouselToIndex(track, index);
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
        <div className="flex gap-2">
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
            className="flex-1"
            onClick={() => (isLastCard ? close() : goTo(activeIndex + 1))}
          >
            {isLastCard ? "다 읽었어요" : "다음"}
          </PkButton>
        </div>
      }
    >
      <div className="flex h-full flex-col">
        {/* relative는 카드 offsetLeft를 트랙 기준으로 재기 위해서고, scroll-px-4는 카드 맞춤 위치의 여백이다 */}
        <div
          ref={setTrack}
          role="region"
          aria-roledescription="carousel"
          aria-label={TITLE}
          className="relative flex min-h-0 flex-1 touch-pan-y scroll-px-4 gap-2.5 overflow-x-auto overscroll-x-contain px-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {RULES_GUIDE_CARDS.map((card, index) => {
            const isActive = index === activeIndex;
            const { Figure } = card;
            return (
              <article
                key={card.title}
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
                  `pk-rules-c${index + 1}`,
                  !isActive && "pk-rules-paused",
                  // 마지막 카드는 다음 카드가 없어 폭 가득이다
                  index === CARD_COUNT - 1 ? "w-full" : "w-[calc(100%-28px)]",
                  Figure ? "gap-4 p-4" : "gap-3 px-4 pt-5 pb-2",
                )}
              >
                {/* 지금 카드가 될 때마다 새로 그려 움직임을 처음부터 재생한다 */}
                <React.Fragment key={isActive ? "active" : "idle"}>
                  {Figure ? <Figure /> : null}
                  <RuleHeading eyebrow={card.eyebrow} title={card.title} />
                  {card.body}
                </React.Fragment>
              </article>
            );
          })}
        </div>
        <PositionDots activeIndex={activeIndex} />
      </div>
    </PushScreen>
  );
}
