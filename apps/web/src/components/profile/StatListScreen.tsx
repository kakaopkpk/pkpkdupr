import React, { useCallback } from "react";
import PushScreen from "@/components/PushScreen";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";

export interface StatListScreenProps {
  /** 열어 달라는 요청 */
  isOpen: boolean;
  tabKey: TabKey;
  depthId: string;
  title: string;
  onClose: () => void;
  /** 전체 목록 카드. 받은 프로필 요약을 그대로 그린다 */
  children: React.ReactNode;
}

/** 파트너 궁합·천적 전체 보기 화면. 추가 조회 없이 호출부가 넘긴 카드를 보인다 */
export default function StatListScreen({
  isOpen,
  tabKey,
  depthId,
  title,
  onClose,
  children,
}: StatListScreenProps): React.ReactElement {
  const { closeDepth, restoreScrollTop, selectedTab } = useTabNavigation();

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

  const handleExited = useCallback(
    () => restoreScrollTop(tabKey),
    [restoreScrollTop, tabKey],
  );

  return (
    <PushScreen
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel={title}
      title={title}
      onBack={close}
      onExited={handleExited}
    >
      <div className="flex flex-col gap-2.5 px-4 pb-8">{children}</div>
    </PushScreen>
  );
}
