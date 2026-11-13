import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchInfo } from "@/types/match";
import TabPanelStatus from "@/components/TabPanelStatus";
import {
  SessionChips,
  SessionChipsSkeleton,
  SessionReportSkeleton,
  SessionSummary,
  TopRiserCard,
} from "@/components/records/SessionReportParts";
import { Card } from "@/components/ui/Card";
import { TabHeader } from "@/components/ui/Headers";
import { MatchRow } from "@/components/ui/MatchRow";
import { SectionLabel } from "@/components/ui/Section";
import {
  SegmentedControl,
  SegmentSwitchFade,
} from "@/components/ui/SegmentedControl";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useTabNavigation } from "@/context/TabNavigationContext";
import { apiFetch } from "@/lib/api";
import {
  fetchSessionHistory,
  fetchSessionReport,
  type MatchSessionHistoryInfo,
  type MatchSessionReportInfo,
} from "@/lib/rankings";

type RecordsMode = "all" | "mine";

const MODE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "mine", label: "내 경기" },
] as const;

const SESSION_HISTORY_LIMIT = 30;

type LoadStatus = "loading" | "ready" | "error";

const fetchSessionMatches = async (sessionId: string) => {
  const res = await apiFetch(
    `/api/match-sessions/${encodeURIComponent(sessionId)}/matches`,
  );
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errorData.error || "세션 경기를 불러오지 못했어요.");
  }
  return (await res.json()) as MatchInfo[];
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const isPlayerInMatch = (match: MatchInfo, playerId: string) =>
  match.teams.some((team) =>
    team.players.some((player) => player.id === playerId),
  );

/** 기록 탭: 세션 날짜 칩으로 세션을 골라 요약·세션 지배자·완료 경기를 본다 */
const Records: React.FC = () => {
  const { player } = useAuth();
  const playerId = player?.id;
  const { openMatchDetail, sessionReportRequest, dataVersion } =
    useAppNavigation();
  const { registerPullToRefresh } = useTabNavigation();

  const [mode, setMode] = useState<RecordsMode>("all");
  const [isListFading, setIsListFading] = useState(false);
  const [sessions, setSessions] = useState<MatchSessionHistoryInfo[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<LoadStatus>("loading");
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<MatchSessionReportInfo | null>(null);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("loading");
  const [detailError, setDetailError] = useState<string | null>(null);

  // 다른 화면이 열어 달라고 한 세션. 칩 목록에 없어도 선택을 유지한다
  const requestedSessionIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const sessionsRequestRef = useRef(0);
  selectedIdRef.current = selectedId;

  const loadSessions = useCallback(
    async (showSkeleton: boolean) => {
      const requestId = ++sessionsRequestRef.current;
      if (showSkeleton) setSessionsStatus("loading");
      try {
        const nextSessions = await fetchSessionHistory({
          limit: SESSION_HISTORY_LIMIT,
          ...(mode === "mine" && playerId ? { playerId } : {}),
        });
        if (requestId !== sessionsRequestRef.current) return;
        setSessions(nextSessions);
        setSessionsStatus("ready");
        // 목록 없이 끝나면 페이드 래퍼가 그려지지 않으므로 대기 중인 페이드를 버린다. 남겨 두면 나중 재조회에서 재생된다
        if (nextSessions.length === 0 && !requestedSessionIdRef.current) {
          setIsListFading(false);
        }
        setSessionsError(null);
        setSelectedId((previous) => {
          if (
            previous &&
            (previous === requestedSessionIdRef.current ||
              nextSessions.some((session) => session.id === previous))
          ) {
            return previous;
          }
          return nextSessions[0]?.id ?? null;
        });
      } catch (error) {
        if (requestId !== sessionsRequestRef.current) return;
        setIsListFading(false);
        setSessionsError(
          getErrorMessage(error, "세션 기록을 불러오지 못했어요."),
        );
        setSessionsStatus("error");
      }
    },
    [mode, playerId],
  );

  const loadDetail = useCallback(
    async (sessionId: string, showSkeleton: boolean) => {
      if (showSkeleton) {
        setDetailStatus("loading");
        setReport(null);
        setMatches([]);
      }
      try {
        const [nextReport, nextMatches] = await Promise.all([
          fetchSessionReport(sessionId),
          fetchSessionMatches(sessionId),
        ]);
        if (selectedIdRef.current !== sessionId) return;
        setReport(nextReport);
        setMatches(nextMatches);
        setDetailStatus("ready");
        setDetailError(null);
      } catch (error) {
        if (selectedIdRef.current !== sessionId) return;
        setDetailError(
          getErrorMessage(error, "세션 리포트를 불러오지 못했어요."),
        );
        setDetailStatus("error");
      }
    },
    [],
  );

  useEffect(() => {
    if (!sessionReportRequest) return;
    requestedSessionIdRef.current = sessionReportRequest.sessionId;
    setSelectedId(sessionReportRequest.sessionId);
  }, [sessionReportRequest]);

  // 보기 전환·데이터 변경 시 칩 목록을 다시 받는다
  const lastSessionsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${mode}:${playerId ?? ""}`;
    const isNewList = lastSessionsKeyRef.current !== key;
    lastSessionsKeyRef.current = key;
    void loadSessions(isNewList);
  }, [loadSessions, mode, playerId, dataVersion]);

  // 세션이 바뀌면 스켈레톤부터, 같은 세션의 데이터 변경이면 보이는 내용을 둔 채 다시 받는다
  const lastDetailIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      lastDetailIdRef.current = null;
      return;
    }
    const isNewSession = lastDetailIdRef.current !== selectedId;
    lastDetailIdRef.current = selectedId;
    void loadDetail(selectedId, isNewSession);
  }, [dataVersion, loadDetail, selectedId]);

  useEffect(
    () =>
      registerPullToRefresh("records", async () => {
        const currentId = selectedIdRef.current;
        await Promise.all([
          loadSessions(false),
          currentId ? loadDetail(currentId, false) : Promise.resolve(),
        ]);
      }),
    [loadDetail, loadSessions, registerPullToRefresh],
  );

  const handleModeChange = (nextMode: RecordsMode) => {
    requestedSessionIdRef.current = null;
    setMode(nextMode);
    setIsListFading(true);
  };

  const handleSelectSession = (sessionId: string) => {
    requestedSessionIdRef.current = null;
    setSelectedId(sessionId);
  };

  // 요청받은 세션이 칩 목록에 없으면 앞쪽에 넣어 보인다
  const chipSessions = useMemo(() => {
    if (
      report &&
      report.session.id === selectedId &&
      !sessions.some((session) => session.id === report.session.id)
    ) {
      return [report.session, ...sessions];
    }
    return sessions;
  }, [report, selectedId, sessions]);

  const visibleMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status === "completed")
        .filter(
          (match) =>
            mode === "all" || (!!playerId && isPlayerInMatch(match, playerId)),
        )
        .sort(
          (a, b) =>
            new Date(b.matchStartsAt).getTime() -
            new Date(a.matchStartsAt).getTime(),
        ),
    [matches, mode, playerId],
  );

  const renderDetail = () => {
    if (detailStatus === "loading" || !report) {
      if (detailStatus === "error") {
        return (
          <TabPanelStatus
            message={detailError ?? "세션 리포트를 불러오지 못했어요."}
            tone="error"
          />
        );
      }
      return <SessionReportSkeleton />;
    }

    return (
      <>
        <SessionSummary session={report.session} />
        {report.topRiser ? <TopRiserCard report={report.topRiser} /> : null}
        <div className="h-1" />
        <SectionLabel>경기 {visibleMatches.length}</SectionLabel>
        {visibleMatches.length > 0 ? (
          <Card>
            {visibleMatches.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                currentPlayerId={playerId}
                onPress={() => openMatchDetail(match.id)}
              />
            ))}
          </Card>
        ) : (
          <TabPanelStatus message="기록이 없어요" />
        )}
      </>
    );
  };

  const renderBody = () => {
    if (sessionsStatus === "loading") {
      return (
        <>
          <SessionChipsSkeleton />
          <SessionReportSkeleton />
        </>
      );
    }
    if (sessionsStatus === "error" && chipSessions.length === 0) {
      return (
        <TabPanelStatus
          message={sessionsError ?? "세션 기록을 불러오지 못했어요."}
          tone="error"
        />
      );
    }
    if (chipSessions.length === 0 && !selectedId) {
      return <TabPanelStatus message="기록이 없어요" />;
    }

    return (
      <SegmentSwitchFade
        isPlaying={isListFading}
        onFinish={() => setIsListFading(false)}
        className="flex flex-col gap-2.5"
      >
        <SessionChips
          sessions={chipSessions}
          selectedId={selectedId}
          onSelect={handleSelectSession}
        />
        {renderDetail()}
      </SegmentSwitchFade>
    );
  };

  return (
    <>
      <TabHeader
        title="기록"
        right={
          <SegmentedControl
            options={MODE_OPTIONS}
            value={mode}
            onChange={handleModeChange}
            ariaLabel="보기"
          />
        }
      />
      <div className="flex flex-col gap-2.5 px-4 pb-6">{renderBody()}</div>
    </>
  );
};

export default Records;
