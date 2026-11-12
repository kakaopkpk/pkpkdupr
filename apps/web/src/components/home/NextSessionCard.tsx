import React from "react";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";
import { getSessionChipLabel, getSessionTimeLabel } from "./sessionTimeLabel";

const MAX_VISIBLE_AVATARS = 4;
const AVATAR_SIZE = 28;
const PRIMARY_RING = "0 0 0 2px var(--color-pk-primary)";

export type ParticipationAction = "join" | "leave";

const CheckIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** 블루 카드 위 참여자 아바타 최대 4개 + "+N" */
const ParticipantAvatars: React.FC<{
  participants: MatchSessionDetailInfo["participants"];
}> = ({ participants }) => {
  const visible = participants.slice(0, MAX_VISIBLE_AVATARS);
  const restCount = participants.length - visible.length;

  return (
    <span aria-hidden="true" className="inline-flex">
      {visible.map((participant, index) => (
        <span
          key={participant.id}
          className={cx("inline-flex rounded-full", index > 0 && "-ml-1.5")}
          style={{ boxShadow: PRIMARY_RING }}
        >
          <PlayerAvatar player={participant} size={AVATAR_SIZE} />
        </span>
      ))}
      {restCount > 0 ? (
        <span
          className="-ml-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/[0.22] text-pk-12 font-bold tabular-nums"
          style={{ boxShadow: PRIMARY_RING }}
        >
          +{restCount}
        </span>
      ) : null}
    </span>
  );
};

/**
 * 다음 세션 블루 카드(오늘 세션 전·세션 없는 날). 참여하기/참여 취소는 나만 바꾸고,
 * "N명 참여 예정"을 누르면 참여자 시트가 열린다.
 */
const NextSessionCard: React.FC<{
  session: MatchSessionDetailInfo;
  todayKey: string;
  now: Date;
  isJoined: boolean;
  /** 진행 중인 참여 변경. 끝날 때까지 버튼을 막는다 */
  pendingAction: ParticipationAction | null;
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onOpenParticipants: () => void;
}> = ({
  session,
  todayKey,
  now,
  isJoined,
  pendingAction,
  error,
  onJoin,
  onLeave,
  onOpenParticipants,
}) => {
  const isPending = pendingAction !== null;

  return (
    <div className="flex flex-col gap-2">
      <article className="flex flex-col gap-3.5 rounded-pk-lg bg-pk-primary p-5 text-white">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/[0.18] px-2.5 py-[3px] text-pk-12 font-bold">
            {getSessionChipLabel(session)}
          </span>
          <span className="text-pk-13 text-white/85 tabular-nums">
            {getSessionTimeLabel(session, todayKey, now)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-pk-22 font-extrabold tracking-[-0.02em]">
            {session.name}
          </h2>
          <span className="truncate text-pk-13 text-white/85">
            {session.location}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenParticipants}
          className="-my-1.5 flex min-h-11 items-center justify-between gap-3 text-left active:opacity-80"
        >
          <ParticipantAvatars participants={session.participants} />
          <span className="text-pk-15 font-bold tabular-nums">
            {session.participants.length}명 참여 예정
          </span>
        </button>
        {isJoined ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-pk-15 font-bold">
              <CheckIcon />
              참여 중
            </span>
            <button
              type="button"
              onClick={onLeave}
              disabled={isPending}
              className="inline-flex h-11 items-center rounded-pk-sm border-[1.5px] border-white/50 px-4 text-pk-15 font-bold text-white active:opacity-80 disabled:opacity-60"
            >
              {pendingAction === "leave" ? "취소하는 중…" : "참여 취소"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={isPending}
            className="flex h-[52px] items-center justify-center rounded-pk-sm bg-white text-pk-15 font-extrabold text-pk-primary active:opacity-80 disabled:opacity-60"
          >
            {pendingAction === "join" ? "참여하는 중…" : "참여하기"}
          </button>
        )}
      </article>
      {error ? (
        <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default NextSessionCard;
