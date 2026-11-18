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
import type { ParticipationAction } from "@/components/session/SessionBlueCard";
import { isSessionDateSelectable } from "@/components/session/SessionSchedulePicker";
import { getErrorMessage } from "@/components/session/saveError";
import { SectionLabel } from "@/components/ui/Section";
import { StateMessage } from "@/components/ui/StateMessage";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { getUserErrorMessage, isNetworkError } from "@/lib/errors";
import { formatKstLongDate } from "@/lib/format";
import {
  addMatchSessionParticipant,
  isSessionParticipant,
  type MatchSessionDetailInfo,
  removeMatchSessionParticipant,
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

const getMatchPlayerIds = (match: { teams: { players: { id: string }[] }[] }) =>
  match.teams.flatMap((team) => team.players.map((player) => player.id));

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
  const { registerPullToRefresh } = useTabNavigation();
  const { showSaveFailure } = useSystemNotice();
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
  const [participation, setParticipation] = useState<{
    sessionId: string;
    action: ParticipationAction;
    /** 성공 뒤 이 dataVersion 이상으로 새로 받은 데이터가 와야 버튼을 푼다. 요청 중이면 null */
    awaitVersion: number | null;
  } | null>(null);
  const [participationError, setParticipationError] = useState<{
    sessionId: string;
    message: string;
  } | null>(null);

  const loadedVersion = monthState?.loadedVersion ?? -1;
  useEffect(() => {
    if (
      participation?.awaitVersion != null &&
      loadedVersion >= participation.awaitVersion
    ) {
      setParticipation(null);
    }
  }, [loadedVersion, participation]);

  // 다른 날로 옮기면 이전 날의 오류 문구를 지운다
  useEffect(() => {
    setParticipationError(null);
  }, [selectedDateKey]);

  const changeParticipation = async (
    sessionId: string,
    action: ParticipationAction,
  ) => {
    if (!playerId || participation) return;

    const run = async () => {
      if (action === "join") {
        await addMatchSessionParticipant(sessionId, playerId);
      } else {
        await removeMatchSessionParticipant(sessionId, playerId);
      }
      // notifyDataChanged가 dataVersion을 1 올리고 그 값으로 다시 받는다.
      // 요청 중 다른 곳에서 올린 버전도 반영하도록 호출 직전의 최신 값을 기준으로 삼는다
      const awaitVersion = dataVersionRef.current + 1;
      notifyDataChanged();
      return awaitVersion;
    };

    setParticipation({ sessionId, action, awaitVersion: null });
    setParticipationError(null);
    try {
      const awaitVersion = await run();
      setParticipation({ sessionId, action, awaitVersion });
    } catch (err) {
      setParticipation(null);
      if (isNetworkError(err)) {
        showSaveFailure({
          onRetry: async () => {
            await run();
          },
        });
      } else {
        setParticipationError({
          sessionId,
          message: getErrorMessage(
            err,
            action === "join" ? "참여하지 못했어요." : "참여를 취소하지 못했어요.",
          ),
        });
      }
    }
  };

  const getParticipationProps = (session: MatchSessionDetailInfo) => ({
    session,
    isJoined: isSessionParticipant(session, playerId),
    pendingAction:
      participation?.sessionId === session.id ? participation.action : null,
    error:
      participationError?.sessionId === session.id
        ? participationError.message
        : null,
    onJoin: () => void changeParticipation(session.id, "join"),
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
            {...getParticipationProps(entry.session)}
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
            onLeave={() => void changeParticipation(entry.session.id, "leave")}
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
