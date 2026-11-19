import React from "react";
import {
  ParticipationControls,
  type ParticipationAction,
  SessionBlueCard,
} from "@/components/session/SessionBlueCard";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";
import {
  getSessionDDayLabel,
  getSessionMetaLabel,
} from "@/components/session/sessionTimeLabel";

export interface NextSessionCardProps {
  session: MatchSessionDetailInfo;
  todayKey: string;
  isJoined: boolean;
  /** 진행 중인 참여 변경. 끝날 때까지 버튼을 막는다 */
  pendingAction: ParticipationAction | null;
  onJoin: () => void;
  onLeave: () => void;
  onOpenParticipants: () => void;
  /** 카드 빈 곳을 누르면(버튼 제외). 세션 상세 열기 */
  onPress: () => void;
  className?: string;
}

/**
 * 다가오는 세션 블루 카드(오늘 세션 전·세션 없는 날). 참여하기/참여 취소는 나만 바꾸고,
 * "N명 참여 예정"을 누르면 참여자 시트, 카드 빈 곳을 누르면 세션 상세가 열린다. 참여 변경 오류 문구는 카드 묶음 아래에 둔다
 */
const NextSessionCard: React.FC<NextSessionCardProps> = ({
  session,
  todayKey,
  isJoined,
  pendingAction,
  onJoin,
  onLeave,
  onOpenParticipants,
  onPress,
  className,
}) => (
  <SessionBlueCard
    session={session}
    className={className}
    dDayLabel={getSessionDDayLabel(session, todayKey)}
    meta={getSessionMetaLabel(session, todayKey)}
    participantsLabel={`${session.participants.length}명 참여 예정`}
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
);

export default NextSessionCard;
