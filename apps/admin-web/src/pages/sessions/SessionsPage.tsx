import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ManagedMatchSession, Match } from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import type { AdminRegularSessionSkip } from "@pkpkdupr/shared/session";
import { fetchAdminMatches } from "../../api/matches";
import { fetchAdminPlayers } from "../../api/players";
import { fetchAdminSessions, fetchRegularSessionSkips } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InlineError } from "../../components/ui/InlineError";
import { ListWithPanel } from "../../components/ui/ListWithPanel";
import { PageHeader } from "../../components/ui/PageHeader";
import { parseSessionsParams, sessionsPath } from "../../lib/adminRoutes";
import { PastSessionPanel } from "./PastSessionPanel";
import { RegularSessionSkipsCard } from "./RegularSessionSkipsCard";
import { SessionCalendar } from "./SessionCalendar";
import {
  getSessionDateKey,
  getTodayKey,
  isPastSession,
  shiftMonth,
  toMonthKey,
} from "./sessionDates";
import { getLoadErrorMessage } from "./sessionErrors";
import { SessionFormDialog, type SessionFormDialogMode } from "./SessionFormDialog";
import { UpcomingSessionPanel } from "./UpcomingSessionPanel";

const SessionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = parseSessionsParams(searchParams);
  const todayKey = getTodayKey();

  const [sessions, setSessions] = useState<ManagedMatchSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [skips, setSkips] = useState<AdminRegularSessionSkip[]>([]);
  const [skipsError, setSkipsError] = useState<string | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [formMode, setFormMode] = useState<SessionFormDialogMode | null>(null);
  const matchesRef = useRef<Promise<Match[]> | null>(null);

  const reloadSessions = useCallback(async () => {
    try {
      setSessions(await fetchAdminSessions());
      setSessionsError(null);
    } catch (err) {
      setSessionsError(getLoadErrorMessage(err, "세션을 불러오지 못했어요."));
    }
  }, []);

  const reloadSkips = useCallback(async () => {
    try {
      setSkips(await fetchRegularSessionSkips());
      setSkipsError(null);
    } catch (err) {
      setSkipsError(getLoadErrorMessage(err, "쉬는 날을 불러오지 못했어요."));
    }
  }, []);

  useEffect(() => {
    void reloadSessions();
    void reloadSkips();
    // 참여자 후보·게스트 수 용도라 실패하면 빈 목록으로 둔다
    fetchAdminPlayers()
      .then(setPlayers)
      .catch(() => undefined);
  }, [reloadSessions, reloadSkips]);

  // 지난 세션 패널의 평점 미반영 경기 수용. 처음 필요할 때 한 번만 읽는다
  const loadMatches = useCallback(() => {
    if (!matchesRef.current) {
      matchesRef.current = fetchAdminMatches().catch((err: unknown) => {
        matchesRef.current = null;
        throw err;
      });
    }
    return matchesRef.current;
  }, []);

  const selectedSession = useMemo(
    () => sessions?.find((session) => session.id === params.sessionId) ?? null,
    [sessions, params.sessionId],
  );

  // 달이 URL에 없으면 고른 세션의 달, 그것도 없으면 이번 달
  const monthKey =
    params.month ??
    (selectedSession ? toMonthKey(getSessionDateKey(selectedSession)) : toMonthKey(todayKey));

  const go = (sessionId: string | undefined, month: string | undefined) =>
    navigate(sessionsPath({ sessionId, month }));

  const handleSaved = (sessionId: string, dateKey: string) => {
    setFormMode(null);
    void reloadSessions();
    go(sessionId, toMonthKey(dateKey));
  };

  const handleDeleted = () => {
    void reloadSessions();
    void reloadSkips();
    go(undefined, monthKey);
  };

  const handleSkipsChanged = () => {
    void reloadSkips();
    void reloadSessions();
  };

  const closePanel = () => go(undefined, monthKey);

  const panel = !selectedSession ? null : isPastSession(selectedSession, todayKey) ? (
    <PastSessionPanel
      key={selectedSession.id}
      session={selectedSession}
      players={players}
      loadMatches={loadMatches}
      onClose={closePanel}
      onEdit={(session) => setFormMode({ kind: "edit", session })}
    />
  ) : (
    <UpcomingSessionPanel
      key={selectedSession.id}
      session={selectedSession}
      players={players}
      onClose={closePanel}
      onEdit={(session) => setFormMode({ kind: "edit", session })}
      onParticipantsChanged={() => void reloadSessions()}
      onDeleted={handleDeleted}
    />
  );

  return (
    <>
      <PageHeader
        title="세션"
        actions={
          <Button onClick={() => setFormMode({ kind: "create", dateKey: todayKey })}>
            + 세션 만들기
          </Button>
        }
      />

      <ListWithPanel
        list={
          <div className="space-y-5">
            {sessions ? (
              <SessionCalendar
                monthKey={monthKey}
                todayKey={todayKey}
                sessions={sessions}
                skips={skips}
                selectedSessionId={selectedSession?.id}
                onChangeMonth={(delta) =>
                  go(selectedSession?.id, shiftMonth(monthKey, delta))
                }
                onSelectSession={(session) => go(session.id, monthKey)}
                onCreateOnDate={(dateKey) => setFormMode({ kind: "create", dateKey })}
              />
            ) : (
              <Card className="text-pk-15 text-pk-sub">
                {sessionsError ? (
                  <InlineError
                    message={sessionsError}
                    action={
                      <Button size="sm" variant="soft" onClick={() => void reloadSessions()}>
                        다시 시도
                      </Button>
                    }
                  />
                ) : (
                  "세션을 불러오는 중…"
                )}
              </Card>
            )}

            <RegularSessionSkipsCard
              skips={skips}
              loadError={skipsError}
              todayKey={todayKey}
              sessions={sessions ?? []}
              onChanged={handleSkipsChanged}
            />
          </div>
        }
        panel={panel}
      />

      <SessionFormDialog
        mode={formMode}
        todayKey={todayKey}
        onClose={() => setFormMode(null)}
        onSaved={handleSaved}
      />
    </>
  );
};

export default SessionsPage;
