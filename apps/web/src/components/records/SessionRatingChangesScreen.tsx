import React, { useCallback } from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import PushScreen from "@/components/PushScreen";
import { SessionPlayerRatingRow } from "@/components/records/SessionReportParts";
import { Card } from "@/components/ui/Card";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";

export interface SessionRatingChangesScreenProps {
  /** 열어 달라는 요청 */
  isOpen: boolean;
  tabKey: TabKey;
  /** 세션 상세가 이미 받은 리포트 players(평점 변화 큰 순) */
  players: readonly SessionPlayerReport[];
  depthId: string;
  onClose: () => void;
}

/** 세션 참가자 전체의 평점 변화 화면. 세션 상세 위에 쌓이며 추가 조회 없이 받은 리포트를 그대로 보인다 */
export default function SessionRatingChangesScreen({
  isOpen,
  tabKey,
  players,
  depthId,
  onClose,
}: SessionRatingChangesScreenProps): React.ReactElement {
  const { openMemberProfile } = useAppNavigation();
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

  const handleExited = useCallback(() => {
    restoreScrollTop(tabKey);
  }, [restoreScrollTop, tabKey]);

  return (
    <PushScreen
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      ariaLabel="평점 변화"
      title="평점 변화"
      onBack={close}
      onExited={handleExited}
    >
      <div className="flex flex-col gap-2.5 px-4 pb-8">
        <Card>
          {players.map((report, index) => (
            <SessionPlayerRatingRow
              key={report.player.id}
              report={report}
              ratingLabel="before-after"
              order={index + 1}
              onPress={() => openMemberProfile(report.player.id)}
            />
          ))}
        </Card>
      </div>
    </PushScreen>
  );
}
