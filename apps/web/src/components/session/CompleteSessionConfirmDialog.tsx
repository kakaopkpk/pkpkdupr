import React from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import type { TabKey } from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";

const DEPTH_ID = "complete-session-confirm";

interface CompleteSessionConfirmDialogProps {
  isOpen: boolean;
  /** 확인 창을 연 탭. 그 탭에 깊이를 쌓아 뒤로가기로 닫는다 */
  tabKey: TabKey;
  selectedTab: TabKey;
  isConfirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 세션 완료 바의 "세션 완료"를 누르면 한 번 더 묻는 확인 창 */
export const CompleteSessionConfirmDialog: React.FC<
  CompleteSessionConfirmDialogProps
> = ({ isOpen, tabKey, selectedTab, isConfirming, onCancel, onConfirm }) => {
  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId: DEPTH_ID,
    kind: "dialog",
    onClose: onCancel,
  });

  return (
    <ConfirmDialog
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      layer={GLOBAL_LAYER.sheet}
      title="세션을 완료할까요?"
      confirmLabel={isConfirming ? "완료 중…" : "세션 완료"}
      isConfirming={isConfirming}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <p className="px-1 text-center text-pk-15 text-pk-sub">
        완료하면 세션이 끝나고, 이후 기록한 경기는 이 세션에 들어가지 않아요
      </p>
    </ConfirmDialog>
  );
};
