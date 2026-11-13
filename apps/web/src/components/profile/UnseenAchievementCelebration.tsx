import React, { useEffect, useMemo, useRef, useState } from "react";
import AchievementCelebration from "@/components/record/AchievementCelebration";
import {
  excludeLocallySeenAchievements,
  fetchUnseenAchievements,
  getAchievementDefinition,
  markAchievementsSeen,
  type EarnedAchievementInfo,
} from "@/lib/achievements";

export interface UnseenAchievementCelebrationProps {
  playerId: string | null;
  /** 전역 화면·바텀시트·메뉴가 하나도 열려 있지 않을 때만 true. 그동안만 조회하고 띄운다 */
  isActive: boolean;
  /** 데이터가 바뀌면 다시 조회한다 */
  dataVersion: number;
}

/**
 * 아직 축하 연출로 보지 않은 내 업적을 전체 화면 축하 연출로 띄운다.
 * 남이 입력한 경기·세션 지배자·관리자 정정으로 받은 업적도 여기서 한 번 보인다.
 * 앱을 열 때, 데이터가 바뀔 때, 앱으로 돌아올 때, 열린 화면이 모두 닫힐 때 조회하고,
 * 닫으면 서버에 확인 처리해 다른 기기에서도 다시 뜨지 않는다.
 */
export default function UnseenAchievementCelebration({
  playerId,
  isActive,
  dataVersion,
}: UnseenAchievementCelebrationProps): React.ReactElement | null {
  const [items, setItems] = useState<EarnedAchievementInfo[] | null>(null);
  const [resumeCount, setResumeCount] = useState(0);
  const isActiveRef = useRef(isActive);
  const isShowingRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    isShowingRef.current = items !== null;
  }, [items]);

  // 다른 회원으로 바뀌면 띄우던 연출을 버린다
  useEffect(() => {
    setItems(null);
  }, [playerId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setResumeCount((count) => count + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!playerId || !isActive || isShowingRef.current) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    fetchUnseenAchievements()
      .then((result) => {
        // 그사이 다시 조회했거나 다른 화면이 열렸으면 버린다(닫히면 다시 조회한다)
        if (requestIdRef.current !== requestId || !isActiveRef.current) return;
        if (isShowingRef.current) return;
        const unseen = excludeLocallySeenAchievements(result).filter(
          (item) =>
            item.playerId === playerId &&
            !!getAchievementDefinition(item.achievementId),
        );
        if (unseen.length > 0) setItems(unseen);
      })
      // 조회 실패는 알리지 않는다. 다음 조회 때 다시 시도한다
      .catch(() => {});
  }, [dataVersion, isActive, playerId, resumeCount]);

  const definitions = useMemo(
    () =>
      (items ?? []).flatMap((item) => {
        const definition = getAchievementDefinition(item.achievementId);
        return definition ? [definition] : [];
      }),
    [items],
  );

  if (!items || definitions.length === 0) return null;

  return (
    <AchievementCelebration
      achievements={definitions}
      delayMs={0}
      onClose={() => {
        // 확인 처리가 실패하면 다음 조회 때 다시 뜬다
        void markAchievementsSeen(items).catch(() => {});
        setItems(null);
      }}
    />
  );
}
