import React, { useCallback } from "react";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import PushScreen from "@/components/PushScreen";
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

/** 설정 안의 비밀번호 변경 하위 화면. 설정 화면 위에 한 깊이 더 쌓는다 */
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
    kind: "push-screen",
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
          // 폼에는 실패 문구가 남아 있으므로 재시도 성공도 폼 성공처럼 화면을 닫는다
          close();
        },
      });
      // 입력을 지우지 않도록 폼에도 실패로 알린다
      throw new Error("네트워크 연결을 확인해 주세요.");
    }
  };

  return (
    <PushScreen
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel="비밀번호 변경"
      title="비밀번호 변경"
      onBack={close}
    >
      <div className="flex flex-1 flex-col px-4 pt-1 pb-4">
        <PasswordChangeForm onSubmit={submit} onSuccess={close} />
      </div>
    </PushScreen>
  );
}
