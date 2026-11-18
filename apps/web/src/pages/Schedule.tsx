import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addScheduleMonths,
  getScheduleMonthDateKeyRange,
} from "@pkpkdupr/shared/schedule";
import { kstDateKeyToDate, toKstDateKey } from "@pkpkdupr/shared/session";
import {
  RecordCardSkeleton,
  RecordMatchCard,
  RecordSessionCard,
} from "@/components/records/RecordCards";
import MonthCalendar from "@/components/schedule/MonthCalendar";
import {
  EmptyDayCard,
  type EmptyDayKind,
  LiveSessionCard,
  UpcomingSessionCard,
} from "@/components/schedule/ScheduleCards";
import ParticipantsSheet from "@/components/session/ParticipantsSheet";
import { isSessionDateSelectable } from "@/components/session/SessionSchedulePicker";
import { useSessionParticipation } from "@/components/session/useSessionParticipation";
import { SectionLabel } from "@/components/ui/Section";
import { StateMessage } from "@/components/ui/StateMessage";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { getUserErrorMessage } from "@/lib/errors";
import { formatKstLongDate } from "@/lib/format";
import {
  isSessionParticipant,
  type MatchSessionDetailInfo,
} from "@/lib/matchSessions";
import { getRecordItemKey } from "@/lib/records";
import {
  buildScheduleDayMarks,
  fetchScheduleMonth,
  getScheduleDayEntries,
  type ScheduleDayEntry,
  type ScheduleDayMark,
  type ScheduleMonthInfo,
} from "@/lib/schedule";
import { getMatchPlayerIds } from "@/types/match";

const EMPTY_IDS: readonly string[] = [];
const EMPTY_MARKS: ReadonlyMap<string, ScheduleDayMark> = new Map();
const LOAD_ERROR_MESSAGE = "일정을 불러오지 못했어요";

interface MonthState {
  status: "loading" | "ready" | "error";
  data: ScheduleMonthInfo | null;
  error: string | null;
  /** 마지막으로 끝난 로드가 시작될 때의 dataVersion. 참여 변경 뒤 새 데이터 도착을 판단한다 */
  loadedVersion: number;
}

interface ParticipantsTarget {
  session: MatchSessionDetailInfo;
  lockedPlayerIds: readonly string[];
}

/** "2026-11-17" → "2026-11" */
const toMonthKey = (dateKey: string) => dateKey.slice(0, 7);

/** 달을 옮기면 오늘이 든 달은 오늘을, 아니면 그 달 1일을 고른다 */
const getDefaultDateKey = (monthKey: string, todayKey: string) =>
  toMonthKey(todayKey) === monthKey
    ? todayKey
    : getScheduleMonthDateKeyRange(monthKey).fromDateKey;

const getEmptyDayKind = (dateKey: string, todayKey: string): EmptyDayKind => {
  if (dateKey < todayKey) return "past";
  return isSessionDateSelectable(dateKey, todayKey) ? "creatable" : "out-of-range";
};

/**
 * 일정 탭: 위는 월 달력, 아래는 고른 날의 세션·기록 카드.
 * 아직 끝나지 않은 세션은 여기서 참여·참여 취소하고, 오늘 진행 중 세션은 홈 진행 화면으로 보낸다
 */
const Schedule: React.FC = () => {
  const { player } = useAuth();
  const playerId = player?.id;
  const live = useLiveSession();
  const {
    openMatchDetail,
    openSessionReport,
    openCreateSession,
    selectTab,
    notifyDataChanged,
    dataVersion,
  } = useAppNavigation();
  const { registerPullToRefresh, registerTabReset } = useTabNavigation();
  const now = useMinuteClock();
  const todayKey = toKstDateKey(now);

  const [monthKey, setMonthKey] = useState(() => toMonthKey(todayKey));
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [months, setMonths] = useState<Record<string, MonthState>>({});

  // 비동기 요청이 끝난 시점에 최신 값을 읽기 위한 ref
  const dataVersionRef = useRef(dataVersion);
  dataVersionRef.current = dataVersion;
  const monthKeyRef = useRef(monthKey);
  monthKeyRef.current = monthKey;
  // 달마다 마지막 요청 번호. 응답 때 다르면 버린다
  const requestIdsRef = useRef(new Map<string, number>());
  const requestSequenceRef = useRef(0);

  /** 그 달을 다시 받는다. 받아 둔 내용은 둔 채 바꾼다. rethrow면 실패를 던진다(당겨서 새로고침) */
  const loadMonth = useCallback(async (month: string, rethrow = false) => {
    const requestId = ++requestSequenceRef.current;
    requestIdsRef.current.set(month, requestId);
    const version = dataVersionRef.current;
    setMonths((current) =>
      current[month]
        ? current
        : {
            ...current,
            [month]: { status: "loading", data: null, error: null, loadedVersion: -1 },
          },
    );
    const isLatest = () => requestIdsRef.current.get(month) === requestId;
    try {
      const data = await fetchScheduleMonth(month);
      if (!isLatest()) return;
      setMonths((current) => ({
        ...current,
        [month]: { status: "ready", data, error: null, loadedVersion: version },
      }));
    } catch (error) {
      if (!isLatest()) return;
      setMonths((current) => ({
        ...current,
        [month]: {
          status: "error",
          data: current[month]?.data ?? null,
          error: getUserErrorMessage(error, LOAD_ERROR_MESSAGE),
          loadedVersion: version,
        },
      }));
      if (rethrow) throw error;
    }
  }, []);

  // 보는 달이 바뀌거나 데이터가 바뀌거나 날짜가 넘어가면 다시 받는다
  useEffect(() => {
    void loadMonth(monthKey);
  }, [loadMonth, monthKey, dataVersion, todayKey]);

  useEffect(
    () =>
      registerPullToRefresh("schedule", () =>
        loadMonth(monthKeyRef.current, true),
      ),
    [loadMonth, registerPullToRefresh],
  );

  const showMonth = (nextMonthKey: string, dateKey?: string) => {
    setMonthKey(nextMonthKey);
    setSelectedDateKey(dateKey ?? getDefaultDateKey(nextMonthKey, todayKey));
  };

  // 일정 탭을 다시 누르면 이번 달·오늘로 되돌린다
  const resetToTodayRef = useRef(() => {});
  resetToTodayRef.current = () => showMonth(toMonthKey(todayKey), todayKey);
  useEffect(
    () => registerTabReset("schedule", () => resetToTodayRef.current()),
    [registerTabReset],
  );

  const monthState = months[monthKey];
  const data = monthState?.data ?? null;
  const marks = useMemo(
    () => (data ? buildScheduleDayMarks(data, playerId) : EMPTY_MARKS),
    [data, playerId],
  );
  const liveSessionId = live.liveSession?.id ?? null;
  const entries = useMemo(
    () =>
      data ? getScheduleDayEntries(data, selectedDateKey, liveSessionId) : [],
    [data, liveSessionId, selectedDateKey],
  );

  // ── 참여자 시트 ─────────────────────────────────────
  const [participantsTarget, setParticipantsTarget] =
    useState<ParticipantsTarget | null>(null);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const closeParticipants = useCallback(() => setIsParticipantsOpen(false), []);
  // 진행 중 경기에 든 선수는 참여자 시트에서 뺄 수 없다
  const busyPlayerIds = useMemo(
    () => live.inProgressMatches.flatMap(getMatchPlayerIds),
    [live.inProgressMatches],
  );
  const openParticipants = (
    session: MatchSessionDetailInfo,
    lockedPlayerIds: readonly string[],
  ) => {
    setParticipantsTarget({ session, lockedPlayerIds });
    setIsParticipantsOpen(true);
  };

  // ── 참여·참여 취소 ─────────────────────────────────
  const participation = useSessionParticipation({
    playerId,
    loadedVersion: monthState?.loadedVersion ?? -1,
  });
  const { clearError: clearParticipationError } = participation;

  // 다른 날로 옮기면 이전 날의 오류 문구를 지운다
  useEffect(() => {
    clearParticipationError();
  }, [clearParticipationError, selectedDateKey]);

  const getParticipationProps = (session: MatchSessionDetailInfo) => ({
    session,
    isJoined: isSessionParticipant(session, playerId),
    pendingAction: participation.getPendingAction(session.id),
    error: participation.getError(session.id),
    onJoin: () => void participation.change(session.id, "join"),
    onLeave: () => void participation.change(session.id, "leave"),
  });

  const handleCreateSession = () =>
    openCreateSession({
      dateKey: selectedDateKey,
      // 만든 세션의 날을 보여 준다
      onCreated: (session) => showMonth(toMonthKey(session.dateKey), session.dateKey),
    });

  const renderEntry = (entry: ScheduleDayEntry) => {
    switch (entry.kind) {
      case "live":
        return (
          <LiveSessionCard
            key={`live:${entry.session.id}`}
            session={entry.session}
            onOpenParticipants={() =>
              openParticipants(entry.session, busyPlayerIds)
            }
            onOpenLive={() => selectTab("home")}
          />
        );
      case "upcoming":
        return (
          <UpcomingSessionCard
            key={`upcoming:${entry.session.id}`}
            {...getParticipationProps(entry.session)}
            todayKey={todayKey}
            onOpenParticipants={() => openParticipants(entry.session, EMPTY_IDS)}
          />
        );
      case "record-session":
        return (
          <RecordSessionCard
            key={getRecordItemKey(entry.item)}
            session={entry.item.session}
            mine={entry.item.mine}
            onPress={() => openSessionReport(entry.item.session.id)}
          />
        );
      case "record-match":
        return (
          <RecordMatchCard
            key={getRecordItemKey(entry.item)}
            match={entry.item.match}
            currentPlayerId={playerId}
            onPress={() => openMatchDetail(entry.item.match.id)}
          />
        );
    }
  };

  const renderDay = () => {
    if (!data) {
      return monthState?.status === "error" ? (
        <StateMessage
          kind="error"
          message={monthState.error ?? LOAD_ERROR_MESSAGE}
          onRetry={() => void loadMonth(monthKey)}
        />
      ) : (
        <div aria-busy="true" aria-label="불러오는 중">
          <RecordCardSkeleton />
        </div>
      );
    }
    return (
      <>
        {/* 다시 받기에 실패하면 이전 데이터를 둔 채 실패를 알린다 */}
        {monthState?.status === "error" ? (
          <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
            {monthState.error ?? LOAD_ERROR_MESSAGE}
          </p>
        ) : null}
        {entries.length > 0 ? (
          entries.map(renderEntry)
        ) : (
          <EmptyDayCard
            kind={getEmptyDayKind(selectedDateKey, todayKey)}
            onCreateSession={handleCreateSession}
          />
        )}
      </>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-2.5 px-4 pt-4 pb-6">
        <MonthCalendar
          monthKey={monthKey}
          todayKey={todayKey}
          selectedDateKey={selectedDateKey}
          marks={marks}
          onSelectDate={setSelectedDateKey}
          onPrevMonth={() => showMonth(addScheduleMonths(monthKey, -1))}
          onNextMonth={() => showMonth(addScheduleMonths(monthKey, 1))}
          onGoToday={() => showMonth(toMonthKey(todayKey), todayKey)}
        />
        <div className="mt-0.5">
          <SectionLabel>
            {formatKstLongDate(kstDateKeyToDate(selectedDateKey))}
          </SectionLabel>
        </div>
        {renderDay()}
      </div>
      {participantsTarget ? (
        <ParticipantsSheet
          isOpen={isParticipantsOpen}
          tabKey="schedule"
          session={participantsTarget.session}
          lockedPlayerIds={participantsTarget.lockedPlayerIds}
          onClose={closeParticipants}
          onChanged={notifyDataChanged}
        />
      ) : null}
    </>
  );
};

export default Schedule;
