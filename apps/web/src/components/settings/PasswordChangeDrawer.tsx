import React, { useCallback } from "react";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import RightDrawer from "@/components/RightDrawer";
import { DetailHeader } from "@/components/ui/Headers";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import { type TabKey, useTabNavigation } from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { isNetworkSaveFailure } from "./saveFailure";

const DEPTH_ID = "global-settings-password";

interface PasswordChangeDrawerProps {
  isOpen: boolean;
  tabKey: TabKey;
  onClose: () => void;
}

/** 설정 안의 비밀번호 변경 하위 화면. 설정 드로어 위에 한 깊이 더 쌓는다 */
export default function PasswordChangeDrawer({
  isOpen,
  tabKey,
  onClose,
}: PasswordChangeDrawerProps): React.ReactElement {
  const { changePassword } = useAuth();
  const { showSaveFailure } = useSystemNotice();
  const { closeDepth, selectedTab } = useTabNavigation();
  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId: DEPTH_ID,
    kind: "settings",
    onClose,
  });

  const close = useCallback(() => {
    if (!closeDepth(tabKey, DEPTH_ID)) onClose();
  }, [closeDepth, onClose, tabKey]);

  const submit = async (newPassword: string) => {
    try {
      await changePassword(newPassword);
    } catch (error) {
      if (!isNetworkSaveFailure(error)) throw error;
      showSaveFailure({
        onRetry: async () => {
          await changePassword(newPassword);
        },
      });
      // 입력을 지우지 않도록 폼에도 실패로 알린다
      throw new Error("네트워크 연결을 확인해 주세요.");
    }
  };

  return (
    <RightDrawer
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel="비밀번호 변경"
      layer={GLOBAL_LAYER.settings + 1}
    >
      <DetailHeader title="비밀번호 변경" onBack={close} />
      <div className="flex flex-1 flex-col px-4 pt-1 pb-[calc(2rem+var(--safe-bottom))]">
        <PasswordChangeForm onSubmit={submit} onSuccess={close} />
      </div>
    </RightDrawer>
  );
}
