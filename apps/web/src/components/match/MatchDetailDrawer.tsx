import React, { useCallback, useEffect, useState } from "react";
import ProfileMatchDetailDrawer from "@/components/ProfileMatchDetailDrawer";
import {
  GLOBAL_LAYER,
  useAppNavigation,
} from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";

export interface MatchDetailDrawerProps {
  matchId: string | null;
  tabKey: TabKey;
  onClose: () => void;
}

const DEPTH_ID = "global-match-detail";

/** 전역 경기 상세. 지금은 기존 ProfileMatchDetailDrawer를 감싼다 */
export default function MatchDetailDrawer({
  matchId,
  tabKey,
  onClose,
}: MatchDetailDrawerProps): React.ReactElement {
  const { player } = useAuth();
  const { notifyDataChanged } = useAppNavigation();
  const { registerScrollContainer, restoreScrollTop, selectedTab } =
    useTabNavigation();
  // 닫히는 애니메이션 동안 마지막 경기를 계속 보여 준다
  const [displayedMatchId, setDisplayedMatchId] = useState(matchId);
  const isOpen = useLayerDepth({
    isOpen: !!matchId,
    tabKey,
    depthId: DEPTH_ID,
    kind: "match-detail",
    onClose,
    saveScroll: true,
  });

  useEffect(() => {
    if (matchId) setDisplayedMatchId(matchId);
  }, [matchId]);

  const handleScrollContainerChange = useCallback(
    (element: HTMLDivElement | null) => {
      registerScrollContainer(tabKey, DEPTH_ID, element);
    },
    [registerScrollContainer, tabKey],
  );

  const handleExited = useCallback(() => {
    setDisplayedMatchId(null);
    restoreScrollTop(tabKey);
  }, [restoreScrollTop, tabKey]);

  if (!displayedMatchId) return <></>;

  return (
    <ProfileMatchDetailDrawer
      isOpen={isOpen}
      isActive={tabKey === selectedTab}
      tabKey={tabKey}
      match={null}
      matchId={displayedMatchId}
      currentPlayerId={player?.id}
      onMatchRecorded={notifyDataChanged}
      onExited={handleExited}
      onScrollContainerChange={handleScrollContainerChange}
      layer={GLOBAL_LAYER.matchDetail}
    />
  );
}
