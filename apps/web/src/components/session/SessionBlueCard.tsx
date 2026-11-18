import React from "react";
import { buttonPressClassName } from "@/components/ui/Button";
import { CheckIcon, ChevronRightIcon } from "@/components/ui/Icons";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import {
  getSessionKindShortLabel,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import PickleballIllustration from "./PickleballIllustration";

const MAX_VISIBLE_AVATARS = 4;
const AVATAR_SIZE = 28;
const PRIMARY_RING = "0 0 0 2px var(--color-pk-primary)";

export type ParticipationAction = "join" | "leave";

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
 * 세션 블루 카드 틀: 첫 줄(종류 칩 "정기"/"회원" → 남은 날 → 오른쪽 끝 trailing) → 이름·메타
 * → 참여자 줄(누르면 참여자 시트) → children(버튼, 없으면 참여자 줄로 끝난다). 오른쪽 위에 피클볼 장식이 걸친다.
 * 홈 다음 세션·진행 중 세션 카드와 일정 탭 세션 카드가 같이 쓴다
 */
export const SessionBlueCard: React.FC<{
  session: MatchSessionDetailInfo;
  /** "D-1" | "D-Day". 진행 중 세션은 없다 */
  dDayLabel?: string;
  /** 첫 줄 오른쪽 끝(LIVE 등) */
  trailing?: React.ReactNode;
  meta: string;
  /** "9명 참여 예정" | "9명 참여" */
  participantsLabel: string;
  onOpenParticipants: () => void;
  children?: React.ReactNode;
  className?: string;
}> = ({
  session,
  dDayLabel,
  trailing,
  meta,
  participantsLabel,
  onOpenParticipants,
  children,
  className,
}) => (
  <article
    className={cx(
      "relative overflow-hidden rounded-pk-lg bg-pk-primary text-white",
      className,
    )}
  >
    <PickleballIllustration className="pointer-events-none absolute -top-[62px] -right-[54px]" />
    {/* 장식 위에 그려지도록 내용은 relative로 쌓는다 */}
    <div className="relative flex flex-col gap-4 px-5 pt-[22px] pb-5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/[0.18] px-2.5 py-[3px] text-pk-12 font-bold">
          {getSessionKindShortLabel(session.kind)}
        </span>
        {dDayLabel ? (
          <span className="text-pk-13 font-extrabold tabular-nums">
            {dDayLabel}
          </span>
        ) : null}
        {trailing ? <span className="ml-auto flex">{trailing}</span> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="truncate text-pk-26 font-extrabold tracking-[-0.02em]">
          {session.name}
        </h2>
        <span className="truncate text-pk-13 text-white/85 tabular-nums">
          {meta}
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenParticipants}
        className="-my-1.5 flex min-h-11 items-center gap-2.5 text-left active:opacity-80"
      >
        <ParticipantAvatars participants={session.participants} />
        <span className="inline-flex items-center gap-0.5 text-pk-13 font-bold text-white/90 tabular-nums">
          {participantsLabel}
          <ChevronRightIcon className="size-3.5 shrink-0" />
        </span>
      </button>
      {children}
    </div>
  </article>
);

/** 블루 카드 위 큰 버튼(52px) 공통 틀 */
const blueCardButtonClassName = cx(
  "flex h-[52px] items-center rounded-pk-sm disabled:opacity-60",
  buttonPressClassName,
);

/** 블루 카드 위 흰 바탕·블루 글자 큰 버튼(참여하기·진행 화면 보기) */
export const BlueCardSolidButton: React.FC<{
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onPress, disabled, children }) => (
  <button
    type="button"
    onClick={onPress}
    disabled={disabled}
    className={cx(
      blueCardButtonClassName,
      "justify-center gap-1 bg-white text-pk-15 font-extrabold text-pk-primary",
    )}
  >
    {children}
  </button>
);

/**
 * 참여 중이면 "✓ 참여 중 … 취소" 버튼 하나(누르면 참여 취소), 아니면 참여하기.
 * 요청 중에는 버튼을 막고 진행 문구를 보인다
 */
export const ParticipationControls: React.FC<{
  isJoined: boolean;
  pendingAction: ParticipationAction | null;
  onJoin: () => void;
  onLeave: () => void;
}> = ({ isJoined, pendingAction, onJoin, onLeave }) => {
  const isPending = pendingAction !== null;
  if (!isJoined) {
    return (
      <BlueCardSolidButton onPress={onJoin} disabled={isPending}>
        {pendingAction === "join" ? "참여하는 중…" : "참여하기"}
      </BlueCardSolidButton>
    );
  }
  const isLeaving = pendingAction === "leave";
  return (
    <button
      type="button"
      onClick={onLeave}
      disabled={isPending}
      aria-label={isLeaving ? undefined : "참여 중, 누르면 참여 취소"}
      className={cx(
        blueCardButtonClassName,
        "justify-between gap-2 bg-white/[0.14] px-4 text-white",
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-pk-15 font-extrabold">
        <CheckIcon />
        참여 중
      </span>
      <span className="text-pk-13 font-bold text-white/80">
        {isLeaving ? "취소하는 중…" : "취소"}
      </span>
    </button>
  );
};

/** 카드 아래 참여 변경 오류 문구 */
export const ParticipationError: React.FC<{ error: string | null }> = ({
  error,
}) =>
  error ? (
    <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
      {error}
    </p>
  ) : null;
