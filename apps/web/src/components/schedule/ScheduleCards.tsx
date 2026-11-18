import React from "react";
import { formatSessionTimePlace } from "@/components/home/sessionTimeLabel";
import {
  BlueCardOutlineButton,
  BlueCardSolidButton,
  JoinedLabel,
  ParticipationControls,
  ParticipationError,
  type ParticipationAction,
  SessionBlueCard,
  SessionChip,
} from "@/components/session/SessionBlueCard";
import { LivePill } from "@/components/ui/Badges";
import { PkButton } from "@/components/ui/Button";
import { ChevronRightIcon } from "@/components/ui/Icons";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

/** 일정 탭 세션 칩 문구 */
const getSessionKindLabel = (session: Pick<MatchSessionDetailInfo, "kind">) =>
  session.kind === "regular" ? "정기 세션" : "회원 세션";

interface ParticipationProps {
  session: MatchSessionDetailInfo;
  isJoined: boolean;
  pendingAction: ParticipationAction | null;
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onOpenParticipants: () => void;
}

/**
 * 아직 끝나지 않은 세션 블루 카드. 홈 다음 세션 카드와 같은 모양이고,
 * 날짜는 바깥 날짜 제목이 보이므로 메타 줄은 시간·장소만이며 남은 날짜 문구는 없다
 */
export const UpcomingSessionCard: React.FC<ParticipationProps> = ({
  session,
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
      top={
        <div className="flex items-center gap-2">
          <SessionChip>{getSessionKindLabel(session)}</SessionChip>
        </div>
      }
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

/**
 * 오늘 진행 중 세션 블루 카드. 칩 오른쪽에 LIVE, 참여 중이면 "✓ 참여 중"(취소는 참여자 시트에서),
 * 아니면 참여하기. 카드 전체가 아니라 "진행 화면 보기" 버튼만 홈 탭(진행 화면)으로 간다
 */
export const LiveSessionCard: React.FC<
  Omit<ParticipationProps, "onLeave"> & { onOpenLive: () => void }
> = ({
  session,
  isJoined,
  pendingAction,
  error,
  onJoin,
  onOpenParticipants,
  onOpenLive,
}) => (
  <div className="flex flex-col gap-2">
    <SessionBlueCard
      session={session}
      top={
        <div className="flex items-center justify-between gap-2">
          <SessionChip>{getSessionKindLabel(session)}</SessionChip>
          <LivePill />
        </div>
      }
      meta={formatSessionTimePlace(session)}
      participantsLabel={`${session.participants.length}명 참여`}
      onOpenParticipants={onOpenParticipants}
    >
      {isJoined ? (
        <div className="flex min-h-11 items-center">
          <JoinedLabel />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-pk-15 font-bold">아직 참여하지 않았어요</span>
          <BlueCardOutlineButton onPress={onJoin} disabled={pendingAction !== null}>
            {pendingAction === "join" ? "참여하는 중…" : "참여하기"}
          </BlueCardOutlineButton>
        </div>
      )}
      <BlueCardSolidButton onPress={onOpenLive}>
        진행 화면 보기
        <ChevronRightIcon className="size-4 shrink-0" />
      </BlueCardSolidButton>
    </SessionBlueCard>
    <ParticipationError error={error} />
  </div>
);

const PlusIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** 세션도 기록도 없는 날. 지난 날은 세션을 만들 수 없으므로 문구만 보인다 */
export const EmptyDayCard: React.FC<{
  isPast: boolean;
  onCreateSession: () => void;
}> = ({ isPast, onCreateSession }) => (
  <div className="flex flex-col items-center gap-1 rounded-pk-lg bg-white px-4 pt-5 pb-4 text-center">
    <b className="text-pk-15 font-bold text-pk-ink">
      {isPast ? "세션도 경기 기록도 없어요" : "아직 세션도 경기 기록도 없어요"}
    </b>
    {isPast ? null : (
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
    )}
  </div>
);
