import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Switch } from "@heroui/react";
import BottomSheet from "@/components/BottomSheet";
import CopyableId from "@/components/CopyableId";
import DetailPageHeader from "@/components/DetailPageHeader";
import Match, { type MatchInfo } from "@/components/Match";
import MemberMultiSelectSheetBody from "@/components/MemberMultiSelectSheetBody";
import RecordMatchDrawerBody from "@/components/RecordMatchDrawerBody";
import SessionCard, { type SessionCardSession } from "@/components/SessionCard";
import SkeletonBlock from "@/components/SkeletonBlock";
import TabPanelStatus from "@/components/TabPanelStatus";
import UserChip from "@/components/UserChip";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import {
  addMatchSessionParticipant,
  isSessionParticipant,
  removeMatchSessionParticipant,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";

interface SessionDetailProps {
  /** 상세를 받기 전에도 헤더를 그릴 수 있는 피드 요약 또는 오늘 세션 응답 */
  session: SessionCardSession;
  /** GET /api/match-sessions/:sessionId 응답 */
  detail: MatchSessionDetailInfo | null;
  isDetailLoading: boolean;
  detailError: string | null;
  matches: MatchInfo[];
  currentPlayerId?: string;
  isLoading: boolean;
  error: string | null;
  isOnline?: boolean;
  onRetry: () => void;
  onPressMatch: (match: MatchInfo) => void;
  /** 참여자를 바꾼 뒤 서버 상태(세션 상세·오늘 세션)를 다시 읽는다 */
  onParticipantsChanged?: () => Promise<void>;
  /** 세션 경기 기록 시트에서 저장할 때마다 호출한다 */
  onMatchRecorded?: (match: MatchInfo) => void;
  /** 있고 세션이 isToday면 "추천 매칭" 버튼을 보인다 */
  onOpenRecommendation?: (session: MatchSessionDetailInfo) => void;
}

const SESSION_SHEET_LAYER = 70;
const PARTICIPANT_SKELETON_COUNT = 4;

const sectionTitleClassName =
  "px-1 text-[clamp(1rem,4.5cqw,1.25rem)] font-semibold tracking-wide text-pkpk-sub-title";

const SessionMatchListSkeleton: React.FC = () => (
  <div
    className="flex flex-col gap-3"
    role="status"
    aria-label="세션 경기 목록 로딩 중"
  >
    {Array.from({ length: 2 }, (_, index) => (
      <Card key={index} className="rounded-3xl bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <SkeletonBlock className="size-10 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-3 w-44 max-w-full" />
            </div>
          </div>
          <SkeletonBlock className="h-5 w-10" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <SkeletonBlock className="h-11" />
          <SkeletonBlock className="h-11" />
        </div>
      </Card>
    ))}
  </div>
);

const SessionDetail: React.FC<SessionDetailProps> = ({
  session,
  detail,
  isDetailLoading,
  detailError,
  matches,
  currentPlayerId,
  isLoading,
  error,
  isOnline = true,
  onRetry,
  onPressMatch,
  onParticipantsChanged,
  onMatchRecorded,
  onOpenRecommendation,
}) => {
  const sessionId = session.id;
  const { closeDepth, pushDepth, selectedTab } = useTabNavigation();
  const [isMyMatchOnly, setIsMyMatchOnly] = useState(false);
  const [isParticipantSheetOpen, setIsParticipantSheetOpen] = useState(false);
  const [isRecordSheetOpen, setIsRecordSheetOpen] = useState(false);
  // 시트를 열 때마다 본문을 리마운트해 최신 참여자·빈 기록으로 시작한다
  const [sheetKey, setSheetKey] = useState(0);
  const [isTogglingJoin, setIsTogglingJoin] = useState(false);
  const [participantError, setParticipantError] = useState<string | null>(
    null,
  );
  const isMatchesLoading = useMinimumLoading(isLoading);
  const isParticipantsLoading = useMinimumLoading(isDetailLoading && !detail);
  const participantSheetDepthId = `session-participants-sheet:${sessionId}`;
  const recordSheetDepthId = `session-record-sheet:${sessionId}`;
  // 지난 세션은 읽기 전용이다
  const isEditable = !!detail?.isToday;
  const isJoined = !!detail && isSessionParticipant(detail, currentPlayerId);
  const headerSession: SessionCardSession = detail
    ? { ...detail, status: session.status }
    : session;
  const displayedMatches = useMemo(
    () =>
      isMyMatchOnly && currentPlayerId
        ? matches.filter((match) =>
            match.teams.some((team) =>
              team.players.some((player) => player.id === currentPlayerId),
            ),
          )
        : matches,
    [currentPlayerId, isMyMatchOnly, matches],
  );

  useEffect(() => {
    setIsParticipantSheetOpen(false);
    setIsRecordSheetOpen(false);
    setParticipantError(null);
  }, [sessionId]);

  const openSheet = (
    depthId: string,
    setOpen: (isOpen: boolean) => void,
  ) => {
    if (!isEditable || !isOnline) return;

    pushDepth("home", {
      id: depthId,
      kind: "bottom-sheet",
      onClose: () => setOpen(false),
    });
    setSheetKey((key) => key + 1);
    setOpen(true);
  };

  const closeSheet = (
    depthId: string,
    setOpen: (isOpen: boolean) => void,
  ) => {
    if (!closeDepth("home", depthId)) setOpen(false);
  };

  const openParticipantSheet = () =>
    openSheet(participantSheetDepthId, setIsParticipantSheetOpen);
  const closeParticipantSheet = () =>
    closeSheet(participantSheetDepthId, setIsParticipantSheetOpen);
  const openRecordSheet = () =>
    openSheet(recordSheetDepthId, setIsRecordSheetOpen);
  const closeRecordSheet = () =>
    closeSheet(recordSheetDepthId, setIsRecordSheetOpen);

  const refreshParticipants = async () => {
    // 반영은 됐는데 다시 읽기만 실패하면 화면이 이전 참여 상태로 남으므로 알린다
    await onParticipantsChanged?.().catch(() => {
      const refreshError =
        "최신 참여자 정보를 불러오지 못했어요. 당겨서 새로고침해 주세요.";
      setParticipantError((prev) =>
        prev ? `${prev} ${refreshError}` : refreshError,
      );
    });
  };

  /** 바뀐 사람만 한 명씩 반영한다. 일부가 실패해도 나머지는 계속 반영하고 서버 상태로 다시 읽는다 */
  const saveParticipants = async (selectedIds: string[]) => {
    if (!detail) return;

    const currentIds = new Set(detail.participants.map((member) => member.id));
    const selectedIdSet = new Set(selectedIds);
    const changes = [
      ...selectedIds
        .filter((id) => !currentIds.has(id))
        .map((id) => () => addMatchSessionParticipant(detail.id, id)),
      ...[...currentIds]
        .filter((id) => !selectedIdSet.has(id))
        .map((id) => () => removeMatchSessionParticipant(detail.id, id)),
    ];
    const failures: string[] = [];

    for (const change of changes) {
      try {
        await change();
      } catch (err) {
        failures.push(
          err instanceof Error ? err.message : "참여자를 반영하지 못했어요.",
        );
      }
    }

    setParticipantError(
      failures.length > 0
        ? `${changes.length}건 중 ${failures.length}건을 반영하지 못했어요. ${failures[0]}`
        : null,
    );
    closeParticipantSheet();
    await refreshParticipants();
  };

  const toggleJoin = async () => {
    if (!detail || !currentPlayerId || isTogglingJoin) return;

    setIsTogglingJoin(true);
    setParticipantError(null);
    try {
      if (isJoined) {
        await removeMatchSessionParticipant(detail.id, currentPlayerId);
      } else {
        await addMatchSessionParticipant(detail.id, currentPlayerId);
      }
    } catch (err) {
      setParticipantError(
        err instanceof Error ? err.message : "참여 상태를 바꾸지 못했어요.",
      );
    } finally {
      await refreshParticipants();
      setIsTogglingJoin(false);
    }
  };

  let participantContent: React.ReactNode;
  if (isParticipantsLoading) {
    participantContent = (
      <div
        className="flex flex-wrap gap-2"
        role="status"
        aria-label="참여자 로딩 중"
      >
        {Array.from({ length: PARTICIPANT_SKELETON_COUNT }, (_, index) => (
          <SkeletonBlock key={index} className="h-6 w-24 rounded-full" />
        ))}
      </div>
    );
  } else if (!detail) {
    participantContent = detailError ? (
      <div className="flex flex-col gap-3">
        <TabPanelStatus message={detailError} tone="error" />
        <Button
          type="button"
          className="app-action-button w-full rounded-2xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          onPress={onRetry}
        >
          다시 시도
        </Button>
      </div>
    ) : null;
  } else if (detail.participants.length === 0) {
    participantContent = (
      <p className="text-sm text-pkpk-sub-font">아직 참여자가 없어요.</p>
    );
  } else {
    participantContent = (
      <div className="flex flex-wrap gap-x-2 gap-y-2.5 pt-1">
        {detail.participants.map((member) => (
          <UserChip
            key={member.id}
            player={member}
            isMe={member.id === currentPlayerId}
            chipWidthClass="w-[6.6rem]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <DetailPageHeader title="Session Detail" tabKey="home" />
      <div className="p-2">
        <div className="mx-auto flex w-full flex-col gap-3">
          <SessionCard
            session={headerSession}
            headerRightContent={
              <div className="flex w-24 items-center gap-1.5">
                <span className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide text-pkpk-sub-font">
                  ID
                </span>
                <CopyableId
                  label="Session ID"
                  value={sessionId}
                  showLabel={false}
                  truncate={false}
                />
              </div>
            }
            showMatchCount={false}
            showChevron={false}
          />

          <section className="flex flex-col gap-1.5">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <p className={sectionTitleClassName}>
                참여자
                {detail ? (
                  <span className="ml-1 text-sm font-medium text-pkpk-sub-font">
                    {detail.participants.length}명
                  </span>
                ) : null}
              </p>
              {isEditable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-2xl text-[#409eff]"
                  isDisabled={!isOnline || isTogglingJoin}
                  onPress={openParticipantSheet}
                >
                  참여자 편집
                </Button>
              ) : null}
            </div>
            <Card className="rounded-xl border border-pkpk-sub-bg/30 bg-white/95 p-3">
              {participantContent}
            </Card>
            {participantError ? (
              <p className="px-1 text-xs font-medium text-error" role="alert">
                {participantError}
              </p>
            ) : null}
            {detail && isEditable ? (
              <div className="mt-1.5 flex gap-2">
                <Button
                  size="sm"
                  aria-pressed={isJoined}
                  className={`app-action-button flex-1 rounded-2xl font-semibold ${
                    isJoined
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-[#409eff] text-white"
                  } disabled:bg-slate-200 disabled:text-slate-400`}
                  isDisabled={!isOnline || !currentPlayerId || isTogglingJoin}
                  onPress={() => void toggleJoin()}
                >
                  {isTogglingJoin ? "처리 중…" : isJoined ? "참여 중" : "참여하기"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="app-action-button flex-1 rounded-2xl font-semibold text-[#409eff]"
                  isDisabled={!isOnline}
                  onPress={openRecordSheet}
                >
                  경기 기록
                </Button>
                {onOpenRecommendation ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="app-action-button flex-1 rounded-2xl font-semibold text-pkpk-primary-bg"
                    isDisabled={!isOnline}
                    onPress={() => onOpenRecommendation(detail)}
                  >
                    추천 매칭
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <p className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-main-font">
              Matches
            </p>
            <Switch
              aria-label="내경기만 보기"
              className="shrink-0"
              isSelected={isMyMatchOnly}
              isDisabled={!currentPlayerId}
              onChange={setIsMyMatchOnly}
              size="sm"
              style={
                {
                  "--switch-control-bg": "#d1d5db",
                  "--switch-control-bg-hover": "#cbd5e1",
                  "--switch-control-bg-checked": "#3b52cc",
                  "--switch-control-bg-checked-hover": "#2d42a8",
                } as React.CSSProperties
              }
            >
              <Switch.Content className="-mx-2 -my-1 min-h-11 gap-2 rounded-full px-2 py-1 text-pkpk-accent-font touch-manipulation">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span className="text-sm font-bold leading-none text-pkpk-primary-bg">
                  내경기
                </span>
              </Switch.Content>
            </Switch>
          </div>
          <div>
            {isMatchesLoading ? (
              <SessionMatchListSkeleton />
            ) : error ? (
              <div className="flex flex-col gap-3">
                <TabPanelStatus message={error} tone="error" />
                <Button
                  type="button"
                  className="app-action-button w-full rounded-2xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  onPress={onRetry}
                >
                  다시 시도
                </Button>
              </div>
            ) : displayedMatches.length === 0 ? (
              <TabPanelStatus
                message={
                  isMyMatchOnly
                    ? "이 세션에 표시할 내 경기가 없어요."
                    : "이 세션에 표시할 경기가 없어요."
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {displayedMatches.map((match) => (
                  <Match
                    key={match.id}
                    match={match}
                    currentPlayerId={currentPlayerId}
                    onPress={onPressMatch}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
        </div>
      </div>
      {detail ? (
        <>
          <BottomSheet
            isOpen={isParticipantSheetOpen}
            isActive={selectedTab === "home"}
            onOpenChange={(isOpen) =>
              isOpen ? openParticipantSheet() : closeParticipantSheet()
            }
            ariaLabel="참여자 편집"
            layer={SESSION_SHEET_LAYER}
          >
            <MemberMultiSelectSheetBody
              key={sheetKey}
              title="참여자 편집"
              initialSelectedIds={detail.participants.map(
                (member) => member.id,
              )}
              currentPlayerId={currentPlayerId}
              isOnline={isOnline}
              onSave={saveParticipants}
              onCancel={closeParticipantSheet}
            />
          </BottomSheet>
          <BottomSheet
            isOpen={isRecordSheetOpen}
            isActive={selectedTab === "home"}
            onOpenChange={(isOpen) =>
              isOpen ? openRecordSheet() : closeRecordSheet()
            }
            ariaLabel="Record match"
            layer={SESSION_SHEET_LAYER}
            isFixedHeight
          >
            <RecordMatchDrawerBody
              key={sheetKey}
              isOnline={isOnline}
              sessionId={detail.id}
              sessionParticipantIds={detail.participants.map(
                (participant) => participant.id,
              )}
              defaultLocation={detail.location}
              onCancel={closeRecordSheet}
              onRecorded={(recordedMatch) => onMatchRecorded?.(recordedMatch)}
              onDone={closeRecordSheet}
            />
          </BottomSheet>
        </>
      ) : null}
    </div>
  );
};

export default SessionDetail;
