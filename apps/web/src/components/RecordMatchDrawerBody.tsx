import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@heroui/react";
import { IoCheckmarkCircle, IoSearch } from "react-icons/io5";
import type {
  MatchScore,
  MatchType,
  RecordMatchRequest,
} from "@pkpkdupr/shared/match";
import {
  getMatchTopLevelType,
  isSinglesMatchType,
} from "@pkpkdupr/shared/match";
import type {
  MemberListPlayer,
  PlayerRatingChangeLog,
} from "@pkpkdupr/shared/player";
import { rememberRecentInputValue } from "@pkpkdupr/shared/recentInputHistory";
import { DEFAULT_MATCH_LOCATION } from "@pkpkdupr/shared/session";
import type { MatchInfo } from "@/components/Match";
import MatchCard from "@/components/Match";
import UserChip from "@/components/UserChip";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  fetchTodayMatchSessions,
  getPrioritySessionMemberIds,
} from "@/lib/matchSessions";
import { formatRating } from "@/utils/dupr";
import { getWinningTeamIndex } from "@/utils/matchStats";
import BottomSheet from "./BottomSheet";
import BottomSheetSection from "./BottomSheetSection";
import CreateMatchTeamGrid from "./CreateMatchTeamGrid";
import HoldToConfirmButton, {
  SAVE_HOLD_DURATION_MS,
} from "./HoldToConfirmButton";
import RatingDeltaChip from "./RatingDeltaChip";
import RecentValueComboBox from "./RecentValueComboBox";
import RecordMatchScoreStrip from "./RecordMatchScoreStrip";
import {
  areTeamsValid,
  buildInitialTeams,
  buildPreviewTeams,
  canSwapMembers,
  normalizeMatchMember,
  resolveSelectedMatchType,
  type MatchMember,
  type MatchTeams,
} from "./CreateMatchDrawerBody.utils";

export interface RecordMatchDrawerBodyProps {
  /** 있으면 이 경기를 채워 수정(PUT /api/matches/:matchId)으로 연다. 없으면 새 기록(POST /api/matches) */
  editMatch?: MatchInfo;
  /** false면 저장을 막는다. 기본 true */
  isOnline?: boolean;
  /** 새 기록을 이 세션 안의 경기로 저장한다(POST 바디 sessionId). 수정(PUT)에는 쓰지 않는다 */
  sessionId?: string;
  /** 세션 화면에서 열 때 그 세션 참여자 id. 있으면 시간대와 상관없이 이 멤버를 목록 앞에 두고, 오늘 세션을 따로 조회하지 않는다 */
  sessionParticipantIds?: string[];
  /** 새 기록의 장소 기본값. 없으면 DEFAULT_MATCH_LOCATION */
  defaultLocation?: string;
  /** 입력 화면의 "취소" */
  onCancel: () => void;
  /** 저장 성공 직후 호출한다. 서버 응답(RecordedMatchResponse JSON, ratingChanges 포함)을 MatchInfo로 넘긴다. "한 판 더"로 만든 새 기록도 매번 호출한다 */
  onRecorded: (match: MatchInfo) => void;
  /** 완료 화면의 "닫기" */
  onDone: () => void;
}

type RecordablePlayer = Omit<
  MemberListPlayer,
  "createdAt" | "updatedAt" | "lastPlayedAt"
> & {
  lastPlayedAt: string | null;
};

interface ScoreDraft {
  scoreA: number | null;
  scoreB: number | null;
}

const MAX_MEMBER_COUNT = 4;
/** 멤버 목록은 2열 5행까지만 보여 준다 */
const RECENT_PLAYER_LIMIT = 10;
const SAVE_ERROR_FALLBACK = "기록을 저장하지 못했어요.";
const DAY_MS = 24 * 60 * 60 * 1000;

const inputClassName =
  "app-mobile-input w-full rounded-2xl border border-border bg-white px-4 py-2 text-base text-pkpk-sub-font outline-none";

const EMPTY_SCORE: ScoreDraft = { scoreA: null, scoreB: null };

const getTeamName = (teamIndex: number) =>
  `Team ${teamIndex === 0 ? "A" : "B"}`;

const isScoreComplete = (score: ScoreDraft): score is MatchScore =>
  score.scoreA !== null && score.scoreB !== null;

const isScoreDecided = (score: ScoreDraft): score is MatchScore =>
  isScoreComplete(score) && score.scoreA !== score.scoreB;

/**
 * 서버가 팀 구성으로 경기 타입을 추론하므로 화면은 팀 모양만 맞으면 된다.
 * 남녀 2명씩이어도 저장된 경기가 남남 대 여여였다면 무제한 복식으로 취급해 그대로 둔다.
 */
const resolveTeamMatchType = (
  members: MatchMember[],
  teams: MatchTeams,
): MatchType | null => {
  const matchType = resolveSelectedMatchType(members);

  if (
    matchType &&
    !isSinglesMatchType(matchType) &&
    !areTeamsValid(teams, matchType) &&
    areTeamsValid(teams, "unrestricted-doubles")
  ) {
    return "unrestricted-doubles";
  }

  return matchType;
};

const getLastPlayedAtMs = (lastPlayedAt: string | null) => {
  if (!lastPlayedAt) return Number.NEGATIVE_INFINITY;

  const value = new Date(lastPlayedAt).getTime();
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
};

const formatLastPlayed = (lastPlayedAt: string | null) => {
  const lastPlayedAtMs = getLastPlayedAtMs(lastPlayedAt);
  if (!Number.isFinite(lastPlayedAtMs)) {
    return null;
  }

  const lastPlayed = new Date(lastPlayedAtMs);
  const now = new Date();
  // 시각이 아니라 달력 날짜 차이로 센다
  const dayDiff = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(
        lastPlayed.getFullYear(),
        lastPlayed.getMonth(),
        lastPlayed.getDate(),
      )) /
      DAY_MS,
  );

  if (dayDiff <= 0) return "오늘";
  if (dayDiff === 1) return "어제";
  if (dayDiff < 7) return `${dayDiff}일 전`;
  return `${Math.floor(dayDiff / 7)}주 전`;
};

const toMatchMembers = (players: MatchInfo["teams"][number]["players"]) =>
  players
    .map((player) => normalizeMatchMember(player))
    .filter((member): member is MatchMember => !!member);

/** 저장된 경기의 팀 그대로, 나를 맨 앞에 두고 내 팀 → 상대 팀 순으로 멤버를 세운다 */
const buildEditInitialState = (
  editMatch: MatchInfo,
  currentPlayerId: string | undefined,
) => {
  const teams: MatchTeams = [
    toMatchMembers(editMatch.teams[0].players),
    toMatchMembers(editMatch.teams[1].players),
  ];
  const myTeamIndex = teams[1].some((member) => member.id === currentPlayerId)
    ? 1
    : 0;
  const myTeam = teams[myTeamIndex];
  const members = [
    ...myTeam.filter((member) => member.id === currentPlayerId),
    ...myTeam.filter((member) => member.id !== currentPlayerId),
    ...teams[myTeamIndex === 0 ? 1 : 0],
  ];
  const score: ScoreDraft = editMatch.scores?.[0] ?? EMPTY_SCORE;

  return { members, teams, score };
};

const swapTeamMembers = (
  teams: MatchTeams,
  sourceMemberId: string,
  targetMemberId: string,
): MatchTeams => {
  const sourceMember = teams.flat().find((m) => m.id === sourceMemberId);
  const targetMember = teams.flat().find((m) => m.id === targetMemberId);

  if (!sourceMember || !targetMember) {
    return teams;
  }

  const swap = (member: MatchMember) => {
    if (member.id === sourceMember.id) return targetMember;
    if (member.id === targetMember.id) return sourceMember;
    return member;
  };

  return [teams[0].map(swap), teams[1].map(swap)];
};

const RecordMatchDrawerBody: React.FC<RecordMatchDrawerBodyProps> = ({
  editMatch,
  isOnline = true,
  sessionId,
  sessionParticipantIds,
  defaultLocation = DEFAULT_MATCH_LOCATION,
  onCancel,
  onRecorded,
  onDone,
}) => {
  const { player } = useAuth();
  const currentPlayerMember = useMemo(
    () => normalizeMatchMember(player),
    [player],
  );
  const [initialState] = useState(() => {
    if (editMatch) {
      return buildEditInitialState(editMatch, player?.id);
    }

    const members = currentPlayerMember ? [currentPlayerMember] : [];
    return {
      members,
      teams: buildInitialTeams(members, resolveSelectedMatchType(members)),
      score: EMPTY_SCORE,
    };
  });

  const [members, setMembers] = useState<MatchMember[]>(initialState.members);
  const [teams, setTeams] = useState<MatchTeams>(initialState.teams);
  const [selectedSwapMemberId, setSelectedSwapMemberId] = useState<
    string | null
  >(null);
  const [score, setScore] = useState<ScoreDraft>(initialState.score);
  const [location, setLocation] = useState(
    editMatch ? editMatch.location : defaultLocation,
  );
  const [matchName, setMatchName] = useState(editMatch?.name ?? "");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // "한 판 더" 이후에는 수정으로 열었더라도 새 기록이다
  const [editingMatchId, setEditingMatchId] = useState<string | null>(
    editMatch?.id ?? null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recordedMatch, setRecordedMatch] = useState<MatchInfo | null>(null);

  const [players, setPlayers] = useState<RecordablePlayer[]>([]);
  const [isPlayersError, setIsPlayersError] = useState(false);
  const [todaySessionMemberIds, setTodaySessionMemberIds] = useState<
    Set<string>
  >(
    () => new Set(),
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const loadPlayers = async () => {
      try {
        const res = await apiFetch("/api/players");
        if (!res.ok) {
          throw new Error("players request failed");
        }

        const data = (await res.json()) as RecordablePlayer[];
        if (!isCancelled) {
          setPlayers(data);
          setIsPlayersError(false);
        }
      } catch {
        if (!isCancelled) {
          setIsPlayersError(true);
        }
      }
    };

    void loadPlayers();

    return () => {
      isCancelled = true;
    };
  }, []);

  const isEditing = !!editMatch;
  const hasSessionParticipants = !!sessionParticipantIds;

  // 세션 시간이면 내가 참여한 오늘 세션 멤버를 목록 앞에 둔다. 세션 화면에서 열었거나 기존 경기를 수정할 때는 조회하지 않는다
  useEffect(() => {
    if (isEditing || hasSessionParticipants) {
      return undefined;
    }

    let isCancelled = false;

    const loadTodaySessionMembers = async () => {
      try {
        const { sessions } = await fetchTodayMatchSessions();
        if (!isCancelled) {
          setTodaySessionMemberIds(
            getPrioritySessionMemberIds(sessions, player?.id),
          );
        }
      } catch {
        // 우선 추천은 부가 기능이라 실패를 알리지 않고 최근 함께 친 순서로 둔다
        if (!isCancelled) {
          setTodaySessionMemberIds(new Set());
        }
      }
    };

    void loadTodaySessionMembers();

    return () => {
      isCancelled = true;
    };
  }, [hasSessionParticipants, isEditing, player?.id]);

  const sessionMemberIds = useMemo(
    () =>
      sessionParticipantIds
        ? new Set(sessionParticipantIds.filter((id) => id !== player?.id))
        : todaySessionMemberIds,
    [player?.id, sessionParticipantIds, todaySessionMemberIds],
  );

  const applyMembers = useCallback((nextMembers: MatchMember[]) => {
    setMembers(nextMembers);
    setTeams(
      buildInitialTeams(nextMembers, resolveSelectedMatchType(nextMembers)),
    );
    setSelectedSwapMemberId(null);
    setSaveError(null);
  }, []);

  // 본인은 기본값으로 한 번만 채운다. 세션 복원이 늦어 마운트 시점에 내가 없었다면
  // 들어오는 즉시 한 번 채우고, 이후 사용자가 비운 자리는 다시 채우지 않는다
  const hasSeededCurrentPlayerRef = useRef(
    !!editMatch || !!currentPlayerMember,
  );
  useEffect(() => {
    if (hasSeededCurrentPlayerRef.current || !currentPlayerMember) {
      return;
    }

    hasSeededCurrentPlayerRef.current = true;
    applyMembers([currentPlayerMember]);
  }, [applyMembers, currentPlayerMember]);

  const matchType = useMemo(
    () => resolveTeamMatchType(members, teams),
    [members, teams],
  );
  const previewTeams = useMemo(
    () => buildPreviewTeams(members, teams, matchType),
    [matchType, members, teams],
  );
  const isTeamReady = !!matchType && areTeamsValid(teams, matchType);
  const isScoreDraw = isScoreComplete(score) && score.scoreA === score.scoreB;
  const scoresForSave: MatchScore[] | null = isScoreDecided(score)
    ? [score]
    : null;
  const scoreWinnerIndex = getWinningTeamIndex(scoresForSave ?? undefined);
  const trimmedLocation = location.trim();
  const trimmedMatchName = matchName.trim();
  const canSave =
    isTeamReady &&
    !!scoresForSave &&
    !!trimmedLocation &&
    isOnline &&
    !isSaving;

  const recentPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return players
      .filter(
        (candidate) =>
          candidate.status === "active" &&
          (!normalizedQuery ||
            candidate.username.toLocaleLowerCase().includes(normalizedQuery)),
      )
      .sort(
        (a, b) =>
          Number(sessionMemberIds.has(b.id)) -
            Number(sessionMemberIds.has(a.id)) ||
          getLastPlayedAtMs(b.lastPlayedAt) - getLastPlayedAtMs(a.lastPlayedAt),
      )
      .slice(0, RECENT_PLAYER_LIMIT);
  }, [players, query, sessionMemberIds]);

  const handlePickPlayer = (candidate: RecordablePlayer) => {
    const member = normalizeMatchMember(candidate);
    if (
      !member ||
      members.length >= MAX_MEMBER_COUNT ||
      members.some((existing) => existing.id === member.id)
    ) {
      return;
    }

    applyMembers([...members, member]);
    setQuery("");
  };

  const handleRemoveMember = (memberId: string) => {
    applyMembers(members.filter((member) => member.id !== memberId));
  };

  const handlePressMember = (member: MatchMember) => {
    if (selectedSwapMemberId === member.id) {
      setSelectedSwapMemberId(null);
      return;
    }

    if (!selectedSwapMemberId) {
      setSelectedSwapMemberId(member.id);
      return;
    }

    if (!canSwapMembers(teams, matchType, selectedSwapMemberId, member)) {
      return;
    }

    setTeams((prev) => swapTeamMembers(prev, selectedSwapMemberId, member.id));
    setSelectedSwapMemberId(null);
  };

  const handleScoreChange = (teamIndex: 0 | 1, value: number) => {
    setScore((prev) => ({
      ...prev,
      [teamIndex === 0 ? "scoreA" : "scoreB"]: value,
    }));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!canSave || !scoresForSave) {
      return;
    }

    const body: RecordMatchRequest = {
      ...(trimmedMatchName ? { name: trimmedMatchName } : {}),
      teams: [
        { name: getTeamName(0), playerIds: teams[0].map((m) => m.id) },
        { name: getTeamName(1), playerIds: teams[1].map((m) => m.id) },
      ],
      location: trimmedLocation,
      scores: scoresForSave,
      ...(!editingMatchId && sessionId ? { sessionId } : {}),
    };

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await apiFetch(
        editingMatchId
          ? `/api/matches/${encodeURIComponent(editingMatchId)}`
          : "/api/matches",
        {
          method: editingMatchId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSaveError(errorData.error || SAVE_ERROR_FALLBACK);
        return;
      }

      const savedMatch = (await res.json()) as MatchInfo;

      rememberRecentInputValue("web.match.location", trimmedLocation);
      if (trimmedMatchName) {
        rememberRecentInputValue("web.match.name", trimmedMatchName);
      }

      onRecorded(savedMatch);
      setRecordedMatch(savedMatch);
    } catch {
      setSaveError(SAVE_ERROR_FALLBACK);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlayAgain = () => {
    setRecordedMatch(null);
    setEditingMatchId(null);
    setScore(EMPTY_SCORE);
    setSelectedSwapMemberId(null);
    setSaveError(null);
  };

  if (recordedMatch) {
    return (
      <RecordMatchCompletion
        match={recordedMatch}
        currentPlayerId={player?.id}
        onDone={onDone}
        onPlayAgain={handlePlayAgain}
      />
    );
  }

  const settingsSummary = [
    trimmedLocation || "장소 없음",
    trimmedMatchName || "자동",
  ].join(" · ");

  return (
    <>
      <BottomSheet.Header>
        <h2 className="bs-text-head text-left text-pkpk-main-font">경기 기록</h2>
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0 pb-4">
        <BottomSheetSection>
          <p className="bs-text-title text-pkpk-sub-font">팀 구성</p>
          <CreateMatchTeamGrid
            previewTeams={previewTeams}
            teams={teams}
            selectedMatchType={matchType}
            selectedSwapMemberId={selectedSwapMemberId}
            currentPlayerMemberId={currentPlayerMember?.id}
            interactive
            onRemoveMember={handleRemoveMember}
            onPressMember={handlePressMember}
          />
        </BottomSheetSection>

        {members.length < MAX_MEMBER_COUNT ? (
          <BottomSheetSection>
            <div className="flex items-center justify-between">
              <p className="bs-text-title text-pkpk-sub-font">
                최근 함께 친 멤버
              </p>
              <span className="bs-text-caption text-pkpk-detail-font">
                {members.length}/{MAX_MEMBER_COUNT}
              </span>
            </div>
            <div className="relative">
              <IoSearch className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-pkpk-detail-font" />
              <input
                type="search"
                aria-label="이름 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름 검색"
                className="app-mobile-input w-full rounded-2xl border border-border bg-white py-2 pl-10 pr-4 text-base text-pkpk-sub-font outline-none"
              />
            </div>
            {isPlayersError ? (
              <p className="bs-text-caption text-error">
                멤버 목록을 불러오지 못했어요.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 pt-1">
                {recentPlayers.map((candidate) => {
                  const isPicked = members.some(
                    (member) => member.id === candidate.id,
                  );
                  const isSessionMember = sessionMemberIds.has(candidate.id);
                  const lastPlayedLabel = formatLastPlayed(
                    candidate.lastPlayedAt,
                  );

                  return (
                    <div
                      key={candidate.id}
                      className={`min-w-0 ${isPicked ? "opacity-35" : ""}`}
                    >
                      <UserChip
                        player={candidate}
                        isPressable={!isPicked}
                        isDisabled={isPicked}
                        onPress={
                          isPicked
                            ? undefined
                            : () => handlePickPlayer(candidate)
                        }
                        endAdornment={
                          isSessionMember ? (
                            <span className="text-[0.65rem] font-semibold text-emerald-600">
                              세션
                            </span>
                          ) : lastPlayedLabel ? (
                            <span className="text-[0.65rem] font-medium text-pkpk-detail-font">
                              {lastPlayedLabel}
                            </span>
                          ) : undefined
                        }
                        chipWidthClass="w-full"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </BottomSheetSection>
        ) : null}

        {isTeamReady ? (
          <BottomSheetSection>
            <p className="bs-text-title text-pkpk-sub-font">스코어</p>
            {isScoreDraw ? (
              <p className="bs-text-caption text-error">
                같은 점수는 저장할 수 없어요.
              </p>
            ) : null}
            {([0, 1] as const).map((teamIndex) => (
              <RecordMatchScoreStrip
                key={teamIndex}
                teamIndex={teamIndex}
                names={teams[teamIndex]
                  .map((member) => member.username)
                  .join(" · ")}
                value={
                  teamIndex === 0 ? score.scoreA : score.scoreB
                }
                isWinner={scoreWinnerIndex === teamIndex}
                onChange={(value) => handleScoreChange(teamIndex, value)}
              />
            ))}
          </BottomSheetSection>
        ) : null}

        {isSettingsOpen ? (
          <div className="flex flex-col gap-2">
            <BottomSheetSection>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="record-location"
                  className="bs-text-title text-pkpk-sub-font"
                >
                  장소
                </label>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-sm font-semibold text-[#409eff]"
                >
                  접기
                </button>
              </div>
              <RecentValueComboBox
                id="record-location"
                fieldKey="web.match.location"
                value={location}
                onChange={(nextValue) => {
                  setLocation(nextValue);
                  setSaveError(null);
                }}
                required
                placeholder="장소 입력"
                className="w-full"
                inputClassName={inputClassName}
              />
            </BottomSheetSection>
            <BottomSheetSection>
              <label
                htmlFor="record-name"
                className="bs-text-title text-pkpk-sub-font"
              >
                매치 이름
              </label>
              <RecentValueComboBox
                id="record-name"
                fieldKey="web.match.name"
                value={matchName}
                onChange={(nextValue) => {
                  setMatchName(nextValue);
                  setSaveError(null);
                }}
                placeholder="비우면 자동"
                className="w-full"
                inputClassName={inputClassName}
              />
            </BottomSheetSection>
          </div>
        ) : (
          <BottomSheetSection className="!py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="bs-text-caption text-pkpk-detail-font">
                  장소 · 모드 · 이름
                </p>
                <p className="bs-text-body truncate text-pkpk-sub-font">
                  {settingsSummary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="shrink-0 text-sm font-semibold text-[#409eff]"
              >
                변경
              </button>
            </div>
          </BottomSheetSection>
        )}
      </BottomSheet.Body>
      <BottomSheet.Footer className="flex flex-col gap-2">
        {saveError ? (
          <p className="bs-text-body text-error">{saveError}</p>
        ) : null}
        <div className="grid w-full grid-cols-3 gap-2">
          <Button
            className="app-action-button w-full rounded-2xl bg-red-50 py-3 text-base font-semibold text-red-500"
            isDisabled={isSaving}
            onPress={onCancel}
          >
            취소
          </Button>
          <HoldToConfirmButton
            ariaLabel="길게 눌러 기록 저장"
            holdDurationMs={SAVE_HOLD_DURATION_MS}
            onComplete={() => void handleSave()}
            isDisabled={!canSave}
            className="col-span-2"
          >
            {isOnline ? "길게 눌러 기록 저장" : "온라인 연결 필요"}
          </HoldToConfirmButton>
        </div>
      </BottomSheet.Footer>
    </>
  );
};

interface RecordMatchCompletionProps {
  match: MatchInfo;
  currentPlayerId?: string;
  onDone: () => void;
  onPlayAgain: () => void;
}

const RecordMatchCompletion: React.FC<RecordMatchCompletionProps> = ({
  match,
  currentPlayerId,
  onDone,
  onPlayAgain,
}) => {
  const ratingCategory = getMatchTopLevelType(match.type);
  const ratingRows = useMemo(() => {
    const changeByPlayerId = new Map<string, PlayerRatingChangeLog>(
      (match.ratingChanges ?? []).map((change) => [change.playerId, change]),
    );

    return match.teams
      .flatMap((team) => team.players)
      .flatMap((teamPlayer) => {
        const change = changeByPlayerId.get(teamPlayer.id);
        return change ? [{ player: teamPlayer, change }] : [];
      });
  }, [match]);

  return (
    <>
      <BottomSheet.Header>
        <h2 className="bs-text-head text-left text-pkpk-main-font">기록 완료</h2>
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0 pb-4">
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-700">
          <IoCheckmarkCircle className="size-5 shrink-0" />
          <p className="bs-text-body font-semibold">
            확정됐고 평점에 바로 반영됐어요.
          </p>
        </div>
        <MatchCard
          match={match}
          currentPlayerId={currentPlayerId}
          showChevron={false}
        />
        <BottomSheetSection>
          <p className="bs-text-title text-pkpk-sub-font">평점 변동</p>
          {ratingRows.length > 0 ? (
            <div className="flex flex-col gap-2">
              {ratingRows.map(({ player: ratedPlayer, change }) => (
                <div
                  key={ratedPlayer.id}
                  className="flex items-center justify-between gap-3"
                >
                  <p
                    className={`min-w-0 truncate text-sm text-slate-900 ${
                      ratedPlayer.id === currentPlayerId
                        ? "font-bold"
                        : "font-medium"
                    }`}
                  >
                    {ratedPlayer.username}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium tabular-nums text-slate-900">
                      {formatRating(change.previousRating[ratingCategory])}
                      <span className="mx-1 text-slate-400">→</span>
                      <span className="font-semibold text-pkpk-dupr-font">
                        {formatRating(change.nextRating[ratingCategory])}
                      </span>
                    </span>
                    <RatingDeltaChip delta={change.delta[ratingCategory]} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-pkpk-sub-font">
              평점 변동 내역이 없어요.
            </p>
          )}
        </BottomSheetSection>
      </BottomSheet.Body>
      <BottomSheet.Footer>
        <div className="grid w-full grid-cols-3 gap-2">
          <Button
            className="app-action-button w-full rounded-2xl bg-slate-100 py-3 text-base font-semibold text-pkpk-sub-font"
            onPress={onDone}
          >
            닫기
          </Button>
          <Button
            className="app-action-button col-span-2 w-full rounded-2xl bg-[#409eff] py-3 text-base font-semibold text-white"
            onPress={onPlayAgain}
          >
            같은 멤버로 한 판 더
          </Button>
        </div>
      </BottomSheet.Footer>
    </>
  );
};

export default RecordMatchDrawerBody;
