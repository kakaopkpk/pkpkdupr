import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  isSinglesMatchType,
  matchTypeLabels,
  matchTypeValues,
  type ManagedMatchSession,
  type MatchStatus,
  type MatchType,
} from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import { rememberRecentInputValue } from "@pkpkdupr/shared/recentInputHistory";
import { apiFetch } from "../lib/api";
import RecentValueComboBox from "./RecentValueComboBox";

type ManagedSessionInfo = Omit<
  ManagedMatchSession,
  "date" | "createdAt" | "updatedAt"
> & {
  date: string;
  createdAt: string;
  updatedAt: string;
};

type SessionMatchInfo = {
  id: string;
  name?: string;
  type: MatchType;
  status: MatchStatus;
  courtName?: string;
  matchStartsAt: string;
  scores?: Array<{ scoreA: number; scoreB: number }>;
  teams: [
    { players: Array<Pick<Player, "id" | "username">> },
    { players: Array<Pick<Player, "id" | "username">> },
  ];
};

type SavedSessionMatchResult = Pick<
  SessionMatchInfo,
  "id" | "status" | "scores"
>;

type ScoreDraft = { scoreA: string; scoreB: string };

const EMPTY_SCORE_DRAFT: ScoreDraft = { scoreA: "", scoreB: "" };
type MatchScheduleDraft = {
  courtName: string;
  matchStartsAt: string;
};

const DELETE_HOLD_DURATION_MS = 800;

const getCourtKey = (courtName: string) =>
  courtName.trim().toLocaleLowerCase();

/** 세션 경기에 이미 쓰인 코트명을 대소문자 구분 없이 중복 제거해 등장 순서대로 반환한다. */
const getSessionCourtNames = (matches: SessionMatchInfo[]) => [
  ...new Map(
    matches
      .map((match) => match.courtName?.trim())
      .filter((courtName): courtName is string => Boolean(courtName))
      .map((courtName) => [getCourtKey(courtName), courtName]),
  ).values(),
];

interface AdminSessionManagerProps {
  players: Array<Pick<Player, "id" | "username" | "gender" | "status">>;
  onMatchResultSaved?: (match: SavedSessionMatchResult) => void;
}

const recentInputFieldKeys = {
  sessionName: "admin.session.name",
  sessionLocation: "admin.session.location",
  matchName: "admin.match.name",
} as const;

const matchStatusLabelMap: Record<MatchStatus, string> = {
  created: "예정",
  completed: "완료",
  cancelled: "취소",
};

const matchStatusBadgeClassMap: Record<MatchStatus, string> = {
  created: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-200 text-slate-700",
};

const toLocalDateTimeValue = (value: string | Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
};

const createEmptyTeams = (type: MatchType): [string[], string[]] => {
  const teamSize = isSinglesMatchType(type) ? 1 : 2;
  return [
    Array.from({ length: teamSize }, () => ""),
    Array.from({ length: teamSize }, () => ""),
  ];
};

const AdminSessionManager: React.FC<AdminSessionManagerProps> = ({
  players,
  onMatchResultSaved,
}) => {
  const [sessions, setSessions] = useState<ManagedSessionInfo[]>([]);
  const [sessionMatches, setSessionMatches] = useState<SessionMatchInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [participantQuery, setParticipantQuery] = useState("");
  const participantSearchRef = useRef<HTMLInputElement>(null);
  const [sessionName, setSessionName] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionLocation, setSessionLocation] = useState("");
  const [matchName, setMatchName] = useState("");
  const [matchType, setMatchType] =
    useState<MatchType>("unrestricted-doubles");
  const [matchStartsAt, setMatchStartsAt] = useState("");
  const [matchCourtName, setMatchCourtName] = useState("코트 1");
  const [teams, setTeams] = useState<[string[], string[]]>(() =>
    createEmptyTeams("unrestricted-doubles"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSessionMatches, setIsLoadingSessionMatches] =
    useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSavingParticipants, setIsSavingParticipants] = useState(false);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [matchScheduleDrafts, setMatchScheduleDrafts] = useState<
    Record<string, MatchScheduleDraft>
  >({});
  const [savingScheduleMatchId, setSavingScheduleMatchId] = useState<
    string | null
  >(null);
  const [savingResultMatchId, setSavingResultMatchId] = useState<string | null>(
    null,
  );
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );
  const [deleteHoldMatchId, setDeleteHoldMatchId] = useState<string | null>(
    null,
  );
  const [deleteConfirmationMatch, setDeleteConfirmationMatch] =
    useState<SessionMatchInfo | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>(
    {},
  );
  const deleteHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectablePlayers = useMemo(
    () =>
      players.filter((player) => player.status === "active"),
    [players],
  );
  const selectablePlayerById = useMemo(
    () => new Map(selectablePlayers.map((player) => [player.id, player])),
    [selectablePlayers],
  );
  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;
  const registeredPlayers = (selectedSession?.participantIds ?? [])
    .map((playerId) => selectablePlayerById.get(playerId))
    .filter((player): player is NonNullable<typeof player> => Boolean(player));
  const filteredPlayers = selectablePlayers.filter((player) =>
    player.username
      .toLocaleLowerCase()
      .includes(participantQuery.trim().toLocaleLowerCase()),
  );
  const courtNames = useMemo(
    () => getSessionCourtNames(sessionMatches),
    [sessionMatches],
  );

  const loadSessions = async (preferredSessionId?: string) => {
    const response = await apiFetch("/api/admin/match-sessions");
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "세션 목록을 불러오지 못했습니다.");
    }
    const nextSessions = (await response.json()) as ManagedSessionInfo[];
    setSessions(nextSessions);
    setSelectedSessionId((currentId) => {
      const nextId = preferredSessionId ?? currentId;
      return nextSessions.some((session) => session.id === nextId)
        ? nextId
        : (nextSessions[0]?.id ?? "");
    });
  };

  const loadSessionMatches = async (sessionId: string) => {
    const response = await apiFetch(
      `/api/match-sessions/${encodeURIComponent(sessionId)}/matches`,
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "세션 경기 목록을 불러오지 못했습니다.");
    }
    const matches = (await response.json()) as SessionMatchInfo[];
    return matches.sort(
      (a, b) =>
        new Date(a.matchStartsAt).getTime() -
        new Date(b.matchStartsAt).getTime(),
    );
  };

  const setLoadedSessionMatches = (matches: SessionMatchInfo[]) => {
    setSessionMatches(matches);
    setScoreDrafts((currentDrafts) =>
      Object.fromEntries(
        matches.map((match) => [
          match.id,
          currentDrafts[match.id] ??
            (match.scores?.[0]
              ? {
                  scoreA: String(match.scores[0].scoreA),
                  scoreB: String(match.scores[0].scoreB),
                }
              : EMPTY_SCORE_DRAFT),
        ]),
      ),
    );
    setMatchScheduleDrafts((currentDrafts) =>
      Object.fromEntries(
        matches.map((match) => [
          match.id,
          currentDrafts[match.id] ?? {
            courtName: match.courtName ?? "",
            matchStartsAt: toLocalDateTimeValue(match.matchStartsAt),
          },
        ]),
      ),
    );
    setMatchCourtName(getSessionCourtNames(matches)[0] ?? "코트 1");
  };

  useEffect(() => {
    void (async () => {
      try {
        setIsLoading(true);
        await loadSessions();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "세션 목록을 불러오지 못했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(
    () => () => {
      if (deleteHoldTimeoutRef.current) {
        clearTimeout(deleteHoldTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedSession) {
      setParticipantIds([]);
      setSessionMatches([]);
      return;
    }
    setParticipantIds(selectedSession.participantIds);
    setMatchStartsAt(toLocalDateTimeValue(selectedSession.date));
    setMatchCourtName("코트 1");
    setMatchScheduleDrafts({});
    setTeams(createEmptyTeams(matchType));
    setError(null);
    setSuccess(null);
    setSessionMatches([]);

    let isCurrentSession = true;
    setIsLoadingSessionMatches(true);
    void loadSessionMatches(selectedSession.id)
      .then((matches) => {
        if (isCurrentSession) {
          setLoadedSessionMatches(matches);
        }
      })
      .catch((loadError) => {
        if (isCurrentSession) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "세션 경기 목록을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (isCurrentSession) {
          setIsLoadingSessionMatches(false);
        }
      });

    return () => {
      isCurrentSession = false;
    };
  }, [selectedSessionId]);

  const handleCreateSession = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      setIsCreatingSession(true);
      const response = await apiFetch("/api/admin/match-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: sessionName.trim(),
          date: new Date(sessionDate).toISOString(),
          location: sessionLocation.trim(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "세션 생성 실패");
      }
      const created = (await response.json()) as { id: string; name: string };
      rememberRecentInputValue(
        recentInputFieldKeys.sessionName,
        sessionName,
      );
      rememberRecentInputValue(
        recentInputFieldKeys.sessionLocation,
        sessionLocation,
      );
      setSessionName("");
      setSessionDate("");
      setSessionLocation("");
      await loadSessions(created.id);
      setSuccess(`예정 세션 "${created.name}"을 생성했습니다.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "세션 생성에 실패했습니다.",
      );
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleToggleParticipant = (playerId: string) => {
    setParticipantIds((currentIds) =>
      currentIds.includes(playerId)
        ? currentIds.filter((currentId) => currentId !== playerId)
        : [...currentIds, playerId],
    );
  };

  const handleSaveParticipants = async () => {
    if (!selectedSession) {
      return;
    }
    setError(null);
    setSuccess(null);

    try {
      setIsSavingParticipants(true);
      const response = await apiFetch(
        `/api/admin/match-sessions/${selectedSession.id}/participants`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ playerIds: participantIds }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "참여자 저장 실패");
      }
      await loadSessions(selectedSession.id);
      setSuccess(`${participantIds.length}명의 참여자를 등록했습니다.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "참여자 저장에 실패했습니다.",
      );
    } finally {
      setIsSavingParticipants(false);
    }
  };

  const updateTeamPlayer = (
    teamIndex: 0 | 1,
    slotIndex: number,
    playerId: string,
  ) => {
    setTeams((currentTeams) => {
      const nextTeams = currentTeams.map((team) => [...team]) as [
        string[],
        string[],
      ];
      nextTeams[teamIndex][slotIndex] = playerId;
      return nextTeams;
    });
  };

  const handleMatchTypeChange = (nextType: MatchType) => {
    setMatchType(nextType);
    setTeams(createEmptyTeams(nextType));
  };

  const handleCreateMatch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSession) {
      return;
    }
    setError(null);
    setSuccess(null);

    const normalizedCourtName = matchCourtName.trim();
    if (!normalizedCourtName) {
      setError("코트명을 입력해주세요.");
      return;
    }

    try {
      setIsCreatingMatch(true);
      const response = await apiFetch(
        `/api/admin/match-sessions/${selectedSession.id}/matches`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: matchName.trim() || undefined,
            type: matchType,
            courtName: normalizedCourtName,
            matchStartsAt: new Date(matchStartsAt).toISOString(),
            teams: [
              { name: "Team A", playerIds: teams[0] },
              { name: "Team B", playerIds: teams[1] },
            ],
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "예정 경기 생성 실패");
      }
      rememberRecentInputValue(recentInputFieldKeys.matchName, matchName);
      setMatchName("");
      setTeams(createEmptyTeams(matchType));
      const [, matches] = await Promise.all([
        loadSessions(selectedSession.id),
        loadSessionMatches(selectedSession.id),
      ]);
      setLoadedSessionMatches(matches);
      setSuccess("세션에 예정 경기를 생성했습니다.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "예정 경기 생성에 실패했습니다.",
      );
    } finally {
      setIsCreatingMatch(false);
    }
  };

  const updateMatchScheduleDraft = (
    matchId: string,
    update: Partial<MatchScheduleDraft>,
  ) => {
    setMatchScheduleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [matchId]: {
        courtName: currentDrafts[matchId]?.courtName ?? "",
        matchStartsAt: currentDrafts[matchId]?.matchStartsAt ?? "",
        ...update,
      },
    }));
  };

  const handleSaveMatchSchedule = async (match: SessionMatchInfo) => {
    if (!selectedSession) {
      return;
    }
    const draft = matchScheduleDrafts[match.id] ?? {
      courtName: match.courtName ?? "",
      matchStartsAt: toLocalDateTimeValue(match.matchStartsAt),
    };
    const courtName = draft.courtName.trim();
    const matchStartsAt = new Date(draft.matchStartsAt);
    if (!courtName) {
      setError("코트명을 입력해주세요.");
      return;
    }
    if (Number.isNaN(matchStartsAt.getTime())) {
      setError("유효한 경기 예정 일시를 입력해주세요.");
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      setSavingScheduleMatchId(match.id);
      const response = await apiFetch(`/api/admin/matches/${match.id}/metadata`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courtName,
          matchStartsAt: matchStartsAt.toISOString(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "경기 일정 저장 실패");
      }
      const matches = await loadSessionMatches(selectedSession.id);
      setLoadedSessionMatches(matches);
      setSuccess("경기 예정 일시와 코트를 저장했습니다.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "경기 일정 저장에 실패했습니다.",
      );
    } finally {
      setSavingScheduleMatchId(null);
    }
  };

  const selectedMatchPlayerIds = new Set(teams.flat().filter(Boolean));
  const getPlayerOptions = (currentPlayerId: string) =>
    registeredPlayers.filter(
      (player) =>
        player.id === currentPlayerId ||
        !selectedMatchPlayerIds.has(player.id),
    );

  const updateScoreDraft = (
    matchId: string,
    key: keyof ScoreDraft,
    value: string,
  ) => {
    setScoreDrafts((currentDrafts) => ({
      ...currentDrafts,
      [matchId]: {
        ...(currentDrafts[matchId] ?? EMPTY_SCORE_DRAFT),
        [key]: value,
      },
    }));
  };

  const handleSaveMatchResult = async (match: SessionMatchInfo) => {
    const scoreDraft = scoreDrafts[match.id] ?? EMPTY_SCORE_DRAFT;
    const scores = [
      {
        scoreA: Number(scoreDraft.scoreA),
        scoreB: Number(scoreDraft.scoreB),
      },
    ];

    setError(null);
    setSuccess(null);
    try {
      setSavingResultMatchId(match.id);
      const response = await apiFetch(`/api/admin/matches/${match.id}/result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scores }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "경기 결과 저장 실패");
      }
      const { match: savedMatch } = (await response.json()) as {
        match: SavedSessionMatchResult;
      };
      if (savedMatch.status !== "completed") {
        throw new Error("경기 결과를 완료 처리하지 못했습니다.");
      }

      const [, matches] = await Promise.all([
        loadSessions(selectedSessionId),
        loadSessionMatches(selectedSessionId),
      ]);
      setLoadedSessionMatches(matches);
      onMatchResultSaved?.(savedMatch);
      setSuccess("경기 결과를 저장하고 레이팅 반영을 완료했습니다.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "경기 결과 저장에 실패했습니다.",
      );
    } finally {
      setSavingResultMatchId(null);
    }
  };

  const cancelDeleteHold = () => {
    if (deleteHoldTimeoutRef.current) {
      clearTimeout(deleteHoldTimeoutRef.current);
      deleteHoldTimeoutRef.current = null;
    }
    setDeleteHoldMatchId(null);
  };

  const startDeleteHold = (match: SessionMatchInfo) => {
    if (deletingMatchId) {
      return;
    }

    cancelDeleteHold();
    setDeleteHoldMatchId(match.id);
    deleteHoldTimeoutRef.current = setTimeout(() => {
      deleteHoldTimeoutRef.current = null;
      setDeleteHoldMatchId(null);
      setDeleteConfirmationMatch(match);
    }, DELETE_HOLD_DURATION_MS);
  };

  const handleDeleteMatch = async (match: SessionMatchInfo) => {
    setError(null);
    setSuccess(null);
    try {
      setDeletingMatchId(match.id);
      const response = await apiFetch(`/api/admin/matches/${match.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "경기 삭제 실패");
      }

      const [, matches] = await Promise.all([
        loadSessions(selectedSessionId),
        loadSessionMatches(selectedSessionId),
      ]);
      setLoadedSessionMatches(matches);
      setSuccess("경기를 삭제하고 레이팅을 재계산했습니다.");
      setDeleteConfirmationMatch(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "경기 삭제에 실패했습니다.",
      );
    } finally {
      setDeletingMatchId(null);
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    if (selectedSession.matchCount > 0) {
      setError("연결된 경기가 있는 세션은 삭제할 수 없습니다.");
      setSuccess(null);
      return;
    }
    if (
      !window.confirm(
        `세션 "${selectedSession.name}"과 참여자 등록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }

    try {
      setDeletingSessionId(selectedSession.id);
      setError(null);
      setSuccess(null);
      const response = await apiFetch(
        `/api/admin/match-sessions/${selectedSession.id}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "세션 삭제 실패");
      }
      await loadSessions();
      setSessionMatches([]);
      setSuccess("세션과 참여자 등록을 삭제했습니다.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "세션 삭제에 실패했습니다.",
      );
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">
            세션 추가
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            세션을 먼저 만든 뒤 참여자와 예정 경기를 구성합니다.
          </p>
        </div>
        <form
          onSubmit={handleCreateSession}
          className="grid items-end gap-4 md:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              세션 이름
            </label>
            <RecentValueComboBox
              fieldKey={recentInputFieldKeys.sessionName}
              value={sessionName}
              required
              onChange={setSessionName}
              placeholder="세션 이름 입력"
              className="w-full"
              inputClassName="w-full rounded-lg border bg-white px-4 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              예정 일시
            </label>
            <input
              type="datetime-local"
              required
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
              className="w-full rounded-lg border bg-white px-4 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              장소
            </label>
            <RecentValueComboBox
              fieldKey={recentInputFieldKeys.sessionLocation}
              value={sessionLocation}
              required
              onChange={setSessionLocation}
              placeholder="세션 장소 입력"
              className="w-full"
              inputClassName="w-full rounded-lg border bg-white px-4 py-2"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={isCreatingSession}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {isCreatingSession ? "생성 중..." : "세션 생성"}
            </button>
          </div>
        </form>
      </section>

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">세션 구성</h2>
          <p className="mt-1 text-sm text-gray-500">
            관리할 세션을 선택해 참여자와 예정 경기를 등록합니다.
          </p>
        </div>
        <select
          value={selectedSessionId}
          disabled={isLoading || sessions.length === 0}
          onChange={(event) => setSelectedSessionId(event.target.value)}
          className="w-full max-w-xl rounded-lg border bg-white px-4 py-2"
        >
          {sessions.length === 0 ? (
            <option value="">
              {isLoading ? "세션 불러오는 중..." : "등록된 세션이 없습니다."}
            </option>
          ) : null}
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name} ·{" "}
              {new Date(session.date).toLocaleString("ko-KR")} ·{" "}
              {session.matchCount}경기
            </option>
          ))}
        </select>

        {selectedSession ? (
          <div className="mt-6 border-l-2 border-blue-200 pl-5 md:pl-7">
            <div className="rounded-r-lg bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-600">
                선택된 세션
              </p>
              <h3 className="mt-1 font-semibold text-slate-800">
                {selectedSession.name}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {new Date(selectedSession.date).toLocaleString("ko-KR")} ·{" "}
                {selectedSession.location} · 참여자{" "}
                {selectedSession.participantIds.length}명 ·{" "}
                {selectedSession.matchCount}경기
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    selectedSession.matchCount > 0 ||
                    deletingSessionId === selectedSession.id
                  }
                  onClick={() => void handleDeleteSession()}
                  title={
                    selectedSession.matchCount > 0
                      ? "연결된 경기를 다른 세션으로 옮기거나 연결 해제한 뒤 삭제할 수 있습니다."
                      : "세션 삭제"
                  }
                  className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  {deletingSessionId === selectedSession.id
                    ? "세션 삭제 중..."
                    : "세션 삭제"}
                </button>
                {selectedSession.matchCount > 0 ? (
                  <span className="text-xs text-slate-500">
                    연결된 경기 {selectedSession.matchCount}개가 있어 삭제할 수 없습니다.
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-8 space-y-10">
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                      1
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-700">
                        참여자 등록
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        이 세션의 예정 경기에 배정할 회원을 등록합니다.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingParticipants}
                    onClick={() => void handleSaveParticipants()}
                    className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                  >
                    {isSavingParticipants
                      ? "저장 중..."
                      : `참여자 ${participantIds.length}명 저장`}
                  </button>
                </div>
                <div className="relative w-full max-w-sm">
                  <input
                    ref={participantSearchRef}
                    type="search"
                    value={participantQuery}
                    onChange={(event) => setParticipantQuery(event.target.value)}
                    placeholder="회원명 검색"
                    // 지우기는 오른쪽 X 버튼이 맡으므로 브라우저 기본 취소 버튼은 숨긴다
                    className="w-full appearance-none rounded-lg border py-2 pl-4 pr-10 text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  {participantQuery ? (
                    <button
                      type="button"
                      aria-label="검색어 지우기"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setParticipantQuery("");
                        participantSearchRef.current?.focus();
                      }}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" fill="currentColor" />
                        <path
                          d="M8.5 8.5l7 7M15.5 8.5l-7 7"
                          fill="none"
                          stroke="white"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredPlayers.map((player) => (
                    <label
                      key={player.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={participantIds.includes(player.id)}
                        onChange={() => handleToggleParticipant(player.id)}
                      />
                      <span className="font-medium text-slate-700">
                        {player.username}
                      </span>
                      <span className="text-xs text-slate-400">
                        {player.gender === "M" ? "남" : "여"}
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    2
                  </span>
                  <div>
                    <h3 className="font-semibold text-gray-700">
                      세션 경기
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      이 세션에 등록된 경기를 확인하고 새 경기를 추가합니다.
                    </p>
                  </div>
                </div>

                {isLoadingSessionMatches ? (
                  <p className="bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    경기 목록을 불러오는 중...
                  </p>
                ) : sessionMatches.length === 0 ? (
                  <p className="bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    이 세션에 등록된 경기가 없습니다.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1160px] text-left text-sm">
                      <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3">경기</th>
                          <th className="px-4 py-3">타입</th>
                          <th className="px-4 py-3">A팀</th>
                          <th className="px-4 py-3">B팀</th>
                          <th className="px-4 py-3">결과</th>
                          <th className="px-4 py-3">예정 일시</th>
                          <th className="px-4 py-3">코트</th>
                          <th className="px-4 py-3">상태</th>
                          <th className="px-4 py-3 text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionMatches.map((match, matchIndex) => {
                          const isCompleted = match.status === "completed";
                          const scoreDraft =
                            scoreDrafts[match.id] ?? EMPTY_SCORE_DRAFT;
                          const scheduleDraft = matchScheduleDrafts[match.id] ?? {
                            courtName: match.courtName ?? "",
                            matchStartsAt: toLocalDateTimeValue(
                              match.matchStartsAt,
                            ),
                          };
                          const renderResultCell = () => (
                            <td className="min-w-52 px-4 py-3">
                              {isCompleted ? (
                                <span className="text-sm font-medium text-slate-700">
                                  {match.scores
                                    ?.map(
                                      (score) =>
                                        `${score.scoreA}:${score.scoreB}`,
                                    )
                                    .join(" · ") || "-"}
                                </span>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      inputMode="numeric"
                                      aria-label="A팀 점수"
                                      placeholder="A팀"
                                      value={scoreDraft.scoreA}
                                      onChange={(event) =>
                                        updateScoreDraft(
                                          match.id,
                                          "scoreA",
                                          event.target.value,
                                        )
                                      }
                                      className="w-16 rounded border px-2 py-1.5 text-sm"
                                    />
                                    <span className="text-slate-400">:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      inputMode="numeric"
                                      aria-label="B팀 점수"
                                      placeholder="B팀"
                                      value={scoreDraft.scoreB}
                                      onChange={(event) =>
                                        updateScoreDraft(
                                          match.id,
                                          "scoreB",
                                          event.target.value,
                                        )
                                      }
                                      className="w-16 rounded border px-2 py-1.5 text-sm"
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={savingResultMatchId === match.id}
                                      onClick={() =>
                                        void handleSaveMatchResult(match)
                                      }
                                      className="text-xs font-semibold text-blue-600 disabled:text-slate-300"
                                    >
                                      {savingResultMatchId === match.id
                                        ? "저장 중..."
                                        : "저장"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>
                          );

                          return (
                            <tr key={match.id} className="even:bg-slate-50">
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                                {match.name?.trim() || `${matchIndex + 1}번 경기`}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                {matchTypeLabels[match.type]}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {match.teams[0].players
                                  .map((player) => player.username)
                                  .join(", ")}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {match.teams[1].players
                                  .map((player) => player.username)
                                  .join(", ")}
                              </td>
                              {renderResultCell()}
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                <input
                                  type="datetime-local"
                                  value={scheduleDraft.matchStartsAt}
                                  disabled={savingScheduleMatchId === match.id}
                                  onChange={(event) =>
                                    updateMatchScheduleDraft(match.id, {
                                      matchStartsAt: event.target.value,
                                    })
                                  }
                                  className="rounded border bg-white px-2 py-1.5 text-xs disabled:bg-slate-100"
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                <input
                                  type="text"
                                  value={scheduleDraft.courtName}
                                  disabled={savingScheduleMatchId === match.id}
                                  onChange={(event) =>
                                    updateMatchScheduleDraft(match.id, {
                                      courtName: event.target.value,
                                    })
                                  }
                                  placeholder="코트명"
                                  className="w-24 rounded border bg-white px-2 py-1.5 text-xs disabled:bg-slate-100"
                                />
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${matchStatusBadgeClassMap[match.status]}`}
                                >
                                  {matchStatusLabelMap[match.status]}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <button
                                  type="button"
                                  disabled={savingScheduleMatchId === match.id}
                                  onClick={() =>
                                    void handleSaveMatchSchedule(match)
                                  }
                                  className="mr-2 rounded px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:text-slate-300"
                                >
                                  {savingScheduleMatchId === match.id
                                    ? "저장 중..."
                                    : "일정 저장"}
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingMatchId === match.id}
                                  onPointerDown={() => startDeleteHold(match)}
                                  onPointerUp={cancelDeleteHold}
                                  onPointerLeave={cancelDeleteHold}
                                  onPointerCancel={cancelDeleteHold}
                                  onContextMenu={(event) => event.preventDefault()}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      startDeleteHold(match);
                                    }
                                  }}
                                  onKeyUp={cancelDeleteHold}
                                  className="relative cursor-pointer overflow-hidden rounded px-2 py-1 text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
                                >
                                  {deleteHoldMatchId === match.id ? (
                                    <span
                                      aria-hidden="true"
                                      className="delete-hold-progress absolute inset-y-0 left-0 w-full origin-left bg-red-100"
                                    />
                                  ) : null}
                                  <span className="relative">경기 삭제</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="pt-3">
                  <h4 className="font-semibold text-slate-700">경기 추가</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    점수와 결과 없이 경기 일정과 팀을 구성합니다.
                  </p>
                </div>
                {registeredPlayers.length < 2 ? (
                  <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    참여자를 저장한 뒤 예정 경기를 생성할 수 있습니다.
                  </p>
                ) : (
                  <form onSubmit={handleCreateMatch} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-5">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          경기명
                        </label>
                        <RecentValueComboBox
                          fieldKey={recentInputFieldKeys.matchName}
                          value={matchName}
                          onChange={setMatchName}
                          placeholder="선택 입력"
                          className="w-full"
                          inputClassName="w-full rounded-lg border bg-white px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          경기 타입
                        </label>
                        <select
                          value={matchType}
                          onChange={(event) =>
                            handleMatchTypeChange(
                              event.target.value as MatchType,
                            )
                          }
                          className="w-full rounded-lg border bg-white px-4 py-2"
                        >
                          {matchTypeValues.map((type) => (
                            <option key={type} value={type}>
                              {matchTypeLabels[type]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          예정 일시
                        </label>
                        <input
                          type="datetime-local"
                          required
                          value={matchStartsAt}
                          onChange={(event) =>
                            setMatchStartsAt(event.target.value)
                          }
                          className="w-full rounded-lg border bg-white px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          코트명
                        </label>
                        <input
                          type="text"
                          required
                          list="session-court-names"
                          value={matchCourtName}
                          onChange={(event) =>
                            setMatchCourtName(event.target.value)
                          }
                          placeholder="코트 1"
                          className="w-full rounded-lg border bg-white px-4 py-2"
                        />
                        <datalist id="session-court-names">
                          {courtNames.map((courtName) => (
                            <option key={courtName} value={courtName} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {([0, 1] as const).map((teamIndex) => (
                        <div
                          key={teamIndex}
                          className="space-y-3 rounded-lg bg-slate-50 p-4"
                        >
                          <h3 className="font-semibold text-slate-700">
                            Team {teamIndex === 0 ? "A" : "B"}
                          </h3>
                          {teams[teamIndex].map((playerId, slotIndex) => (
                            <select
                              key={`${teamIndex}-${slotIndex}`}
                              required
                              value={playerId}
                              onChange={(event) =>
                                updateTeamPlayer(
                                  teamIndex,
                                  slotIndex,
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-lg border bg-white px-4 py-2"
                            >
                              <option value="">
                                선수 {slotIndex + 1} 선택
                              </option>
                              {getPlayerOptions(playerId).map((player) => (
                                <option key={player.id} value={player.id}>
                                  {player.username}
                                </option>
                              ))}
                            </select>
                          ))}
                        </div>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={isCreatingMatch}
                      className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                    >
                      {isCreatingMatch ? "생성 중..." : "예정 경기 생성"}
                    </button>
                  </form>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </section>

      {deleteConfirmationMatch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleDeleteMatch(deleteConfirmationMatch);
            }}
            className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-xl"
          >
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                경기 삭제 최종 확인
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                “{deleteConfirmationMatch.name ?? "이 경기"}”를 삭제합니다.
                완료 경기라면 레이팅도 다시 계산됩니다.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingMatchId === deleteConfirmationMatch.id}
                onClick={() => setDeleteConfirmationMatch(null)}
                // 파괴적 동작이므로 Enter 한 번에 삭제되지 않게 취소 버튼에 포커스를 둔다.
                autoFocus
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={deletingMatchId === deleteConfirmationMatch.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-red-300"
              >
                {deletingMatchId === deleteConfirmationMatch.id
                  ? "삭제 중..."
                  : "경기 삭제"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default AdminSessionManager;
