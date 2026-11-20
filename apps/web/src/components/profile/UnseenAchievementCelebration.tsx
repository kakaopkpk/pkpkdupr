import React, { useEffect, useState } from "react";
import AchievementCelebration from "@/components/record/AchievementCelebration";
import { useDataVersion } from "@/context/DataSyncContext";
import {
  fetchUnseenAchievements,
  markAchievementsSeen,
  pickPlayerEarnedAchievements,
  type PlayerEarnedAchievement,
} from "@/lib/achievements";

const ACHIEVEMENT_DATA_KINDS = ["achievements"] as const;

interface UnseenState {
  items: PlayerEarnedAchievement[];
  /** 지금 업적 점수 합. 응답에 없으면 null */
  points: number | null;
}

export interface UnseenAchievementCelebrationProps {
  playerId: string | null;
  /** 전역 화면·바텀시트·메뉴가 하나도 열려 있지 않을 때만 true. 그동안만 조회하고 띄운다 */
  isActive: boolean;
}

/**
 * 아직 축하 연출로 보지 않은 내 업적을 전체 화면 축하 연출로 띄운다.
 * 남이 입력한 경기·세션 지배자·관리자 정정으로 받은 업적도 여기서 한 번 보인다.
 * 앱을 열 때, 업적 데이터 버전이 바뀔 때(무효화·앱 복귀 TTL), 열린 화면이 모두 닫힐 때 조회하고,
 * 닫으면 서버에 확인 처리해 다른 기기에서도 다시 뜨지 않는다.
 */
export default function UnseenAchievementCelebration({
  playerId,
  isActive,
}: UnseenAchievementCelebrationProps): React.ReactElement | null {
  // 셸이 그리므로 화면 보임은 늘 참이고 문서가 숨은 동안만 미룬다
  const dataVersion = useDataVersion(ACHIEVEMENT_DATA_KINDS);
  const [unseen, setUnseen] = useState<UnseenState | null>(null);
  const isShowing = unseen !== null;

  // 다른 회원으로 바뀌면 띄우던 연출을 버린다
  useEffect(() => {
    setUnseen(null);
  }, [playerId]);

  useEffect(() => {
    if (!playerId || !isActive || isShowing) return;
    // 그사이 다시 조회했거나 다른 화면이 열렸으면 결과를 버린다(닫히면 다시 조회한다)
    let isCancelled = false;
    fetchUnseenAchievements()
      .then(({ achievements, points }) => {
        if (isCancelled) return;
        const picked = pickPlayerEarnedAchievements(achievements, playerId);
        if (picked.length > 0) setUnseen({ items: picked, points });
      })
      // 조회 실패는 알리지 않는다. 다음 조회 때 다시 시도한다
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [dataVersion, isActive, isShowing, playerId]);

  if (!unseen) return null;

  return (
    <AchievementCelebration
      achievements={unseen.items.map(({ definition }) => definition)}
      earnedAts={unseen.items.map(({ item }) => item.earnedAt)}
      totalPoints={unseen.points}
      delayMs={0}
      onClose={() => {
        // 확인 처리가 실패하면 다음 조회 때 다시 뜬다
        void markAchievementsSeen(
          unseen.items.map(({ item }) => item),
        ).catch(() => {});
        setUnseen(null);
      }}
    />
  );
}
