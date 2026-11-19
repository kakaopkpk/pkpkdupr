import React from "react";
import {
  formatSessionTimePlace,
  getSessionDDayLabel,
} from "@/components/session/sessionTimeLabel";
import {
  ParticipationControls,
  ParticipationError,
  type ParticipationAction,
  SessionBlueCard,
} from "@/components/session/SessionBlueCard";
import { LivePill } from "@/components/ui/Badges";
import { PkButton } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Icons";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

/**
 * 아직 끝나지 않은 세션 블루 카드. 홈 다음 세션 카드와 같은 모양이고 참여하기·참여 취소가 있다.
 * 일정 탭은 날짜를 바깥 날짜 제목이 보이므로 메타 줄 기본값은 시간·장소다.
 * 진행 중(isLive)이면 남은 날 대신 LIVE를 붙인다. 세션 상세 머리도 이 카드다
 */
export const UpcomingSessionCard: React.FC<{
  session: MatchSessionDetailInfo;
  todayKey: string;
  isJoined: boolean;
  pendingAction: ParticipationAction | null;
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onOpenParticipants: () => void;
  isLive?: boolean;
  meta?: string;
  /** 카드 빈 곳을 누르면(버튼 제외). 세션 상세 열기 */
  onPress?: () => void;
}> = ({
  session,
  todayKey,
  isJoined,
  pendingAction,
  error,
  onJoin,
  onLeave,
  onOpenParticipants,
  isLive = false,
  meta,
  onPress,
}) => (
  <div className="flex flex-col gap-2">
    <SessionBlueCard
      session={session}
      dDayLabel={isLive ? undefined : getSessionDDayLabel(session, todayKey)}
      trailing={isLive ? <LivePill /> : undefined}
      meta={meta ?? formatSessionTimePlace(session)}
      participantsLabel={`${session.participants.length}명 참여${isLive ? "" : " 예정"}`}
      onOpenParticipants={onOpenParticipants}
      onPress={onPress}
    >
      <ParticipationControls
        isJoined={isJoined}
        pendingAction={pendingAction}
        onJoin={onJoin}
        onLeave={onLeave}
      />
    </SessionBlueCard>
    <ParticipationError error={error} />
  </div>
);

/** 세션도 기록도 없는 날. 세션을 만들 수 있는 날(오늘·앞날)은 그 날짜로 세션 만들기를 열고, 지난 날은 문구만 둔다 */
export const EmptyDayCard: React.FC<{
  canCreateSession: boolean;
  onCreateSession: () => void;
}> = ({ canCreateSession, onCreateSession }) => (
  <div className="flex flex-col items-center gap-1 rounded-pk-lg bg-white px-4 pt-5 pb-4 text-center">
    <b className="text-pk-15 font-bold text-pk-ink">
      {canCreateSession ? "아직 세션이 없어요" : "이날은 경기 기록이 없어요"}
    </b>
    {canCreateSession && (
      <PkButton size="lg" fullWidth className="mt-3" onClick={onCreateSession}>
        <PlusIcon />
        세션 만들기
      </PkButton>
    )}
  </div>
);
