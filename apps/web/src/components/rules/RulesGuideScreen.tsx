import React, { useCallback, useEffect, useRef, useState } from "react";
import PushScreen from "@/components/PushScreen";
import { PkButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { useInvalidateData } from "@/context/DataSyncContext";
import { type TabKey, useTabNavigation } from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { type PanelSwipeStep, usePanelSwipe } from "@/hooks/usePanelSwipe";
import { markRulesGuideCardSeen } from "@/lib/rulesGuide";
import { submitRulesGuideCompletion } from "@/lib/rulesGuideCompletion";
import { RULES_GUIDE_CARDS, RULES_GUIDE_RULE_COUNT } from "./RulesGuideCards";
import { RuleHeading } from "./RulesGuideParts";
import "./rulesGuide.css";

const TITLE = "피클볼 기본 규칙";
const CARD_COUNT = RULES_GUIDE_CARDS.length;

/** 한 장 넘길 때 트랙이 움직이는 거리. 옆 카드와의 거리라 카드 폭·사이 간격이 바뀌어도 맞는다 */
const getCardStepWidth = (track: HTMLElement) => {
  const [first, second] = Array.from(track.children) as HTMLElement[];
  return second ? second.offsetLeft - first.offsetLeft : track.offsetWidth;
};

const canMoveFrom = (index: number) => (step: PanelSwipeStep) => {
  const next = index + step;
  return next >= 0 && next < CARD_COUNT;
};

export interface RulesGuideScreenProps {
  /** 열어 달라는 요청. false가 되면 닫히는 움직임 뒤 onExited를 부른다 */
  isOpen: boolean;
  tabKey: TabKey;
  /** 화면 스택에서 이 화면을 구분하는 깊이 id */
  depthId: string;
  onClose: () => void;
  onExited: () => void;
}

/** 카드 아래 위치 점. 지금 카드는 블루로 길게, 나머지는 회색 작은 원이고, 규칙과 부록 사이를 띄운다 */
const PositionDots: React.FC<{ activeIndex: number }> = ({ activeIndex }) => (
  <div aria-hidden="true" className="flex shrink-0 justify-center gap-1.5 pt-4">
    {RULES_GUIDE_CARDS.map((card, index) => (
      <span
        key={card.title}
        className={cx(
          "h-1.5 rounded-full transition-colors duration-200 motion-reduce:transition-none",
          index === activeIndex ? "w-[18px] bg-pk-primary" : "w-1.5 bg-pk-quiet",
          index === RULES_GUIDE_RULE_COUNT && "ml-2",
        )}
      />
    ))}
  </div>
);

/**
 * 신입 회원용 피클볼 기본 규칙 안내. 카드 15장(규칙 12장 + 부록 3장)을 한 장씩 좌우로 넘기며(다음 카드가 오른쪽에 살짝 보임),
 * 지금 카드의 그림만 움직이고 카드로 넘어올 때마다 처음부터 재생한다.
 * 지금 카드가 된 장을 그 기기의 본 장으로 남긴다(홈 규칙 안내 카드의 진행률).
 * 모든 장을 본 채로 닫으면 서버에 완독(업적 모범생)을 남긴다
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
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const move = (step: PanelSwipeStep) =>
    setActiveIndex((index) => Math.max(0, Math.min(index + step, CARD_COUNT - 1)));
  // 지금 카드는 손가락을 뗄 때만 바뀐다(끄는 도중 카드 내용이 다시 그려지면 손가락 아래 요소가 떨어져 터치를 놓친다)
  const { slideIn } = usePanelSwipe(area, track, move, {
    canSwipe: canMoveFrom(activeIndex),
    getPanelWidth: getCardStepWidth,
  });
  const isLastCard = activeIndex === CARD_COUNT - 1;

  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId,
    kind: "push-screen",
    onClose,
    saveScroll: true,
  });

  useEffect(() => {
    if (isOpen) markRulesGuideCardSeen(activeIndex);
  }, [activeIndex, isOpen]);

  // 모든 장을 본 채로 닫으면(다 읽었어요·뒤로 모두) 완독을 남긴다. 업적 축하는 화면이 모두 닫힌 뒤 셸이 띄운다
  const invalidateData = useInvalidateData();
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    void submitRulesGuideCompletion().then((isSent) => {
      if (isSent) invalidateData(["achievements"]);
    });
  }, [invalidateData, isOpen]);

  const close = useCallback(() => {
    if (!closeDepth(tabKey, depthId)) onClose();
  }, [closeDepth, depthId, onClose, tabKey]);

  const handleExited = useCallback(() => {
    restoreScrollTop(tabKey);
    onExited();
  }, [onExited, restoreScrollTop, tabKey]);

  const moveByButton = (step: PanelSwipeStep) => {
    if (!canMoveFrom(activeIndex)(step)) return;
    slideIn(step);
    move(step);
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
              onClick={() => moveByButton(-1)}
            >
              이전
            </PkButton>
          ) : null}
          <PkButton
            size="lg"
            className="flex-1"
            onClick={() => (isLastCard ? close() : moveByButton(1))}
          >
            {isLastCard ? "다 읽었어요" : "다음"}
          </PkButton>
        </div>
      }
    >
      <div className="flex h-full flex-col">
        {/* 바깥이 터치를 받고 카드 밖을 자른다. 트랙은 카드 폭(100%-28px)+간격(10px)씩 translate로 지금 카드를 보이고, 끄는 거리는 훅이 transform으로 더한다 */}
        <div
          ref={setArea}
          role="region"
          aria-roledescription="carousel"
          aria-label={TITLE}
          className="flex min-h-0 flex-1 touch-pan-y overflow-hidden px-4 pt-2"
        >
          <div
            ref={setTrack}
            className="flex w-full min-w-0 shrink-0 gap-2.5"
            style={{ translate: `calc(${activeIndex} * (18px - 100%))` }}
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
                    "pk-rules-card flex shrink-0 flex-col overflow-y-auto rounded-pk-lg bg-white break-keep",
                    card.scope,
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
        </div>
        <PositionDots activeIndex={activeIndex} />
      </div>
    </PushScreen>
  );
}
