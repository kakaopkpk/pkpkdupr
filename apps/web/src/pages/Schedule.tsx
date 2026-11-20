import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addScheduleMonths } from "@pkpkdupr/shared/schedule";
import { kstDateKeyToDate, toKstDateKey } from "@pkpkdupr/shared/session";
import {
  RecordCardSkeleton,
  RecordMatchCard,
  RecordSessionCard,
} from "@/components/records/RecordCards";
import MonthCalendar from "@/components/schedule/MonthCalendar";
import { getCalendarMonthKeys, toMonthKey } from "@/components/schedule/monthGrid";
import {
  EmptyDayCard,
  UpcomingSessionCard,
} from "@/components/schedule/ScheduleCards";
import ParticipantsSheet from "@/components/session/ParticipantsSheet";
import { isSessionDateSelectable } from "@/components/session/SessionSchedulePicker";
import { LiveSessionCard } from "@/components/session/SessionBlueCard";
import { useSessionParticipation } from "@/components/session/useSessionParticipation";
import { TournamentRankCard } from "@/components/tournament/TournamentRankCard";
import { Section } from "@/components/ui/Section";
import { StateMessage } from "@/components/ui/StateMessage";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useDataVersion, useInvalidateData } from "@/context/DataSyncContext";
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
  fetchScheduleMonth,
  getScheduleDayEntries,
  mergeScheduleDayMarks,
  type ScheduleDayEntry,
  type ScheduleMonthInfo,
} from "@/lib/schedule";
import { getMatchPlayerIds } from "@/types/match";

const EMPTY_IDS: readonly string[] = [];
const LOAD_ERROR_MESSAGE = "일정을 불러오지 못했어요";
const SCHEDULE_DATA_KINDS = ["sessions", "matches"] as const;

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
  } = useAppNavigation();
  const dataVersion = useDataVersion(SCHEDULE_DATA_KINDS);
  const invalidateData = useInvalidateData();
  const invalidateSessions = useCallback(
    () => invalidateData(["sessions"]),
    [invalidateData],
  );
  const { registerPullToRefresh, registerTabReset } = useTabNavigation();
  const now = useMinuteClock();
  const todayKey = toKstDateKey(now);

  const [monthKey, setMonthKey] = useState(() => toMonthKey(todayKey));
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [months, setMonths] = useState<Record<string, MonthState>>({});

  // 비동기 요청이 끝난 시점에 최신 값을 읽기 위한 ref
  const dataVersionRef = useRef(dataVersion);
  dataVersionRef.current = dataVersion;
  // 달마다 마지막 요청 번호. 응답 때 다르면 버린다
  const requestIdsRef = useRef(new Map<string, number>());
  const requestSequenceRef = useRef(0);
  // 달마다 마지막으로 받기 시작한 기준(dataVersion·오늘). 같은 기준으로 받아 둔 달은 다시 받지 않는다
  const loadStampsRef = useRef(new Map<string, string>());

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
      // 실패한 달은 다시 보일 때 또 받는다
      loadStampsRef.current.delete(month);
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

  const selectedMonthKey = toMonthKey(selectedDateKey);
  // 달력은 앞뒤 달 판(그 판의 6주에 걸치는 ±2달 날짜까지)도 그리고, 아래 카드는 고른 날의 달로 그린다
  const neededMonthKeys = useMemo(
    () => [
      ...new Set([
        ...getCalendarMonthKeys(monthKey),
        selectedMonthKey,
      ]),
    ],
    [monthKey, selectedMonthKey],
  );
  const neededMonthKeysRef = useRef(neededMonthKeys);
  neededMonthKeysRef.current = neededMonthKeys;
  const monthKeyRef = useRef(monthKey);
  monthKeyRef.current = monthKey;
  const selectedMonthKeyRef = useRef(selectedMonthKey);
  selectedMonthKeyRef.current = selectedMonthKey;

  useEffect(() => {
    const stamp = `${dataVersion}:${todayKey}`;
    for (const month of neededMonthKeys) {
      if (loadStampsRef.current.get(month) === stamp) continue;
      loadStampsRef.current.set(month, stamp);
      void loadMonth(month);
    }
  }, [loadMonth, neededMonthKeys, dataVersion, todayKey]);

  useEffect(
    () =>
      registerPullToRefresh("schedule", () =>
        // 보는 달과 고른 날의 달만 기다리고, 옆 달은 뒤에서 받는다
        Promise.all(
          neededMonthKeysRef.current.map((month) =>
            loadMonth(
              month,
              month === monthKeyRef.current || month === selectedMonthKeyRef.current,
            ),
          ),
        ).then(() => undefined),
      ),
    [loadMonth, registerPullToRefresh],
  );

  /** 그 날을 고르고, 다른 달이면 그 달을 보인다 */
  const selectDate = useCallback((dateKey: string) => {
    setSelectedDateKey(dateKey);
    setMonthKey(toMonthKey(dateKey));
  }, []);

  const goToday = useCallback(() => selectDate(todayKey), [selectDate, todayKey]);

  // 일정 탭을 다시 누르면 이번 달·오늘로 되돌린다
  useEffect(
    () => registerTabReset("schedule", goToday),
    [goToday, registerTabReset],
  );

  const marks = useMemo(
    () =>
      mergeScheduleDayMarks(
        neededMonthKeys.flatMap((month) => months[month]?.data ?? []),
        playerId,
      ),
    [months, neededMonthKeys, playerId],
  );
  const monthState = months[selectedMonthKey];
  const data = monthState?.data ?? null;
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
    dataVersion,
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
      onCreated: (session) => selectDate(session.dateKey),
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
            onPress={() => openSessionReport(entry.session.id)}
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
      case "tournament-result":
        return (
          <TournamentRankCard
            key={getRecordItemKey(entry.item)}
            session={entry.session}
            mine={entry.item.mine}
            onPress={() => openSessionReport(entry.session.id)}
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
          onRetry={() => void loadMonth(selectedMonthKey)}
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
            canCreateSession={isSessionDateSelectable(selectedDateKey, todayKey)}
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
          onSelectDate={selectDate}
          onChangeMonth={(step) => setMonthKey(addScheduleMonths(monthKey, step))}
          onGoToday={goToday}
        />
        <Section title={formatKstLongDate(kstDateKeyToDate(selectedDateKey))}>
          {renderDay()}
        </Section>
      </div>
      {participantsTarget ? (
        <ParticipantsSheet
          isOpen={isParticipantsOpen}
          tabKey="schedule"
          session={participantsTarget.session}
          lockedPlayerIds={participantsTarget.lockedPlayerIds}
          onClose={closeParticipants}
          onChanged={invalidateSessions}
        />
      ) : null}
    </>
  );
};

export default Schedule;
