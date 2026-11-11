import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MATCH_MODE,
  getMatchScheduleDurationMs,
  isSinglesMatchType,
  matchModeLabels,
  matchModeValues,
  matchTypeLabels,
  matchTypeValues,
  MATCH_RESULT_MAX_SCORE_COUNT,
  type ManagedMatchSession,
  type MatchMode,
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
  mode: MatchMode;
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
type AutoMatchKind = "singles" | "doubles";

type AutoMatchDraft = {
  type: MatchType;
  teams: [string[], string[]];
};

type AutoScheduledMatch = AutoMatchDraft & {
  mode: MatchMode;
  courtName: string;
  matchStartsAt: string;
};

type AutoSchedulePreview = {
  kind: AutoMatchKind;
  matches: AutoScheduledMatch[];
};

type MatchScheduleDraft = {
  courtName: string;
  matchStartsAt: string;
};

const DELETE_HOLD_DURATION_MS = 800;

const getMatchupKey = (teams: [string[], string[]]) =>
  teams
    .map((team) => [...team].sort().join(","))
    .sort()
    .join("|");

const getCourtKey = (courtName: string) =>
  courtName.trim().toLocaleLowerCase();

const getScheduleConflictMessages = (
  existingMatches: SessionMatchInfo[],
  preview: AutoSchedulePreview | null,
) => {
  if (!preview) {
    return [];
  }

  const intervals = [
    ...existingMatches
      .filter((match) => match.status !== "cancelled" && match.courtName?.trim())
      .map((match, index) => ({
        label: match.name?.trim() || `${index + 1}번 경기`,
        courtName: match.courtName!.trim(),
        startsAt: new Date(match.matchStartsAt).getTime(),
        endsAt:
          new Date(match.matchStartsAt).getTime() +
          getMatchScheduleDurationMs(match.mode),
      })),
    ...preview.matches.map((match, index) => ({
      label: `${index + 1}번 새 경기`,
      courtName: match.courtName.trim(),
      startsAt: new Date(match.matchStartsAt).getTime(),
      endsAt:
        new Date(match.matchStartsAt).getTime() +
        getMatchScheduleDurationMs(match.mode),
    })),
  ].filter((interval) => Number.isFinite(interval.startsAt));

  const conflicts: string[] = [];
  const courtKeys = [...new Set(intervals.map((interval) => getCourtKey(interval.courtName)))];
  for (const courtKey of courtKeys) {
    const courtIntervals = intervals
      .filter((interval) => getCourtKey(interval.courtName) === courtKey)
      .sort((left, right) => left.startsAt - right.startsAt);
    for (let index = 1; index < courtIntervals.length; index += 1) {
      const previous = courtIntervals[index - 1];
      const current = courtIntervals[index];
      if (previous && current && current.startsAt < previous.endsAt) {
        conflicts.push(
          `${current.courtName}: ${previous.label}와 ${current.label}의 시간이 겹칩니다.`,
        );
      }
    }
  }
  return conflicts;
};

const inferSinglesType = (
  players: Array<Pick<Player, "gender">>,
): MatchType =>
  players[0]?.gender !== players[1]?.gender
    ? "singles"
    : "unrestricted-singles";

const inferDoublesType = (
  teams: [
    Array<Pick<Player, "gender">>,
    Array<Pick<Player, "gender">>,
  ],
): MatchType => {
  const players = teams.flat();
  if (players.every((player) => player.gender === "M")) {
    return "men-doubles";
  }
  if (players.every((player) => player.gender === "F")) {
    return "women-doubles";
  }
  if (
    teams.every(
      (team) =>
        team.some((player) => player.gender === "M") &&
        team.some((player) => player.gender === "F"),
    )
  ) {
    return "mixed-doubles";
  }
  return "unrestricted-doubles";
};

const buildAutoMatchDrafts = (
  players: Array<Pick<Player, "id" | "gender">>,
  kind: AutoMatchKind,
): AutoMatchDraft[] => {
  if (kind === "singles") {
    if (players.length < 4 || players.length > 6) {
      return [];
    }

    const drafts: AutoMatchDraft[] = [];
    for (let leftIndex = 0; leftIndex < players.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < players.length;
        rightIndex += 1
      ) {
        const left = players[leftIndex];
        const right = players[rightIndex];
        drafts.push({
          type: inferSinglesType([left, right]),
          teams: [[left.id], [right.id]],
        });
      }
    }
    return drafts;
  }

  if (players.length < 4 || players.length > 5) {
    return [];
  }

  const pairings: Array<[[number, number], [number, number]]> = [
    [
      [0, 1],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 3],
    ],
    [
      [0, 3],
      [1, 2],
    ],
  ];

  const drafts: AutoMatchDraft[] = [];
  for (let first = 0; first < players.length - 3; first += 1) {
    for (let second = first + 1; second < players.length - 2; second += 1) {
      for (let third = second + 1; third < players.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < players.length; fourth += 1) {
          const group = [
            players[first],
            players[second],
            players[third],
            players[fourth],
          ];
          for (const [teamAIndexes, teamBIndexes] of pairings) {
            const teamA = teamAIndexes.map((index) => group[index]);
            const teamB = teamBIndexes.map((index) => group[index]);
            drafts.push({
              type: inferDoublesType([teamA, teamB]),
              teams: [
                teamA.map((player) => player.id),
                teamB.map((player) => player.id),
              ],
            });
          }
        }
      }
    }
  }
  return drafts;
};

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
  const [sessionName, setSessionName] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionLocation, setSessionLocation] = useState("");
  const [matchName, setMatchName] = useState("");
  const [matchType, setMatchType] =
    useState<MatchType>("unrestricted-doubles");
  const [matchMode, setMatchMode] = useState<MatchMode>(DEFAULT_MATCH_MODE);
  const [matchStartsAt, setMatchStartsAt] = useState("");
  const [matchCourtName, setMatchCourtName] = useState("코트 1");
  const [courtNames, setCourtNames] = useState<string[]>(["코트 1"]);
  const [teams, setTeams] = useState<[string[], string[]]>(() =>
    createEmptyTeams("unrestricted-doubles"),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSessionMatches, setIsLoadingSessionMatches] =
    useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSavingParticipants, setIsSavingParticipants] = useState(false);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [creatingAutoMatchKind, setCreatingAutoMatchKind] =
    useState<AutoMatchKind | null>(null);
  const [autoSchedulePreview, setAutoSchedulePreview] =
    useState<AutoSchedulePreview | null>(null);
  const [isConfirmingAutoSchedule, setIsConfirmingAutoSchedule] =
    useState(false);
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
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft[]>>(
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
  const autoScheduleConflicts = useMemo(
    () => getScheduleConflictMessages(sessionMatches, autoSchedulePreview),
    [autoSchedulePreview, sessionMatches],
  );
  const isAutoSchedulePreviewInvalid = Boolean(
    autoSchedulePreview?.matches.some(
      (match) =>
        !match.courtName.trim() ||
        Number.isNaN(new Date(match.matchStartsAt).getTime()),
    ),
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
            (match.scores?.length
              ? match.scores.map((score) => ({
                  scoreA: String(score.scoreA),
                  scoreB: String(score.scoreB),
                }))
              : [{ scoreA: "", scoreB: "" }]),
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
    const existingCourtNames = [
      ...new Map(
        matches
          .map((match) => match.courtName?.trim())
          .filter((courtName): courtName is string => Boolean(courtName))
          .map((courtName) => [getCourtKey(courtName), courtName]),
      ).values(),
    ];
    setCourtNames(existingCourtNames.length > 0 ? existingCourtNames : ["코트 1"]);
    setMatchCourtName(existingCourtNames[0] ?? "코트 1");
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
    setCourtNames(["코트 1"]);
    setAutoSchedulePreview(null);
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
            mode: matchMode,
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

  const handleCreateAllMatchups = async (kind: AutoMatchKind) => {
    if (!selectedSession) {
      return;
    }

    const drafts = buildAutoMatchDrafts(registeredPlayers, kind);
    const existingMatchupKeys = new Set(
      sessionMatches
        .filter((match) => match.status !== "cancelled")
        .map((match) =>
          getMatchupKey(
            match.teams.map((team) =>
              team.players.map((player) => player.id),
            ) as [string[], string[]],
          ),
        ),
    );
    const missingDrafts = drafts.filter(
      (draft) => !existingMatchupKeys.has(getMatchupKey(draft.teams)),
    );

    setError(null);
    setSuccess(null);
    if (missingDrafts.length === 0) {
      setSuccess(
        drafts.length === 0
          ? kind === "doubles"
            ? "복식 전체 대진은 참여자가 4~5명일 때만 생성할 수 있습니다."
            : "단식 전체 대진은 참여자가 4~6명일 때만 생성할 수 있습니다."
          : "이미 모든 대진이 생성되어 있습니다.",
      );
      return;
    }

    try {
      setCreatingAutoMatchKind(kind);
      const response = await apiFetch(
        `/api/admin/match-sessions/${selectedSession.id}/matches/schedule-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            courts: courtNames,
            matches: missingDrafts.map((draft) => ({
              type: draft.type,
              mode: matchMode,
              teams: [
                { name: "Team A", playerIds: draft.teams[0] },
                { name: "Team B", playerIds: draft.teams[1] },
              ],
            })),
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "전체 대진 시간표 계산 실패");
      }
      const { schedule } = (await response.json()) as {
        schedule: Array<{ courtName: string; matchStartsAt: string }>;
      };
      if (schedule.length !== missingDrafts.length) {
        throw new Error("전체 대진 시간표를 계산하지 못했습니다.");
      }
      setAutoSchedulePreview({
        kind,
        matches: missingDrafts.map((draft, index) => ({
          ...draft,
          mode: matchMode,
          courtName: schedule[index]!.courtName,
          matchStartsAt: toLocalDateTimeValue(schedule[index]!.matchStartsAt),
        })),
      });
      setSuccess(
        `${kind === "singles" ? "단식" : "복식"} 전체 대진 ${missingDrafts.length}경기의 시간표를 확인해주세요.`,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "전체 대진 시간표 계산에 실패했습니다.",
      );
    } finally {
      setCreatingAutoMatchKind(null);
    }
  };

  const updateAutoSchedulePreview = (
    index: number,
    update: Partial<Pick<AutoScheduledMatch, "courtName" | "matchStartsAt">>,
  ) => {
    setAutoSchedulePreview((currentPreview) =>
      currentPreview
        ? {
            ...currentPreview,
            matches: currentPreview.matches.map((match, matchIndex) =>
              matchIndex === index ? { ...match, ...update } : match,
            ),
          }
        : null,
    );
  };

  const handleConfirmAutoSchedule = async () => {
    if (!selectedSession || !autoSchedulePreview) {
      return;
    }
    if (autoScheduleConflicts.length > 0) {
      setError(autoScheduleConflicts[0]);
      return;
    }
    if (isAutoSchedulePreviewInvalid) {
      setError("모든 대진의 코트명과 예정 일시를 입력해주세요.");
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      setIsConfirmingAutoSchedule(true);
      const response = await apiFetch(
        `/api/admin/match-sessions/${selectedSession.id}/matches/scheduled-batch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            courts: courtNames,
            matches: autoSchedulePreview.matches.map((match) => ({
              type: match.type,
              mode: match.mode,
              courtName: match.courtName,
              matchStartsAt: new Date(match.matchStartsAt).toISOString(),
              teams: [
                { name: "Team A", playerIds: match.teams[0] },
                { name: "Team B", playerIds: match.teams[1] },
              ],
            })),
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "전체 대진 생성 실패");
      }

      const [, matches] = await Promise.all([
        loadSessions(selectedSession.id),
        loadSessionMatches(selectedSession.id),
      ]);
      setLoadedSessionMatches(matches);
      setAutoSchedulePreview(null);
      setSuccess(
        `${autoSchedulePreview.kind === "singles" ? "단식" : "복식"} 전체 대진 ${autoSchedulePreview.matches.length}경기를 생성했습니다.`,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "전체 대진 생성에 실패했습니다.",
      );
    } finally {
      setIsConfirmingAutoSchedule(false);
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
    scoreIndex: number,
    key: keyof ScoreDraft,
    value: string,
  ) => {
    setScoreDrafts((currentDrafts) => {
      const nextDrafts = currentDrafts[matchId] ?? [
        { scoreA: "", scoreB: "" },
      ];
      return {
        ...currentDrafts,
        [matchId]: nextDrafts.map((score, index) =>
          index === scoreIndex ? { ...score, [key]: value } : score,
        ),
      };
    });
  };

  const addScoreDraft = (matchId: string) => {
    setScoreDrafts((currentDrafts) => ({
      ...currentDrafts,
      [matchId]: [
        ...(currentDrafts[matchId] ?? [{ scoreA: "", scoreB: "" }]),
        { scoreA: "", scoreB: "" },
      ],
    }));
  };

  const removeScoreDraft = (matchId: string, scoreIndex: number) => {
    setScoreDrafts((currentDrafts) => ({
      ...currentDrafts,
      [matchId]: (currentDrafts[matchId] ?? []).filter(
        (_, index) => index !== scoreIndex,
      ),
    }));
  };

  const handleSaveMatchResult = async (match: SessionMatchInfo) => {
    const scoreDraft = scoreDrafts[match.id] ?? [];
    const scores = scoreDraft.map((score) => ({
      scoreA: Number(score.scoreA),
      scoreB: Number(score.scoreB),
    }));

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
                <input
                  type="search"
                  value={participantQuery}
                  onChange={(event) => setParticipantQuery(event.target.value)}
                  placeholder="회원명 검색"
                  className="w-full max-w-sm rounded-lg border px-4 py-2 text-sm"
                />
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
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                  <div className="flex flex-wrap items-end justify-end gap-2">
                    <div className="min-w-52 space-y-1">
                      <span className="block text-xs font-medium text-slate-500">
                        자동 배정 코트명
                      </span>
                      {courtNames.map((courtName, index) => (
                        <div key={`court-${index}`} className="flex gap-1">
                          <input
                            type="text"
                            value={courtName}
                            disabled={
                              creatingAutoMatchKind !== null ||
                              isConfirmingAutoSchedule ||
                              autoSchedulePreview !== null
                            }
                            onChange={(event) =>
                              setCourtNames((currentCourts) =>
                                currentCourts.map((currentCourt, courtIndex) =>
                                  courtIndex === index
                                    ? event.target.value
                                    : currentCourt,
                                ),
                              )
                            }
                            placeholder={`코트 ${index + 1}`}
                            className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-100"
                          />
                          {courtNames.length > 1 ? (
                            <button
                              type="button"
                              disabled={
                                creatingAutoMatchKind !== null ||
                                isConfirmingAutoSchedule ||
                                autoSchedulePreview !== null
                              }
                              onClick={() =>
                                setCourtNames((currentCourts) =>
                                  currentCourts.filter(
                                    (_, courtIndex) => courtIndex !== index,
                                  ),
                                )
                              }
                              className="rounded-lg border px-2 text-sm text-slate-500 hover:bg-slate-50 disabled:text-slate-300"
                              aria-label={`${courtName || index + 1} 코트 삭제`}
                            >
                              −
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={
                          creatingAutoMatchKind !== null ||
                          isConfirmingAutoSchedule ||
                          autoSchedulePreview !== null
                        }
                        onClick={() =>
                          setCourtNames((currentCourts) => [
                            ...currentCourts,
                            `코트 ${currentCourts.length + 1}`,
                          ])
                        }
                        className="text-xs font-semibold text-blue-600 hover:underline disabled:text-slate-300"
                      >
                        코트 추가
                      </button>
                    </div>
                    <label className="min-w-36">
                      <span className="mb-1 block text-xs font-medium text-slate-500">
                        전체 대진 경기 모드
                      </span>
                      <select
                        value={matchMode}
                        disabled={
                          creatingAutoMatchKind !== null ||
                          isConfirmingAutoSchedule ||
                          autoSchedulePreview !== null
                        }
                        onChange={(event) =>
                          setMatchMode(event.target.value as MatchMode)
                        }
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-100"
                      >
                        {matchModeValues.map((mode) => (
                          <option key={mode} value={mode}>
                            {matchModeLabels[mode]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={
                        registeredPlayers.length < 4 ||
                        registeredPlayers.length > 6 ||
                        creatingAutoMatchKind !== null ||
                        isConfirmingAutoSchedule ||
                        autoSchedulePreview !== null
                      }
                      onClick={() => void handleCreateAllMatchups("singles")}
                      className="cursor-pointer rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                    >
                      {creatingAutoMatchKind === "singles"
                        ? "단식 생성 중..."
                        : "단식 전체 대진 생성"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        registeredPlayers.length < 4 ||
                        registeredPlayers.length > 5 ||
                        creatingAutoMatchKind !== null ||
                        isConfirmingAutoSchedule ||
                        autoSchedulePreview !== null
                      }
                      onClick={() => void handleCreateAllMatchups("doubles")}
                      className="cursor-pointer rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                    >
                      {creatingAutoMatchKind === "doubles"
                        ? "복식 생성 중..."
                        : "복식 전체 대진 생성"}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  단식은 참여자 4~6명, 복식은 4~5명일 때만 생성하며 이미
                  존재하는 동일 대진은 제외합니다. 선택한 경기 모드가 생성되는
                  모든 대진에 적용됩니다. 코트명과 기존 일정으로 시간표를 먼저
                  계산한 뒤 확인합니다.
                </p>

                {autoSchedulePreview ? (
                  <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-slate-800">
                          {autoSchedulePreview.kind === "singles"
                            ? "단식"
                            : "복식"}{" "}
                          전체 대진 시간표 미리보기
                        </h4>
                        <p className="mt-1 text-xs text-slate-500">
                          코트와 시간을 조정할 수 있습니다. 같은 코트의 시간이
                          겹치면 생성할 수 없습니다.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isConfirmingAutoSchedule}
                          onClick={() => setAutoSchedulePreview(null)}
                          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white disabled:text-slate-300"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          disabled={
                            isConfirmingAutoSchedule ||
                            isAutoSchedulePreviewInvalid ||
                            autoScheduleConflicts.length > 0
                          }
                          onClick={() => void handleConfirmAutoSchedule()}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                        >
                          {isConfirmingAutoSchedule
                            ? "생성 중..."
                            : `${autoSchedulePreview.matches.length}경기 생성`}
                        </button>
                      </div>
                    </div>
                    {autoScheduleConflicts.length > 0 ? (
                      <ul className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                        {autoScheduleConflicts.map((conflict) => (
                          <li key={conflict}>{conflict}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="text-xs text-slate-500">
                          <tr>
                            <th className="px-2 py-2">경기</th>
                            <th className="px-2 py-2">대진</th>
                            <th className="px-2 py-2">예정 일시</th>
                            <th className="px-2 py-2">코트</th>
                          </tr>
                        </thead>
                        <tbody>
                          {autoSchedulePreview.matches.map((match, index) => (
                            <tr key={`${match.type}-${index}`} className="border-t border-blue-100">
                              <td className="px-2 py-2 font-medium text-slate-700">
                                {index + 1}번
                              </td>
                              <td className="px-2 py-2 text-slate-600">
                                {match.teams
                                  .flat()
                                  .map(
                                    (playerId) =>
                                      selectablePlayerById.get(playerId)
                                        ?.username ?? playerId,
                                  )
                                  .join(" · ")}
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="datetime-local"
                                  value={match.matchStartsAt}
                                  disabled={isConfirmingAutoSchedule}
                                  onChange={(event) =>
                                    updateAutoSchedulePreview(index, {
                                      matchStartsAt: event.target.value,
                                    })
                                  }
                                  className="rounded border bg-white px-2 py-1.5 text-sm"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  value={match.courtName}
                                  disabled={isConfirmingAutoSchedule}
                                  onChange={(event) =>
                                    updateAutoSchedulePreview(index, {
                                      courtName: event.target.value,
                                    })
                                  }
                                  className="rounded border bg-white px-2 py-1.5 text-sm"
                                >
                                  {courtNames
                                    .filter((courtName) => courtName.trim())
                                    .map((courtName) => (
                                      <option key={courtName} value={courtName}>
                                        {courtName}
                                      </option>
                                    ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

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
                          const scoreDraft = scoreDrafts[match.id] ?? [
                            { scoreA: "", scoreB: "" },
                          ];
                          const canAddScore =
                            match.mode === "best-of-3" &&
                            scoreDraft.length < MATCH_RESULT_MAX_SCORE_COUNT;
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
                                  {scoreDraft.map((score, scoreIndex) => (
                                    <div
                                      key={`${match.id}-score-${scoreIndex}`}
                                      className="flex items-center gap-1"
                                    >
                                      <input
                                        type="number"
                                        min="0"
                                        inputMode="numeric"
                                        aria-label={`A팀 ${scoreIndex + 1}세트 점수`}
                                        placeholder="A팀"
                                        value={score.scoreA}
                                        onChange={(event) =>
                                          updateScoreDraft(
                                            match.id,
                                            scoreIndex,
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
                                        aria-label={`B팀 ${scoreIndex + 1}세트 점수`}
                                        placeholder="B팀"
                                        value={score.scoreB}
                                        onChange={(event) =>
                                          updateScoreDraft(
                                            match.id,
                                            scoreIndex,
                                            "scoreB",
                                            event.target.value,
                                          )
                                        }
                                        className="w-16 rounded border px-2 py-1.5 text-sm"
                                      />
                                      {scoreDraft.length > 1 ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeScoreDraft(
                                              match.id,
                                              scoreIndex,
                                            )
                                          }
                                          className="px-1 text-xs text-slate-500 hover:text-red-600"
                                        >
                                          삭제
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                  <div className="flex flex-wrap gap-2">
                                    {canAddScore ? (
                                      <button
                                        type="button"
                                        onClick={() => addScoreDraft(match.id)}
                                        className="text-xs font-medium text-blue-600 hover:underline"
                                      >
                                        세트 추가
                                      </button>
                                    ) : null}
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
                                {matchTypeLabels[match.type]} ·{" "}
                                {matchModeLabels[match.mode]}
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
                          경기 모드
                        </label>
                        <select
                          value={matchMode}
                          onChange={(event) =>
                            setMatchMode(event.target.value as MatchMode)
                          }
                          className="w-full rounded-lg border bg-white px-4 py-2"
                        >
                          {matchModeValues.map((mode) => (
                            <option key={mode} value={mode}>
                              {matchModeLabels[mode]}
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
                          {courtNames
                            .filter((courtName) => courtName.trim())
                            .map((courtName) => (
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
