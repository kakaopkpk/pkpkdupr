import React, { useCallback, useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import CreateSessionSheetBody from "@/components/CreateSessionSheetBody";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

export interface CreateSessionSheetProps {
  isOpen: boolean;
  tabKey: TabKey;
  onClose: () => void;
  onCreated: (session: MatchSessionDetailInfo) => void;
}

const DEPTH_ID = "global-create-session-sheet";

/** 전역 세션 만들기 시트. 지금은 기존 CreateSessionSheetBody를 감싼다 */
export default function CreateSessionSheet({
  isOpen,
  tabKey,
  onClose,
  onCreated,
}: CreateSessionSheetProps): React.ReactElement {
  const isOnline = useOnlineStatus();
  const { closeDepth, selectedTab } = useTabNavigation();
  // 열 때마다 올려서 입력을 초기화한다
  const [sheetKey, setSheetKey] = useState(0);
  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId: DEPTH_ID,
    kind: "bottom-sheet",
    onClose,
  });

  useEffect(() => {
    if (isOpen) setSheetKey((key) => key + 1);
  }, [isOpen]);

  const close = useCallback(
    (afterClose?: () => void) => {
      if (!closeDepth(tabKey, DEPTH_ID, afterClose)) {
        onClose();
        afterClose?.();
      }
    },
    [closeDepth, onClose, tabKey],
  );

  return (
    <BottomSheet
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) close();
      }}
      ariaLabel="세션 만들기"
      layer={GLOBAL_LAYER.createSession}
    >
      <CreateSessionSheetBody
        key={sheetKey}
        isOnline={isOnline}
        onCancel={() => close()}
        onCreated={(session) => close(() => onCreated(session))}
      />
    </BottomSheet>
  );
}
