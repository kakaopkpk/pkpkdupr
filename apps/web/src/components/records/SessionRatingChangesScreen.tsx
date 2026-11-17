import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import ListPushScreen from "@/components/ListPushScreen";
import { SessionPlayerRatingRow } from "@/components/records/SessionReportParts";
import { Card } from "@/components/ui/Card";
import { useAppNavigation } from "@/context/AppNavigationContext";
import type { TabKey } from "@/context/TabNavigationContext";

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

  return (
    <ListPushScreen
      isOpen={isOpen}
      tabKey={tabKey}
      depthId={depthId}
      title="평점 변화"
      onClose={onClose}
    >
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
    </ListPushScreen>
  );
}
