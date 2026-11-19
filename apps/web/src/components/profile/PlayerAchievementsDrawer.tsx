import React, { useCallback, useEffect, useRef, useState } from "react";
import AchievementsScreen from "@/components/profile/AchievementsScreen";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import type { TabKey } from "@/context/TabNavigationContext";
import type { AchievementProgressInfo } from "@/lib/achievements";
import { getUserErrorMessage } from "@/lib/errors";
import { fetchPlayerProfileSummary } from "@/lib/playerProfile";

export interface PlayerAchievementsDrawerProps {
  playerId: string;
  /** 주면 진행도가 준비된 뒤 그 업적 줄로 스크롤해 한 번 반짝인다 */
  focusAchievementId?: string;
  /** 열어 달라는 요청. false가 되면 닫히는 움직임 뒤 onExited를 부른다 */
  isOpen: boolean;
  tabKey: TabKey;
  /** 화면 스택에서 이 화면을 구분하는 깊이 id */
  depthId: string;
  onClose: () => void;
  onExited: () => void;
}

interface LoadedAchievements {
  username: string;
  progress: AchievementProgressInfo[];
}

/**
 * 전역 업적 전체 보기 화면. 회원 업적 진행도를 스스로 불러온다.
 * dataVersion이 바뀌면 보이는 내용을 유지한 채 다시 불러온다.
 */
export default function PlayerAchievementsDrawer({
  playerId,
  focusAchievementId,
  isOpen,
  tabKey,
  depthId,
  onClose,
  onExited,
}: PlayerAchievementsDrawerProps): React.ReactElement {
  const { dataVersion } = useAppNavigation();
  const { player: viewer } = useAuth();
  const [loaded, setLoaded] = useState<LoadedAchievements | null>(null);
  /** 보일 진행도 없이 불러오기에 실패했을 때 문구. 실패가 아니면 null */
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    try {
      const summary = await fetchPlayerProfileSummary(playerId);
      if (requestIdRef.current !== requestId) return;
      hasLoadedRef.current = true;
      setLoaded({
        username: summary.player.username,
        progress: summary.achievements,
      });
      setLoadErrorMessage(null);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      // 이미 보인 진행도가 있으면 재조회 실패는 그대로 둔다
      if (!hasLoadedRef.current) {
        setLoadErrorMessage(
          getUserErrorMessage(err, "업적을 불러오지 못했어요"),
        );
      }
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [dataVersion, load]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  const retry = useCallback(() => {
    setLoadErrorMessage(null);
    void load();
  }, [load]);

  // 내 업적은 나 탭과 같은 제목을 쓴다
  const title =
    playerId === viewer?.id || !loaded ? "업적" : `${loaded.username} 업적`;

  return (
    <AchievementsScreen
      isOpen={isOpen}
      tabKey={tabKey}
      depthId={depthId}
      playerId={playerId}
      progress={loaded?.progress ?? []}
      title={title}
      isLoading={!loaded && !loadErrorMessage}
      loadError={
        loadErrorMessage ? { message: loadErrorMessage, onRetry: retry } : null
      }
      focusAchievementId={focusAchievementId}
      onClose={onClose}
      onExited={onExited}
    />
  );
}
