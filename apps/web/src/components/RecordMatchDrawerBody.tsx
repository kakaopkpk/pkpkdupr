import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { IoCheckmarkCircle, IoSearch } from "react-icons/io5";
import type {
  MatchMode,
  MatchScore,
  MatchType,
  RecordMatchRequest,
} from "@pkpkdupr/shared/match";
import {
  DEFAULT_MATCH_MODE,
  getMatchTopLevelType,
  isSinglesMatchType,
  validateMatchScoresForMode,
} from "@pkpkdupr/shared/match";
import type {
  MemberListPlayer,
  PlayerRatingChangeLog,
} from "@pkpkdupr/shared/player";
import { rememberRecentInputValue } from "@pkpkdupr/shared/recentInputHistory";
import type { MatchInfo } from "@/components/Match";
import MatchCard from "@/components/Match";
import UserChip from "@/components/UserChip";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { formatRating } from "@/utils/dupr";
import BottomSheet from "./BottomSheet";
import BottomSheetSection from "./BottomSheetSection";
import CreateMatchModeSelector from "./CreateMatchModeSelector";
import CreateMatchTeamGrid from "./CreateMatchTeamGrid";
import HoldToConfirmButton from "./HoldToConfirmButton";
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

interface SetScoreDraft {
  scoreA: number | null;
  scoreB: number | null;
}

type SetIndex = 0 | 1 | 2;

const DEFAULT_LOCATION = "야탑초등학교";
const MAX_MEMBER_COUNT = 4;
/** 멤버 목록은 2열 5행까지만 보여 준다 */
const RECENT_PLAYER_LIMIT = 10;
const SAVE_HOLD_DURATION_MS = 3000;
const SAVE_ERROR_FALLBACK = "기록을 저장하지 못했어요.";
const SET_INDEXES: SetIndex[] = [0, 1, 2];
const DAY_MS = 24 * 60 * 60 * 1000;

const inputClassName =
  "app-mobile-input w-full rounded-2xl border border-border bg-white px-4 py-2 text-base text-pkpk-sub-font outline-none";

const createEmptySets = (): SetScoreDraft[] =>
  SET_INDEXES.map(() => ({ scoreA: null, scoreB: null }));

const getTeamName = (teamIndex: number) =>
  `Team ${teamIndex === 0 ? "A" : "B"}`;

const isSetComplete = (
  set: SetScoreDraft | undefined,
): set is MatchScore =>
  !!set && set.scoreA !== null && set.scoreB !== null;

const isSetDecided = (set: SetScoreDraft | undefined): set is MatchScore =>
  isSetComplete(set) && set.scoreA !== set.scoreB;

const getSetWinnerIndex = (set: MatchScore): 0 | 1 =>
  set.scoreA > set.scoreB ? 0 : 1;

/** 1·2세트 승자가 갈렸을 때만 3세트를 친다 */
const isThirdSetNeeded = (sets: SetScoreDraft[]) =>
  isSetDecided(sets[0]) &&
  isSetDecided(sets[1]) &&
  getSetWinnerIndex(sets[0]) !== getSetWinnerIndex(sets[1]);

/** 앞 세트가 모두 승부가 났을 때만 다음 세트로 갈 수 있다 */
const isSetSelectable = (sets: SetScoreDraft[], setIndex: SetIndex) =>
  sets.slice(0, setIndex).every((set) => isSetDecided(set));

/**
 * 실제로 치른 세트만 골라 저장할 점수 목록을 만든다.
 * 한 팀이 2세트를 먼저 이기면 이후 세트는 버리고, 승부가 안 났거나 동점 세트가 있으면 null이다.
 */
const buildScoresForSave = (
  mode: MatchMode,
  sets: SetScoreDraft[],
): MatchScore[] | null => {
  if (mode === "single-game") {
    const set = sets[0];
    return isSetDecided(set)
      ? [{ scoreA: set.scoreA, scoreB: set.scoreB }]
      : null;
  }

  const wins: [number, number] = [0, 0];
  const scores: MatchScore[] = [];

  for (const set of sets) {
    if (!isSetDecided(set)) {
      return null;
    }

    scores.push({ scoreA: set.scoreA, scoreB: set.scoreB });
    wins[getSetWinnerIndex(set)] += 1;

    if (wins[0] === 2 || wins[1] === 2) {
      return scores;
    }
  }

  return null;
};

const isScoresValidForMode = (mode: MatchMode, scores: MatchScore[]) => {
  try {
    validateMatchScoresForMode(mode, scores);
    return true;
  } catch {
    return false;
  }
};

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
  const sets = createEmptySets();
  const savedScores =
    editMatch.mode === "single-game"
      ? (editMatch.scores ?? []).slice(0, 1)
      : (editMatch.scores ?? []);

  savedScores.slice(0, SET_INDEXES.length).forEach((score, index) => {
    sets[index] = { scoreA: score.scoreA, scoreB: score.scoreB };
  });

  return { members, teams, sets };
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
      sets: createEmptySets(),
    };
  });

  const [members, setMembers] = useState<MatchMember[]>(initialState.members);
  const [teams, setTeams] = useState<MatchTeams>(initialState.teams);
  const [selectedSwapMemberId, setSelectedSwapMemberId] = useState<
    string | null
  >(null);
  const [matchMode, setMatchMode] = useState<MatchMode>(
    editMatch?.mode ?? DEFAULT_MATCH_MODE,
  );
  const [sets, setSets] = useState<SetScoreDraft[]>(initialState.sets);
  const [activeSetIndex, setActiveSetIndex] = useState<SetIndex>(0);
  const [location, setLocation] = useState(
    editMatch ? editMatch.location : DEFAULT_LOCATION,
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

  const applyMembers = useCallback((nextMembers: MatchMember[]) => {
    setMembers(nextMembers);
    setTeams(
      buildInitialTeams(nextMembers, resolveSelectedMatchType(nextMembers)),
    );
    setSelectedSwapMemberId(null);
    setSaveError(null);
  }, []);

  // 세션 복원이 늦어 마운트 시점에 내가 없었다면 들어오는 즉시 첫 멤버로 넣는다
  useEffect(() => {
    if (currentPlayerMember && members.length === 0) {
      applyMembers([currentPlayerMember]);
    }
  }, [applyMembers, currentPlayerMember, members.length]);

  const matchType = useMemo(
    () => resolveTeamMatchType(members, teams),
    [members, teams],
  );
  const previewTeams = useMemo(
    () => buildPreviewTeams(members, teams, matchType),
    [matchType, members, teams],
  );
  const isTeamReady = !!matchType && areTeamsValid(teams, matchType);
  const isBestOfThree = matchMode === "best-of-3";
  const visibleSetIndexes = useMemo(
    () =>
      isThirdSetNeeded(sets) ? SET_INDEXES : SET_INDEXES.slice(0, 2),
    [sets],
  );
  const selectedSetIndex: SetIndex = isBestOfThree
    ? visibleSetIndexes.includes(activeSetIndex)
      ? activeSetIndex
      : 0
    : 0;
  const selectedSet = sets[selectedSetIndex];
  const isSelectedSetDraw =
    isSetComplete(selectedSet) && selectedSet.scoreA === selectedSet.scoreB;
  const selectedSetWinnerIndex = isSetDecided(selectedSet)
    ? getSetWinnerIndex(selectedSet)
    : null;
  const scoresForSave = useMemo(
    () => buildScoresForSave(matchMode, sets),
    [matchMode, sets],
  );
  const trimmedLocation = location.trim();
  const trimmedMatchName = matchName.trim();
  const canSave =
    isTeamReady &&
    !!scoresForSave &&
    isScoresValidForMode(matchMode, scoresForSave) &&
    !!trimmedLocation &&
    isOnline &&
    !isSaving;

  const recentPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const candidates = players
      .filter(
        (candidate) =>
          candidate.id !== player?.id && candidate.status === "active",
      )
      .sort(
        (a, b) =>
          getLastPlayedAtMs(b.lastPlayedAt) - getLastPlayedAtMs(a.lastPlayedAt),
      );

    const matched = normalizedQuery
      ? candidates.filter((candidate) =>
          candidate.username.toLocaleLowerCase().includes(normalizedQuery),
        )
      : candidates;

    return matched.slice(0, RECENT_PLAYER_LIMIT);
  }, [player?.id, players, query]);

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
    if (memberId === currentPlayerMember?.id) {
      return;
    }

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
    setSets((prev) =>
      prev.map((set, index) =>
        index === selectedSetIndex
          ? { ...set, [teamIndex === 0 ? "scoreA" : "scoreB"]: value }
          : set,
      ),
    );
    setSaveError(null);
  };

  const handleMatchModeChange = (nextMode: MatchMode) => {
    if (nextMode === matchMode) {
      return;
    }

    setMatchMode(nextMode);
    // 모드를 바꾸면 기존 점수는 1세트로만 남는다
    setSets((prev) => [prev[0], ...createEmptySets().slice(1)]);
    setActiveSetIndex(0);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!canSave || !scoresForSave) {
      return;
    }

    const body: RecordMatchRequest = {
      ...(trimmedMatchName ? { name: trimmedMatchName } : {}),
      mode: matchMode,
      teams: [
        { name: getTeamName(0), playerIds: teams[0].map((m) => m.id) },
        { name: getTeamName(1), playerIds: teams[1].map((m) => m.id) },
      ],
      location: trimmedLocation,
      scores: scoresForSave,
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
    setSets(createEmptySets());
    setActiveSetIndex(0);
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
    isBestOfThree ? "2선승" : "단판",
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
                          lastPlayedLabel ? (
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
            {isBestOfThree ? (
              <div
                role="tablist"
                aria-label="세트 선택"
                className="flex gap-1.5"
              >
                {visibleSetIndexes.map((setIndex) => {
                  const set = sets[setIndex];
                  const isSelected = setIndex === selectedSetIndex;
                  const isSelectable = isSetSelectable(sets, setIndex);

                  return (
                    <button
                      key={setIndex}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      disabled={!isSelectable}
                      onClick={() => setActiveSetIndex(setIndex)}
                      className={`flex flex-1 flex-col items-center rounded-xl border px-2 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                        isSelected
                          ? "border-pkpk-main-font bg-pkpk-main-font text-white"
                          : "border-border bg-white text-pkpk-sub-font"
                      }`}
                    >
                      <span>{setIndex + 1}세트</span>
                      <span className="text-xs font-medium tabular-nums">
                        {isSetComplete(set)
                          ? `${set.scoreA}:${set.scoreB}`
                          : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {isSelectedSetDraw ? (
              <p className="bs-text-caption text-error">
                같은 점수는 저장할 수 없어요.
              </p>
            ) : null}
            {([0, 1] as const).map((teamIndex) => (
              <RecordMatchScoreStrip
                // 세트를 바꾸면 리마운트해서 그 세트 값(없으면 9)을 다시 가운데로 맞춘다
                key={`${selectedSetIndex}-${teamIndex}`}
                teamIndex={teamIndex}
                names={teams[teamIndex]
                  .map((member) => member.username)
                  .join(" · ")}
                value={
                  teamIndex === 0 ? selectedSet.scoreA : selectedSet.scoreB
                }
                isWinner={selectedSetWinnerIndex === teamIndex}
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
              <CreateMatchModeSelector
                selectedMatchMode={matchMode}
                onChange={handleMatchModeChange}
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

        {saveError ? (
          <p className="bs-text-body text-error">{saveError}</p>
        ) : null}
      </BottomSheet.Body>
      <BottomSheet.Footer>
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
            className="app-action-button col-span-2 w-full justify-center rounded-2xl bg-[#409eff] px-3 py-3 text-base font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
            progressClassName="bg-white/20"
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
