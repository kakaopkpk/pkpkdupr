import React from "react";
import {
  formatSessionTimePlace,
  getSessionDDayLabel,
} from "@/components/session/sessionTimeLabel";
import { SESSION_DATE_OPTION_DAYS } from "@/components/session/SessionSchedulePicker";
import {
  ParticipationControls,
  ParticipationError,
  type ParticipationAction,
  SessionBlueCard,
} from "@/components/session/SessionBlueCard";
import { PkButton } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Icons";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

/**
 * 아직 끝나지 않은 세션 블루 카드. 홈 다음 세션 카드와 같은 모양이고,
 * 날짜는 바깥 날짜 제목이 보이므로 메타 줄은 시간·장소만이다
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
}> = ({
  session,
  todayKey,
  isJoined,
  pendingAction,
  error,
  onJoin,
  onLeave,
  onOpenParticipants,
}) => (
  <div className="flex flex-col gap-2">
    <SessionBlueCard
      session={session}
      dDayLabel={getSessionDDayLabel(session, todayKey)}
      meta={formatSessionTimePlace(session)}
      participantsLabel={`${session.participants.length}명 참여 예정`}
      onOpenParticipants={onOpenParticipants}
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


const DAYS_PER_WEEK = 7;

/** 빈 날에서 세션을 만들 수 있는지: 만들 수 있음 / 지난 날 / 세션 만들기 달력 범위(SESSION_DATE_OPTION_DAYS) 밖 */
export type EmptyDayKind = "creatable" | "past" | "out-of-range";

/** 세션도 기록도 없는 날. 만들 수 있는 날만 그 날짜로 세션 만들기를 연다 */
export const EmptyDayCard: React.FC<{
  kind: EmptyDayKind;
  onCreateSession: () => void;
}> = ({ kind, onCreateSession }) => (
  <div className="flex flex-col items-center gap-1 rounded-pk-lg bg-white px-4 pt-5 pb-4 text-center">
    <b className="text-pk-15 font-bold text-pk-ink">
      {kind === "past"
        ? "세션도 경기 기록도 없어요"
        : "아직 세션도 경기 기록도 없어요"}
    </b>
    {kind === "out-of-range" ? (
      <span className="text-pk-13 text-pk-sub">
        세션은 오늘부터 {SESSION_DATE_OPTION_DAYS / DAYS_PER_WEEK}주 안의 날에
        만들 수 있어요
      </span>
    ) : null}
    {kind === "creatable" ? (
      <>
        <span className="text-pk-13 text-pk-sub">
          세션을 만들면 다른 회원도 참여할 수 있어요
        </span>
        <PkButton
          size="lg"
          fullWidth
          className="mt-3"
          onClick={onCreateSession}
        >
          <PlusIcon />
          세션 만들기
        </PkButton>
      </>
    ) : null}
  </div>
);
