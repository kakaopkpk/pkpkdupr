import { useEffect, useRef } from "react";
import {
  type TabDepthKind,
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";

interface UseLayerDepthOptions {
  /** 셸이 열어 달라고 한 상태 */
  isOpen: boolean;
  tabKey: TabKey;
  depthId: string;
  kind: TabDepthKind;
  /** 깊이가 닫혔을 때(뒤로가기·닫기 버튼·셸이 닫음) 호출한다. 여러 번 불려도 안전해야 한다 */
  onClose: () => void;
  /** true면 열기 전에 탭 스크롤 위치를 저장한다(화면 이동 PushScreen) */
  saveScroll?: boolean;
}

/**
 * 전역 화면 래퍼가 열려 있는 동안 받은 tabKey에 깊이를 쌓아 브라우저 뒤로가기로 닫히게 한다.
 * 실제로 화면에 보일지(깊이가 스택에 있는지)를 돌려준다.
 */
export const useLayerDepth = ({
  isOpen,
  tabKey,
  depthId,
  kind,
  onClose,
  saveScroll = false,
}: UseLayerDepthOptions): boolean => {
  const { closeDepth, depthStacks, pushDepth, saveScrollPosition } =
    useTabNavigation();
  const onCloseRef = useRef(onClose);
  const pushedRef = useRef<{ tabKey: TabKey; depthId: string } | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      if (pushedRef.current) return;

      const target = { tabKey, depthId };
      pushedRef.current = target;
      if (saveScroll) saveScrollPosition(tabKey);
      pushDepth(tabKey, {
        id: depthId,
        kind,
        onClose: () => {
          if (pushedRef.current === target) pushedRef.current = null;
          onCloseRef.current();
        },
      });
      return;
    }

    const pushed = pushedRef.current;
    if (!pushed) return;

    pushedRef.current = null;
    closeDepth(pushed.tabKey, pushed.depthId);
  }, [
    closeDepth,
    depthId,
    isOpen,
    kind,
    pushDepth,
    saveScroll,
    saveScrollPosition,
    tabKey,
  ]);

  return depthStacks[tabKey].includes(depthId);
};
