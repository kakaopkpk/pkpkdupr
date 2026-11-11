import React, { useState } from "react";
import { Button, Card } from "@heroui/react";
import { IoAdd, IoPeopleOutline } from "react-icons/io5";
import {
  REGULAR_SESSION_LOCATION,
  REGULAR_SESSION_NAME,
} from "@pkpkdupr/shared/session";
import AvatarGroup from "@/components/AvatarGroup";
import BottomSheet from "@/components/BottomSheet";
import CreateSessionSheetBody from "@/components/CreateSessionSheetBody";
import SkeletonBlock from "@/components/SkeletonBlock";
import { useTabNavigation } from "@/context/TabNavigationContext";
import {
  addMatchSessionParticipant,
  isSessionParticipant,
  openTodayRegularSession,
  removeMatchSessionParticipant,
  type MatchSessionDetailInfo,
  type TodayMatchSessionsInfo,
} from "@/lib/matchSessions";

interface TodaySessionSectionProps {
  today: TodayMatchSessionsInfo | null;
  isLoading: boolean;
  error: string | null;
  currentPlayerId?: string;
  isOnline: boolean;
  /** 참여·취소·정기 세션 열기 뒤 오늘 세션을 다시 읽는다 */
  onChanged: () => Promise<void>;
  onOpenSession: (session: MatchSessionDetailInfo) => void;
  /** 세션 만들기 시트가 닫힌 뒤 호출한다 */
  onSessionCreated: (session: MatchSessionDetailInfo) => void;
  /** 있으면 각 오늘 세션 카드에 "추천 매칭" 버튼을 보인다 */
  onOpenRecommendation?: (session: MatchSessionDetailInfo) => void;
}

const CREATE_SESSION_SHEET_DEPTH_ID = "create-session-sheet";
/** 아직 만들어지지 않은 정기 세션 카드의 진행 상태 키 */
const REGULAR_PLACEHOLDER_KEY = "regular-placeholder";
const MAX_VISIBLE_AVATARS = 6;

const kindBadgeClassName =
  "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[clamp(0.625rem,2.8vw,0.75rem)] font-semibold leading-6";

interface TodaySessionCardProps {
  name: string;
  location: string;
  isRegular: boolean;
  participants: MatchSessionDetailInfo["participants"];
  isJoined: boolean;
  isPending: boolean;
  isActionDisabled: boolean;
  onToggleJoin: () => void;
  onOpen?: () => void;
  onOpenRecommendation?: () => void;
}

const TodaySessionCard: React.FC<TodaySessionCardProps> = ({
  name,
  location,
  isRegular,
  participants,
  isJoined,
  isPending,
  isActionDisabled,
  onToggleJoin,
  onOpen,
  onOpenRecommendation,
}) => {
  const summary = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-pkpk-main-font">
            {name}
          </p>
          <p className="truncate text-xs font-medium text-pkpk-sub-font">
            {location}
          </p>
        </div>
        <span
          className={`${kindBadgeClassName} ${
            isRegular
              ? "bg-pkpk-primary-bg/10 text-pkpk-primary-bg"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {isRegular ? "정기" : "번개"}
        </span>
      </div>
      <div className="mt-3 flex min-h-9 items-center justify-between gap-3">
        <AvatarGroup
          items={participants.map((participant) => ({
            id: participant.id,
            avatarUrl: participant.avatarUrl,
            name: participant.username,
          }))}
          max={MAX_VISIBLE_AVATARS}
          size="session"
          ringClassName="ring-white"
        />
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium leading-none text-pkpk-primary-bg">
          <IoPeopleOutline className="size-4 [&_*]:stroke-[40]" />
          {participants.length}명 참여
        </span>
      </div>
    </>
  );

  return (
    <Card className="w-full rounded-3xl border border-pkpk-primary-bg bg-white p-3">
      {onOpen ? (
        <button
          type="button"
          aria-label={`${name} 세션 상세 보기`}
          className="w-full text-left"
          onClick={onOpen}
        >
          {summary}
        </button>
      ) : (
        summary
      )}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          aria-pressed={isJoined}
          className={`app-action-button flex-1 rounded-2xl font-semibold ${
            isJoined
              ? "bg-emerald-50 text-emerald-700"
              : "bg-[#409eff] text-white"
          } disabled:bg-slate-200 disabled:text-slate-400`}
          isDisabled={isActionDisabled || isPending}
          onPress={onToggleJoin}
        >
          {isPending ? "처리 중…" : isJoined ? "참여 중" : "참여하기"}
        </Button>
        {onOpenRecommendation ? (
          <Button
            size="sm"
            variant="secondary"
            className="app-action-button flex-1 rounded-2xl font-semibold text-pkpk-primary-bg"
            isDisabled={isActionDisabled}
            onPress={onOpenRecommendation}
          >
            추천 매칭
          </Button>
        ) : null}
      </div>
    </Card>
  );
};

const TodaySessionSection: React.FC<TodaySessionSectionProps> = ({
  today,
  isLoading,
  error,
  currentPlayerId,
  isOnline,
  onChanged,
  onOpenSession,
  onSessionCreated,
  onOpenRecommendation,
}) => {
  const { closeDepth, pushDepth, selectedTab } = useTabNavigation();
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  // 시트를 열 때마다 입력을 초기화한다
  const [createSheetKey, setCreateSheetKey] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sessions = today?.sessions ?? [];
  const showRegularPlaceholder =
    !!today?.regularSessionOpen &&
    !sessions.some((session) => session.kind === "regular");
  const hasCards = sessions.length > 0 || showRegularPlaceholder;
  const isActionDisabled = !isOnline || !currentPlayerId || !!pendingKey;

  const openCreateSheet = () => {
    if (!isOnline) return;

    pushDepth("match", {
      id: CREATE_SESSION_SHEET_DEPTH_ID,
      kind: "bottom-sheet",
      onClose: () => setIsCreateSheetOpen(false),
    });
    setCreateSheetKey((key) => key + 1);
    setIsCreateSheetOpen(true);
  };

  const closeCreateSheet = (afterClose?: () => void) => {
    if (!closeDepth("match", CREATE_SESSION_SHEET_DEPTH_ID, afterClose)) {
      setIsCreateSheetOpen(false);
      afterClose?.();
    }
  };

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (pendingKey) return;

    setPendingKey(key);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "요청을 처리하지 못했어요.",
      );
    } finally {
      // 성공·실패 모두 서버 상태로 다시 맞춘다
      await onChanged().catch(() => {});
      setPendingKey(null);
    }
  };

  const toggleJoin = (session: MatchSessionDetailInfo) => {
    if (!currentPlayerId) return;

    const isJoined = isSessionParticipant(session, currentPlayerId);
    void runAction(session.id, () =>
      isJoined
        ? removeMatchSessionParticipant(session.id, currentPlayerId)
        : addMatchSessionParticipant(session.id, currentPlayerId),
    );
  };

  const joinRegularPlaceholder = () => {
    if (!currentPlayerId) return;

    void runAction(REGULAR_PLACEHOLDER_KEY, async () => {
      const session = await openTodayRegularSession();
      await addMatchSessionParticipant(session.id, currentPlayerId);
    });
  };

  const createButton = (
    <Button
      size="sm"
      variant={hasCards ? "secondary" : "outline"}
      className={`app-action-button rounded-2xl font-semibold text-pkpk-primary-bg ${
        hasCards ? "" : "w-full"
      }`}
      isDisabled={!isOnline}
      onPress={openCreateSheet}
    >
      <IoAdd aria-hidden="true" className="size-4" />
      세션 만들기
    </Button>
  );

  let content: React.ReactNode;
  if (isLoading && !today) {
    content = (
      <div role="status" aria-label="오늘 세션 로딩 중">
        <SkeletonBlock className="h-36 w-full rounded-3xl" />
      </div>
    );
  } else if (!hasCards) {
    content = createButton;
  } else {
    content = (
      <>
        <div className="flex items-center justify-between gap-3">
          <p className="px-1 text-[clamp(1rem,4.5cqw,1.25rem)] font-semibold tracking-wide text-pkpk-sub-title">
            오늘 세션
          </p>
          {createButton}
        </div>
        {showRegularPlaceholder ? (
          <TodaySessionCard
            name={REGULAR_SESSION_NAME}
            location={REGULAR_SESSION_LOCATION}
            isRegular
            participants={[]}
            isJoined={false}
            isPending={pendingKey === REGULAR_PLACEHOLDER_KEY}
            isActionDisabled={isActionDisabled}
            onToggleJoin={joinRegularPlaceholder}
          />
        ) : null}
        {sessions.map((session) => (
          <TodaySessionCard
            key={session.id}
            name={session.name}
            location={session.location}
            isRegular={session.kind === "regular"}
            participants={session.participants}
            isJoined={isSessionParticipant(session, currentPlayerId)}
            isPending={pendingKey === session.id}
            isActionDisabled={isActionDisabled}
            onToggleJoin={() => toggleJoin(session)}
            onOpen={() => onOpenSession(session)}
            onOpenRecommendation={
              onOpenRecommendation
                ? () => onOpenRecommendation(session)
                : undefined
            }
          />
        ))}
      </>
    );
  }

  return (
    <section aria-label="오늘 세션" className="flex flex-col gap-2">
      {content}
      {error && !today ? (
        <p className="px-1 text-xs font-medium text-error" role="alert">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p className="px-1 text-xs font-medium text-error" role="alert">
          {actionError}
        </p>
      ) : null}
      <BottomSheet
        isOpen={isCreateSheetOpen}
        isActive={selectedTab === "match"}
        onOpenChange={(isOpen) => {
          if (isOpen) {
            openCreateSheet();
            return;
          }
          closeCreateSheet();
        }}
        ariaLabel="세션 만들기"
      >
        <CreateSessionSheetBody
          key={createSheetKey}
          isOnline={isOnline}
          onCancel={() => closeCreateSheet()}
          onCreated={(session) =>
            closeCreateSheet(() => onSessionCreated(session))
          }
        />
      </BottomSheet>
    </section>
  );
};

export default TodaySessionSection;
