import React, { useCallback } from "react";
import AppSettingsSheetBody from "@/components/AppSettingsSheetBody";
import DetailPageHeader from "@/components/DetailPageHeader";
import ProfileSettingsSheetBody from "@/components/ProfileSettingsSheetBody";
import RightDrawer from "@/components/RightDrawer";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";

export interface SettingsDrawerProps {
  isOpen: boolean;
  tabKey: TabKey;
  onClose: () => void;
}

const DEPTH_ID = "global-settings";

/**
 * 전역 설정. 지금은 기존 계정 설정(아이디·비밀번호 변경·로그아웃)과
 * 앱 설정(버전·업데이트) 시트 내용을 한 화면에 이어 붙인다
 */
export default function SettingsDrawer({
  isOpen,
  tabKey,
  onClose,
}: SettingsDrawerProps): React.ReactElement {
  const { registerScrollContainer, restoreScrollTop, selectedTab } =
    useTabNavigation();
  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId: DEPTH_ID,
    kind: "settings",
    onClose,
    saveScroll: true,
  });

  const handleScrollContainerChange = useCallback(
    (element: HTMLDivElement | null) => {
      registerScrollContainer(tabKey, DEPTH_ID, element);
    },
    [registerScrollContainer, tabKey],
  );

  return (
    <RightDrawer
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel="설정"
      onExited={() => restoreScrollTop(tabKey)}
      onScrollContainerChange={handleScrollContainerChange}
      layer={GLOBAL_LAYER.settings}
    >
      <DetailPageHeader title="설정" tabKey={tabKey} />
      <div className="flex flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))]">
        <div className="rounded-pk-lg bg-white p-4">
          <ProfileSettingsSheetBody />
        </div>
        <div className="rounded-pk-lg bg-white p-4">
          <AppSettingsSheetBody />
        </div>
      </div>
    </RightDrawer>
  );
}
