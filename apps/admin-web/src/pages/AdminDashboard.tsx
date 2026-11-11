import React, { useState, useEffect } from "react";
import type {
  OfficialDuprAdjustmentPreview,
  Player,
  PlayerCreationLog,
  PlayerCreationSource,
  PlayerDuprMetrics,
  PublicPlayerDupr,
  PlayerRatingChangeLog,
  PlayerStatus,
  PlayerStatusChangeLog,
} from "@pkpkdupr/shared/player";
import {
  getCompositeDoublesRating,
  getCompositeSinglesRating,
} from "@pkpkdupr/shared/player";
import {
  getMatchTopLevelType,
  matchModeLabels,
  matchSourceLabels,
  matchTypeLabels,
  type MatchMode,
  type MatchScore,
  type MatchSource,
  type MatchStatus,
  type MatchType,
} from "@pkpkdupr/shared/match";
import { rememberRecentInputValue } from "@pkpkdupr/shared/recentInputHistory";
import {
  isValidUsername,
  type AdminPasswordResetResponse,
  type AdminRegisterPlayerRequest,
  type AdminRegisterPlayerResponse,
  type AdminUpdateUsernameRequest,
  type AdminUpdateUsernameResponse,
} from "@pkpkdupr/shared/auth";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import IssuedPasswordNotice, {
  type IssuedCredential,
} from "../components/IssuedPasswordNotice";
import AdminMatchBatchForm, {
  type AdminBatchMatchSubmitPayload,
} from "../components/AdminMatchBatchForm";
import AdminSessionManager from "../components/AdminSessionManager";
import AdminSidebar, {
  adminSectionInfo,
  type AdminSection,
} from "../components/AdminSidebar";
import RatingComparisonPanel, {
  type RatingMethodComparison,
} from "../components/RatingComparisonPanel";
import RecentValueComboBox from "../components/RecentValueComboBox";

type PlayerInfo = Pick<
  Player,
  "id" | "username" | "duprRating" | "gender" | "status"
> & {
  duprMetrics: PlayerDuprMetrics;
  createdAt: string;
  updatedAt: string;
};

type PlayerGender = Player["gender"];
type PlayerStatusLogsByPlayerId = Record<string, PlayerStatusChangeLog[]>;
type PlayerCreationLogsByPlayerId = Record<string, PlayerCreationLog[]>;
type MatchPlayerInfo = Pick<
  Player,
  "id" | "username" | "gender" | "status" | "duprRating"
>;
type MatchTeamInfo = {
  id: string;
  name: string;
  players: MatchPlayerInfo[];
};
type MatchSessionInfo = {
  id: string;
  name?: string;
  date: string;
  location: string;
};
type ManagedSessionInfo = {
  id: string;
  name: string;
  date: string;
  location: string;
  matchCount: number;
};
type MatchInfo = {
  id: string;
  type: MatchType;
  mode: MatchMode;
  source: MatchSource;
  creatorPlayerId: string;
  name?: string;
  sessionName?: string;
  session?: MatchSessionInfo;
  status: MatchStatus;
  teams: [MatchTeamInfo, MatchTeamInfo];
  scores?: MatchScore[];
  resultSubmittedByPlayerId: string | null;
  resultSubmittedAt: string | null;
  location?: string;
  matchStartsAt: string;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
};

const recentInputFieldKeys = {
  matchName: "admin.match.name",
} as const;

const toLocalDateTimeInputValue = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const serializeLocalDateTimeInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("경기 예정 일시를 확인해주세요.");
  }

  return date.toISOString();
};

const genderLabelMap: Record<PlayerGender, string> = {
  M: "남",
  F: "여",
};

const statusLabelMap: Record<PlayerStatus, string> = {
  active: "활성",
  inactive: "비활성",
};

const statusBadgeClassMap: Record<PlayerStatus, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-slate-200 text-slate-700",
};

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

const creationSourceLabelMap: Record<PlayerCreationSource, string> = {
  self_register: "일반 가입",
  admin_register: "관리자 생성",
  bootstrap: "초기 관리자 생성",
  invite: "초대 코드 가입",
};

const formatDupr = (value?: number | null) =>
  typeof value === "number" ? value.toFixed(3) : "NR";

const formatConfidence = (value?: number | null) =>
  typeof value === "number" ? `${Math.round(value)}%` : "-";

const formatDuprDelta = (value?: number) => {
  if (typeof value !== "number") {
    return "-";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
};

const parseOptionalNumberInput = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
};

const getCompositeSinglesConfidence = (metrics?: PlayerDuprMetrics | null) =>
  metrics?.singles.confidence ?? null;

const getCompositeDoublesConfidence = (metrics?: PlayerDuprMetrics | null) =>
  metrics?.doubles.confidence ?? null;

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getScoreLabel = (scores?: MatchScore[]) => {
  if (!scores?.length) {
    return "-";
  }

  return scores.map((score) => `${score.scoreA}:${score.scoreB}`).join(" · ");
};

const getDisplayRatingForMatchType = (
  matchType: MatchType,
  duprRating?: PublicPlayerDupr | null,
) =>
  getMatchTopLevelType(matchType) === "singles"
    ? (duprRating?.singles ?? null)
    : (duprRating?.doubles ?? null);

const getTeamLabel = (team: MatchTeamInfo, matchType: MatchType) =>
  team.players
    .map((member) => {
      const displayRating = getDisplayRatingForMatchType(
        matchType,
        member.duprRating,
      );
      return `${member.username} (${formatDupr(displayRating)})`;
    })
    .join(", ") || team.name;

const normalizeDraftValue = (value: string) => value.trim();

const USERNAME_FORMAT_HINT =
  "아이디는 영문·숫자·.·_·-만 쓸 수 있고 64자 이하여야 합니다. (.은 맨 앞·맨 뒤에 오거나 연달아 올 수 없습니다.)";

const readErrorMessage = async (res: Response, fallback: string) => {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || fallback;
};

const AdminDashboard: React.FC = () => {
  const { player, isAdmin, logout } = useAuth();
  const [activeSection, setActiveSection] =
    useState<AdminSection>("members");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [sessions, setSessions] = useState<ManagedSessionInfo[]>([]);
  const [ratingComparison, setRatingComparison] =
    useState<RatingMethodComparison | null>(null);
  const [isLoadingRatingComparison, setIsLoadingRatingComparison] =
    useState(false);
  const [ratingComparisonError, setRatingComparisonError] = useState<
    string | null
  >(null);
  const [isMatchListExpanded, setIsMatchListExpanded] = useState(true);
  const [statusLogsByPlayerId, setStatusLogsByPlayerId] =
    useState<PlayerStatusLogsByPlayerId>({});
  const [creationLogsByPlayerId, setCreationLogsByPlayerId] =
    useState<PlayerCreationLogsByPlayerId>({});
  const [genderDrafts, setGenderDrafts] = useState<
    Record<string, PlayerGender>
  >({});
  const [statusDrafts, setStatusDrafts] = useState<
    Record<string, PlayerStatus>
  >({});
  const [matchNameDrafts, setMatchNameDrafts] = useState<
    Record<string, string>
  >({});
  const [matchStartsAtDrafts, setMatchStartsAtDrafts] = useState<
    Record<string, string>
  >({});
  const [matchSessionIdDrafts, setMatchSessionIdDrafts] = useState<
    Record<string, string>
  >({});
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [bulkSessionId, setBulkSessionId] = useState("");
  const [bulkMatchLocation, setBulkMatchLocation] = useState("");
  const [bulkMatchStartsAt, setBulkMatchStartsAt] = useState("");
  const [savingGenderPlayerId, setSavingGenderPlayerId] = useState<
    string | null
  >(null);
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);
  const [usernameDrafts, setUsernameDrafts] = useState<Record<string, string>>(
    {},
  );
  const [savingUsernamePlayerId, setSavingUsernamePlayerId] = useState<
    string | null
  >(null);
  const [resettingPasswordPlayerId, setResettingPasswordPlayerId] = useState<
    string | null
  >(null);
  // 서버가 한 번만 돌려주는 발급 비밀번호. 화면 상태에만 두고 저장하지 않는다.
  const [issuedCredential, setIssuedCredential] =
    useState<IssuedCredential | null>(null);
  const [savingMatchMetadataIds, setSavingMatchMetadataIds] = useState<
    string[]
  >([]);
  const [isSavingBulkMatchMetadata, setIsSavingBulkMatchMetadata] =
    useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [officialPlayerId, setOfficialPlayerId] = useState("");
  const [officialReason, setOfficialReason] = useState("");
  const [officialRatings, setOfficialRatings] = useState({
    singles: "",
    doubles: "",
  });
  const [officialConfidence, setOfficialConfidence] = useState({
    singles: "",
    doubles: "",
  });
  const [officialPreview, setOfficialPreview] =
    useState<OfficialDuprAdjustmentPreview | null>(null);
  const [isPreviewingOfficialDupr, setIsPreviewingOfficialDupr] =
    useState(false);
  const [isApplyingOfficialDupr, setIsApplyingOfficialDupr] = useState(false);
  const [isRecalculatingRatings, setIsRecalculatingRatings] = useState(false);
  const [isSavingAdminMatches, setIsSavingAdminMatches] = useState(false);
  const [adminMatchFormResetKey, setAdminMatchFormResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const syncGenderDrafts = (loadedPlayers: PlayerInfo[]) => {
    setGenderDrafts((prev) => {
      const next: Record<string, PlayerGender> = {};
      loadedPlayers.forEach((loadedPlayer) => {
        next[loadedPlayer.id] = prev[loadedPlayer.id] ?? loadedPlayer.gender;
      });
      return next;
    });
  };

  const syncUsernameDrafts = (loadedPlayers: PlayerInfo[]) => {
    setUsernameDrafts((prev) => {
      const next: Record<string, string> = {};
      loadedPlayers.forEach((loadedPlayer) => {
        next[loadedPlayer.id] = prev[loadedPlayer.id] ?? loadedPlayer.username;
      });
      return next;
    });
  };

  const syncStatusDrafts = (loadedPlayers: PlayerInfo[]) => {
    setStatusDrafts((prev) => {
      const next: Record<string, PlayerStatus> = {};
      loadedPlayers.forEach((loadedPlayer) => {
        next[loadedPlayer.id] = prev[loadedPlayer.id] ?? loadedPlayer.status;
      });
      return next;
    });
  };

  const syncMatchDrafts = (loadedMatches: MatchInfo[]) => {
    setMatchNameDrafts((prev) => {
      const next: Record<string, string> = {};
      loadedMatches.forEach((loadedMatch) => {
        next[loadedMatch.id] = prev[loadedMatch.id] ?? loadedMatch.name ?? "";
      });
      return next;
    });
    setMatchStartsAtDrafts((prev) => {
      const next: Record<string, string> = {};
      loadedMatches.forEach((loadedMatch) => {
        next[loadedMatch.id] =
          prev[loadedMatch.id] ??
          toLocalDateTimeInputValue(loadedMatch.matchStartsAt);
      });
      return next;
    });
    setMatchSessionIdDrafts((prev) => {
      const next: Record<string, string> = {};
      loadedMatches.forEach((loadedMatch) => {
        next[loadedMatch.id] =
          prev[loadedMatch.id] ??
          loadedMatch.session?.id ?? "";
      });
      return next;
    });
    setSelectedMatchIds((prev) =>
      prev.filter((selectedMatchId) =>
        loadedMatches.some((loadedMatch) => loadedMatch.id === selectedMatchId),
      ),
    );
  };

  const loadPlayers = async () => {
    const res = await apiFetch("/api/admin/players");
    if (!res.ok) {
      throw new Error("회원 목록을 불러오지 못했습니다.");
    }

    const data = (await res.json()) as PlayerInfo[];
    setPlayers(data);
    syncGenderDrafts(data);
    syncUsernameDrafts(data);
    syncStatusDrafts(data);
  };

  const loadCreationLogs = async () => {
    const res = await apiFetch("/api/admin/player-creation-logs");
    if (!res.ok) {
      throw new Error("계정 생성 로그를 불러오지 못했습니다.");
    }

    const data = (await res.json()) as PlayerCreationLogsByPlayerId;
    setCreationLogsByPlayerId(data);
  };

  const loadStatusLogs = async () => {
    const res = await apiFetch("/api/admin/player-status-logs");
    if (!res.ok) {
      throw new Error("상태 변경 로그를 불러오지 못했습니다.");
    }

    const data = (await res.json()) as PlayerStatusLogsByPlayerId;
    setStatusLogsByPlayerId(data);
  };

  const loadMatches = async () => {
    const res = await apiFetch("/api/admin/matches");
    if (!res.ok) {
      throw new Error("매치 목록을 불러오지 못했습니다.");
    }

    const data = (await res.json()) as MatchInfo[];
    setMatches(data);
    syncMatchDrafts(data);
  };

  const loadSessions = async () => {
    const res = await apiFetch("/api/admin/match-sessions");
    if (!res.ok) {
      throw new Error("세션 목록을 불러오지 못했습니다.");
    }
    setSessions((await res.json()) as ManagedSessionInfo[]);
  };

  const loadRatingComparison = async () => {
    try {
      setIsLoadingRatingComparison(true);
      setRatingComparisonError(null);
      const res = await apiFetch("/api/admin/ratings/comparison");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || "방법별 레이팅을 불러오지 못했습니다.",
        );
      }
      setRatingComparison((await res.json()) as RatingMethodComparison);
    } catch (err: unknown) {
      setRatingComparisonError(
        err instanceof Error ? err.message : "알 수 없는 오류",
      );
    } finally {
      setIsLoadingRatingComparison(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      setError(null);
      await Promise.all([
        loadPlayers(),
        loadCreationLogs(),
        loadStatusLogs(),
        loadMatches(),
        loadSessions(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadDashboardData();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && activeSection === "matches") {
      void loadSessions().catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "세션 목록을 불러오지 못했습니다.",
        );
      });
    }
  }, [activeSection, isAdmin]);

  useEffect(() => {
    if (
      isAdmin &&
      activeSection === "ratings" &&
      !ratingComparison &&
      !ratingComparisonError &&
      !isLoadingRatingComparison
    ) {
      void loadRatingComparison();
    }
  }, [
    isAdmin,
    activeSection,
    ratingComparison,
    ratingComparisonError,
    isLoadingRatingComparison,
  ]);

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!isValidUsername(newUsername)) {
      setError(USERNAME_FORMAT_HINT);
      return;
    }
    try {
      const res = await apiFetch("/api/admin/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          gender,
        } satisfies AdminRegisterPlayerRequest),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "회원 추가 실패"));
      }
      const data = (await res.json()) as AdminRegisterPlayerResponse;
      setSuccess(`${data.player.username} 회원이 추가되었습니다.`);
      setIssuedCredential({
        username: data.player.username,
        password: data.initialPassword,
        kind: "initial",
      });
      setNewUsername("");
      await loadDashboardData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  };

  const handlePasswordReset = async (target: PlayerInfo) => {
    const confirmed = window.confirm(
      `${target.username} 회원의 비밀번호를 초기화할까요?\n` +
        "기존 비밀번호로는 더 이상 로그인할 수 없습니다. 아직 계정이 없는 회원이면 이번에 계정이 발급됩니다.",
    );
    if (!confirmed) {
      return;
    }

    try {
      setResettingPasswordPlayerId(target.id);
      setError(null);
      setSuccess(null);

      const res = await apiFetch(
        `/api/admin/players/${target.id}/password-reset`,
        { method: "POST" },
      );
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "비밀번호 초기화 실패"));
      }

      const data = (await res.json()) as AdminPasswordResetResponse;
      setIssuedCredential({
        username: target.username,
        password: data.temporaryPassword,
        kind: "reset",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setResettingPasswordPlayerId(null);
    }
  };

  const handleUsernameChange = async (playerId: string) => {
    const nextUsername = normalizeDraftValue(usernameDrafts[playerId] ?? "");
    setError(null);
    setSuccess(null);
    if (!isValidUsername(nextUsername)) {
      setError(USERNAME_FORMAT_HINT);
      return;
    }

    try {
      setSavingUsernamePlayerId(playerId);

      const res = await apiFetch(`/api/admin/players/${playerId}/username`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: nextUsername,
        } satisfies AdminUpdateUsernameRequest),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "아이디 변경 실패"));
      }

      const data = (await res.json()) as AdminUpdateUsernameResponse;
      setUsernameDrafts((prev) => ({
        ...prev,
        [playerId]: data.player.username,
      }));
      setSuccess(
        `아이디를 ${data.player.username}(으)로 바꿨습니다. 회원은 앞으로 새 아이디로 로그인해야 합니다.`,
      );
      // 경기·로그에도 아이디가 보이므로 목록 전체를 다시 불러온다.
      await loadDashboardData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setSavingUsernamePlayerId(null);
    }
  };

  const handleGenderChange = async (playerId: string) => {
    const nextGender = genderDrafts[playerId];
    if (!nextGender) {
      return;
    }

    try {
      setSavingGenderPlayerId(playerId);
      setError(null);
      setSuccess(null);

      const res = await apiFetch(`/api/admin/players/${playerId}/gender`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gender: nextGender }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "성별 변경 실패");
      }

      const data = (await res.json()) as {
        player: PlayerInfo;
        changed: boolean;
      };

      setPlayers((prev) =>
        prev.map((item) => (item.id === data.player.id ? data.player : item)),
      );
      setGenderDrafts((prev) => ({ ...prev, [playerId]: data.player.gender }));
      setSuccess(
        data.changed
          ? `${data.player.username} 회원 성별이 ${genderLabelMap[data.player.gender]}으로 변경되었습니다.`
          : "변경된 성별이 없습니다.",
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setSavingGenderPlayerId(null);
    }
  };

  const handleStatusChange = async (playerId: string) => {
    const nextStatus = statusDrafts[playerId];
    if (!nextStatus) {
      return;
    }

    try {
      setSavingPlayerId(playerId);
      setError(null);
      setSuccess(null);

      const res = await apiFetch(`/api/admin/players/${playerId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "상태 변경 실패");
      }

      const data = (await res.json()) as {
        player: PlayerInfo;
        log: PlayerStatusChangeLog | null;
      };

      setPlayers((prev) =>
        prev.map((item) => (item.id === data.player.id ? data.player : item)),
      );
      setStatusDrafts((prev) => ({ ...prev, [playerId]: data.player.status }));
      const nextLog = data.log;

      if (nextLog) {
        setStatusLogsByPlayerId((prev) => ({
          ...prev,
          [playerId]: [nextLog, ...(prev[playerId] ?? [])],
        }));
        setSuccess(
          `${data.player.username} 회원 상태가 ${statusLabelMap[data.player.status]}로 변경되었습니다.`,
        );
      } else {
        setSuccess("변경된 상태가 없습니다.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setSavingPlayerId(null);
    }
  };

  const handleRecalculateRatings = async () => {
    try {
      setIsRecalculatingRatings(true);
      setError(null);
      setSuccess(null);

      const res = await apiFetch("/api/admin/ratings/recalculate", {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "레이팅 재계산 실패");
      }

      const data = (await res.json()) as {
        changedPlayerCount: number;
        completedMatchCount: number;
        ratingChangeLogs: PlayerRatingChangeLog[];
        perMatchLogs: PlayerRatingChangeLog[];
        perMatchLogCount: number;
        restoredMatchDuprSnapshotCount: number;
        restoredMatchDuprSnapshotMatchCount: number;
      };
      await loadDashboardData();
      await loadRatingComparison();
      setSuccess(
        `레이팅 재계산이 완료되었습니다. 완료 매치 ${data.completedMatchCount}개 기준, ${data.changedPlayerCount}명 변동 (집계 ${data.ratingChangeLogs.length}건 + 매치별 ${data.perMatchLogCount}건 기록), 매치 레이팅 스냅샷 ${data.restoredMatchDuprSnapshotCount}건 복원 (${data.restoredMatchDuprSnapshotMatchCount}개 매치).`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsRecalculatingRatings(false);
    }
  };

  const handleAdminMatchBatchSubmit = async (
    payload: AdminBatchMatchSubmitPayload,
  ) => {
    try {
      setIsSavingAdminMatches(true);
      setError(null);
      setSuccess(null);

      const res = await apiFetch("/api/admin/matches/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "관리자 경기 저장 실패");
      }

      const data = (await res.json()) as {
        createdCount: number;
        changedPlayerCount: number;
        completedMatchCount: number;
        ratingChangeLogs: PlayerRatingChangeLog[];
      };

      await loadDashboardData();
      setAdminMatchFormResetKey((prev) => prev + 1);
      setSuccess(
        payload.session
          ? `세션 "${payload.session.name}"과 경기 ${data.createdCount}건을 저장했습니다. 완료 매치 ${data.completedMatchCount}개 기준, ${data.changedPlayerCount}명 변동 (${data.ratingChangeLogs.length}건 기록).`
          : `관리자 입력 경기 ${data.createdCount}건을 저장했습니다. 완료 매치 ${data.completedMatchCount}개 기준, ${data.changedPlayerCount}명 변동 (${data.ratingChangeLogs.length}건 기록).`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      throw err;
    } finally {
      setIsSavingAdminMatches(false);
    }
  };

  const handleSessionMatchResultSaved = (updatedMatch: Pick<
    MatchInfo,
    "id" | "status" | "scores"
  >) => {
    setMatches((previousMatches) =>
      previousMatches.map((match) =>
        match.id === updatedMatch.id
          ? {
              ...match,
              status: updatedMatch.status,
              scores: updatedMatch.scores,
            }
          : match,
      ),
    );
  };

  const handleMatchMetadataSave = async (matchId: string) => {
    const targetMatch = matches.find((match) => match.id === matchId);
    if (!targetMatch) {
      return;
    }

    const nextName = normalizeDraftValue(matchNameDrafts[matchId] ?? "");
    const isNameChanged = nextName !== (targetMatch.name ?? "");
    const nextMatchStartsAt = (matchStartsAtDrafts[matchId] ?? "").trim();
    const nextSessionId = (matchSessionIdDrafts[matchId] ?? "").trim();
    const isMatchStartsAtChanged =
      nextMatchStartsAt !== toLocalDateTimeInputValue(targetMatch.matchStartsAt);
    const isSessionIdChanged = nextSessionId !== (targetMatch.session?.id ?? "");

    if (!isNameChanged && !isMatchStartsAtChanged && !isSessionIdChanged) return;
    if (isSessionIdChanged && !nextSessionId) {
      setError("세션 연결 해제는 별도 버튼으로 진행해주세요.");
      setSuccess(null);
      return;
    }

    try {
      setSavingMatchMetadataIds((prev) =>
        prev.includes(matchId) ? prev : [...prev, matchId],
      );
      setError(null);
      setSuccess(null);

      const res = await apiFetch(`/api/admin/matches/${matchId}/metadata`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(isNameChanged ? { name: nextName } : {}),
          ...(isMatchStartsAtChanged
            ? { matchStartsAt: serializeLocalDateTimeInput(nextMatchStartsAt) }
            : {}),
          ...(isSessionIdChanged ? { sessionId: nextSessionId } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "매치 메타데이터 수정 실패");
      }

      const updatedMatch = (await res.json()) as MatchInfo;
      rememberRecentInputValue(recentInputFieldKeys.matchName, nextName);
      setMatches((prev) =>
        prev.map((match) =>
          match.id === updatedMatch.id ? updatedMatch : match,
        ),
      );
      setMatchNameDrafts((prev) => ({
        ...prev,
        [matchId]: updatedMatch.name ?? "",
      }));
      setMatchStartsAtDrafts((prev) => ({
        ...prev,
        [matchId]: toLocalDateTimeInputValue(updatedMatch.matchStartsAt),
      }));
      setMatchSessionIdDrafts((prev) => ({
        ...prev,
        [matchId]: updatedMatch.session?.id ?? "",
      }));
      setSuccess("매치명, 경기 예정 일시, 세션 연결을 저장했습니다.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setSavingMatchMetadataIds((prev) =>
        prev.filter((savingMatchId) => savingMatchId !== matchId),
      );
    }
  };

  const toggleMatchSelection = (matchId: string) => {
    setSelectedMatchIds((prev) =>
      prev.includes(matchId)
        ? prev.filter((selectedMatchId) => selectedMatchId !== matchId)
        : [...prev, matchId],
    );
  };

  const handleToggleAllMatches = () => {
    setSelectedMatchIds((prev) =>
      prev.length === matches.length ? [] : matches.map((match) => match.id),
    );
  };

  const handleBulkSessionApply = async () => {
    if (selectedMatchIds.length === 0) {
      setError("세션을 일괄 반영할 매치를 먼저 선택해주세요.");
      setSuccess(null);
      return;
    }

    const nextSessionId = bulkSessionId.trim();
    if (!nextSessionId) {
      setError("연결할 세션 ID를 입력하거나 목록에서 선택해주세요.");
      setSuccess(null);
      return;
    }

    const selectedMatches = matches.filter((match) =>
      selectedMatchIds.includes(match.id),
    );
    const matchesToUpdate = selectedMatches.filter(
      (match) => (match.session?.id ?? "") !== nextSessionId,
    );

    if (matchesToUpdate.length === 0) {
      setSuccess("선택한 매치에 반영할 세션 변경이 없습니다.");
      setError(null);
      return;
    }

    try {
      setIsSavingBulkMatchMetadata(true);
      setSavingMatchMetadataIds((prev) => [
        ...new Set([...prev, ...matchesToUpdate.map((match) => match.id)]),
      ]);
      setError(null);
      setSuccess(null);

      const res = await apiFetch("/api/admin/matches/bulk-metadata", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matchIds: matchesToUpdate.map((match) => match.id),
          sessionId: nextSessionId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "세션 일괄 반영 실패");
      }

      const { matches: updatedMatches } = (await res.json()) as {
        matches: MatchInfo[];
      };

      if (updatedMatches.length > 0) {
        const updatedMatchesById = new Map(
          updatedMatches.map((updatedMatch) => [updatedMatch.id, updatedMatch]),
        );
        setMatches((prev) =>
          prev.map((match) => updatedMatchesById.get(match.id) ?? match),
        );
        setMatchNameDrafts((prev) => {
          const next = { ...prev };
          updatedMatches.forEach((updatedMatch) => {
            next[updatedMatch.id] = updatedMatch.name ?? "";
          });
          return next;
        });
        setMatchStartsAtDrafts((prev) => {
          const next = { ...prev };
          updatedMatches.forEach((updatedMatch) => {
            next[updatedMatch.id] = toLocalDateTimeInputValue(updatedMatch.matchStartsAt);
          });
          return next;
        });
        setMatchSessionIdDrafts((prev) => {
          const next = { ...prev };
          updatedMatches.forEach((updatedMatch) => {
            next[updatedMatch.id] = updatedMatch.session?.id ?? "";
          });
          return next;
        });
      }

      setSelectedMatchIds([]);
      setSuccess(
        `${updatedMatches.length}개 매치를 세션 ID ${nextSessionId}에 연결했습니다.`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setSuccess(null);
    } finally {
      setIsSavingBulkMatchMetadata(false);
      setSavingMatchMetadataIds((prev) =>
        prev.filter(
          (savingMatchId) =>
            !matchesToUpdate.some((match) => match.id === savingMatchId),
        ),
      );
    }
  };

  const handleBulkMatchStartsAtApply = async () => {
    if (selectedMatchIds.length === 0) {
      setError("경기 일시를 일괄 설정할 매치를 먼저 선택해주세요.");
      setSuccess(null);
      return;
    }

    const nextMatchStartsAt = bulkMatchStartsAt.trim();
    if (!nextMatchStartsAt) {
      setError("일괄 적용할 경기 예정 일시를 입력해주세요.");
      setSuccess(null);
      return;
    }

    try {
      const serializedMatchStartsAt =
        serializeLocalDateTimeInput(nextMatchStartsAt);
      const matchesToUpdate = matches.filter(
        (match) =>
          selectedMatchIds.includes(match.id) &&
          toLocalDateTimeInputValue(match.matchStartsAt) !== nextMatchStartsAt,
      );
      if (!matchesToUpdate.length) {
        setSuccess("선택한 매치에 반영할 경기 일시 변경이 없습니다.");
        setError(null);
        return;
      }

      setIsSavingBulkMatchMetadata(true);
      setSavingMatchMetadataIds((prev) => [
        ...new Set([...prev, ...matchesToUpdate.map((match) => match.id)]),
      ]);
      setError(null);
      setSuccess(null);
      const res = await apiFetch("/api/admin/matches/bulk-metadata", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matchIds: matchesToUpdate.map((match) => match.id),
          matchStartsAt: serializedMatchStartsAt,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "경기 일시 일괄 설정 실패");
      }

      const { matches: updatedMatches } = (await res.json()) as {
        matches: MatchInfo[];
      };
      const updatedMatchesById = new Map(
        updatedMatches.map((match) => [match.id, match]),
      );
      setMatches((prev) =>
        prev.map((match) => updatedMatchesById.get(match.id) ?? match),
      );
      setMatchStartsAtDrafts((prev) => {
        const next = { ...prev };
        updatedMatches.forEach((match) => {
          next[match.id] = toLocalDateTimeInputValue(match.matchStartsAt);
        });
        return next;
      });
      setSelectedMatchIds([]);
      setSuccess(`${updatedMatches.length}개 매치의 경기 예정 일시를 설정했습니다.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setSuccess(null);
    } finally {
      setIsSavingBulkMatchMetadata(false);
      setSavingMatchMetadataIds((prev) =>
        prev.filter((savingMatchId) => !selectedMatchIds.includes(savingMatchId)),
      );
    }
  };

  const handleBulkMatchLocationApply = async () => {
    if (selectedMatchIds.length === 0) {
      setError("장소를 일괄 설정할 매치를 먼저 선택해주세요.");
      setSuccess(null);
      return;
    }

    const nextLocation = bulkMatchLocation.trim();
    if (!nextLocation) {
      setError("일괄 적용할 매치 장소를 입력해주세요.");
      setSuccess(null);
      return;
    }

    const matchesToUpdate = matches.filter(
      (match) =>
        selectedMatchIds.includes(match.id) &&
        (match.location?.trim() ?? "") !== nextLocation,
    );
    if (!matchesToUpdate.length) {
      setSuccess("선택한 매치에 반영할 장소 변경이 없습니다.");
      setError(null);
      return;
    }

    try {
      setIsSavingBulkMatchMetadata(true);
      setSavingMatchMetadataIds((prev) => [
        ...new Set([...prev, ...matchesToUpdate.map((match) => match.id)]),
      ]);
      setError(null);
      setSuccess(null);

      const res = await apiFetch("/api/admin/matches/bulk-metadata", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matchIds: matchesToUpdate.map((match) => match.id),
          location: nextLocation,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "매치 장소 일괄 설정 실패");
      }

      const { matches: updatedMatches } = (await res.json()) as {
        matches: MatchInfo[];
      };
      const updatedMatchesById = new Map(
        updatedMatches.map((match) => [match.id, match]),
      );
      setMatches((prev) =>
        prev.map((match) => updatedMatchesById.get(match.id) ?? match),
      );
      setBulkMatchLocation("");
      setSelectedMatchIds([]);
      setSuccess(`${updatedMatches.length}개 매치의 장소를 설정했습니다.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setSuccess(null);
    } finally {
      setIsSavingBulkMatchMetadata(false);
      setSavingMatchMetadataIds((prev) =>
        prev.filter(
          (savingMatchId) =>
            !matchesToUpdate.some((match) => match.id === savingMatchId),
        ),
      );
    }
  };

  const handleBulkSessionDisconnect = async () => {
    const matchesToUpdate = matches.filter(
      (match) => selectedMatchIds.includes(match.id) && match.session?.id,
    );
    if (!matchesToUpdate.length) {
      setError("연결 해제할 세션 연결 매치를 선택해주세요.");
      setSuccess(null);
      return;
    }
    if (!window.confirm(`${matchesToUpdate.length}개 매치의 세션 연결을 해제할까요?`)) {
      return;
    }
    try {
      setIsSavingBulkMatchMetadata(true);
      setSavingMatchMetadataIds((prev) => [
        ...new Set([...prev, ...matchesToUpdate.map((match) => match.id)]),
      ]);
      const res = await apiFetch("/api/admin/matches/bulk-metadata", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matchIds: matchesToUpdate.map((match) => match.id),
          sessionId: null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "세션 일괄 연결 해제 실패");
      }
      const { matches: updatedMatches } = (await res.json()) as {
        matches: MatchInfo[];
      };
      const updatedById = new Map(updatedMatches.map((match) => [match.id, match]));
      setMatches((prev) => prev.map((match) => updatedById.get(match.id) ?? match));
      setMatchSessionIdDrafts((prev) => {
        const next = { ...prev };
        updatedMatches.forEach((match) => {
          next[match.id] = "";
        });
        return next;
      });
      setSelectedMatchIds([]);
      setSuccess(`${updatedMatches.length}개 매치의 세션 연결을 해제했습니다.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
      setSuccess(null);
    } finally {
      setIsSavingBulkMatchMetadata(false);
      setSavingMatchMetadataIds((prev) =>
        prev.filter(
          (savingMatchId) =>
            !matchesToUpdate.some((match) => match.id === savingMatchId),
        ),
      );
    }
  };

  const buildOfficialDuprPayload = () => {
    const singlesRating = parseOptionalNumberInput(officialRatings.singles);
    const doublesRating = parseOptionalNumberInput(officialRatings.doubles);
    const singlesConfidence = parseOptionalNumberInput(
      officialConfidence.singles,
    );
    const doublesConfidence = parseOptionalNumberInput(
      officialConfidence.doubles,
    );

    return {
      ratings: {
        ...(singlesRating != null ? { singles: singlesRating } : {}),
        ...(doublesRating != null ? { doubles: doublesRating } : {}),
      },
      confidence: {
        ...(singlesConfidence != null ? { singles: singlesConfidence } : {}),
        ...(doublesConfidence != null ? { doubles: doublesConfidence } : {}),
      },
      reason: officialReason,
    };
  };

  const handleOfficialDuprSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setOfficialPreview(null);

    if (!officialPlayerId) {
      setError("공식 DUPR를 반영할 회원을 선택해주세요.");
      return;
    }

    try {
      setIsPreviewingOfficialDupr(true);
      const res = await apiFetch(
        `/api/admin/players/${officialPlayerId}/official-dupr/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildOfficialDuprPayload()),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "공식 DUPR 영향 미리보기 실패");
      }

      const data = (await res.json()) as OfficialDuprAdjustmentPreview;
      setOfficialPreview(data);
      setSuccess(
        data.impacts.length > 0
          ? `${data.impacts.length}명의 예상 점수 변동을 확인했습니다.`
          : "예상 점수 변동이 없습니다.",
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsPreviewingOfficialDupr(false);
    }
  };

  const handleOfficialDuprApply = async () => {
    setError(null);
    setSuccess(null);

    if (!officialPlayerId) {
      setError("공식 DUPR를 반영할 회원을 선택해주세요.");
      return;
    }

    try {
      setIsApplyingOfficialDupr(true);
      const res = await apiFetch(
        `/api/admin/players/${officialPlayerId}/official-dupr`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildOfficialDuprPayload()),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "공식 DUPR 반영 실패");
      }

      const data = (await res.json()) as {
        player: PlayerInfo;
        ratingChangeLogs: PlayerRatingChangeLog[];
      };
      setPlayers((prev) =>
        prev.map((item) => (item.id === data.player.id ? data.player : item)),
      );
      setOfficialReason("");
      setOfficialPreview(null);
      await loadDashboardData();
      setSuccess(
        `공식 DUPR 반영 및 전체 재계산이 완료되었습니다. (${data.ratingChangeLogs.length}명 변동 기록)`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsApplyingOfficialDupr(false);
    }
  };

  if (!isAdmin) return null;

  const genderLabel = player?.gender === "M" ? "남" : "여";
  const nowPlaying = () => new Date().toLocaleString("ko-KR");
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">pkpkdupr Admin</h1>
        <div className="flex gap-4 items-center">
          <span className="text-sm text-gray-400">{__APP_VERSION__}</span>
          <span className="text-sm text-gray-600">
            {player?.username} ({genderLabel}) / 관리자
          </span>
          <button
            onClick={() => void logout()}
            className="text-sm text-red-500 hover:text-red-700 font-medium"
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <AdminSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
        <main className="min-w-0 flex-1 space-y-8 bg-white p-4 lg:p-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {adminSectionInfo[activeSection].label}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {adminSectionInfo[activeSection].description}
            </p>
          </div>

          {error && (
            <div className="bg-error/10 border border-error/20 text-error px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-2 rounded text-sm">
              {success}
            </div>
          )}
          {issuedCredential && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
                <IssuedPasswordNotice
                  credential={issuedCredential}
                  onClose={() => setIssuedCredential(null)}
                />
              </div>
            </div>
          )}

        {activeSection === "members" ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">
            신규 회원 추가
          </h2>

          <form
            onSubmit={handleAddPlayer}
            className="grid grid-cols-2 gap-4 items-end"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                placeholder="아이디"
                autoCapitalize="none"
                spellCheck={false}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-slate-500 self-center">
              {USERNAME_FORMAT_HINT} 초기 비밀번호는 추가하면 한 번만
              보여 줍니다.
            </p>
            <div className="col-span-2 flex gap-6 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value="M"
                  checked={gender === "M"}
                  onChange={() => setGender("M")}
                />
                Male
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value="F"
                  checked={gender === "F"}
                  onChange={() => setGender("F")}
                />
                Female
              </label>
            </div>
            <div className="col-span-2">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                회원 추가
              </button>
            </div>
          </form>
        </section>
        ) : null}

        {activeSection === "ratings" ? (
          <RatingComparisonPanel
            comparison={ratingComparison}
            isLoading={isLoadingRatingComparison}
            error={ratingComparisonError}
            onReload={() => void loadRatingComparison()}
          />
        ) : null}

        {activeSection === "ratings" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-700">
                레이팅 재계산
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                현재 적용 중인 신규 득점률식으로 전체 완료 매치를 재생해 모든
                회원의 저장 레이팅을 갱신합니다.
              </p>
            </div>
            <button
              type="button"
              disabled={isRecalculatingRatings}
              onClick={() => void handleRecalculateRatings()}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:bg-emerald-300 transition-colors"
            >
              {isRecalculatingRatings ? "재계산 중..." : "전체 레이팅 재계산"}
            </button>
          </div>
        </section>
        ) : null}

        {activeSection === "matches" ? (
        <AdminMatchBatchForm
          players={players}
          isSubmitting={isSavingAdminMatches}
          resetKey={adminMatchFormResetKey}
          onSubmit={handleAdminMatchBatchSubmit}
        />
        ) : null}

        {activeSection === "sessions" ? (
        <AdminSessionManager
          players={players}
          onMatchResultSaved={handleSessionMatchResultSaved}
        />
        ) : null}

        {activeSection === "ratings" ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-700">
              공식 DUPR 수동 반영
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              최근 경기 30일 반감기 적용: 공식 DUPR 반영 시점에 가까운
              경기일수록 파트너와 상대 선수의 레이팅에 더 크게 반영됩니다.
            </p>
          </div>
          <form
            onSubmit={handleOfficialDuprSubmit}
            className="grid grid-cols-4 gap-4 items-end"
          >
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                회원
              </label>
              <select
                required
                value={officialPlayerId}
                onChange={(e) => {
                  setOfficialPlayerId(e.target.value);
                  setOfficialPreview(null);
                }}
                className="w-full px-4 py-2 border rounded-lg bg-white"
              >
                <option value="">회원 선택</option>
                {players.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.username}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                사유
              </label>
              <input
                type="text"
                value={officialReason}
                onChange={(e) => {
                  setOfficialReason(e.target.value);
                  setOfficialPreview(null);
                }}
                placeholder="공식 DUPR 반영 사유"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            {[
              ["singles", "Singles"],
              ["doubles", "Doubles"],
            ].map(([key, label]) => (
              <React.Fragment key={key}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label} Rating
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={8}
                    step={0.001}
                    placeholder="2.000~8.000"
                    value={officialRatings[key as keyof typeof officialRatings]}
                    onChange={(e) =>
                      setOfficialRatings((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    onInput={() => setOfficialPreview(null)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label} Confidence (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    placeholder="0~100"
                    value={
                      officialConfidence[key as keyof typeof officialConfidence]
                    }
                    onChange={(e) =>
                      setOfficialConfidence((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    onInput={() => setOfficialPreview(null)}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </React.Fragment>
            ))}
            <div className="col-span-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isPreviewingOfficialDupr || isApplyingOfficialDupr}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors"
              >
                {isPreviewingOfficialDupr ? "미리보기 중..." : "영향 미리보기"}
              </button>
              {officialPreview ? (
                <button
                  type="button"
                  disabled={isApplyingOfficialDupr || isPreviewingOfficialDupr}
                  onClick={handleOfficialDuprApply}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:bg-emerald-300 transition-colors"
                >
                  {isApplyingOfficialDupr ? "반영 중..." : "확정 반영"}
                </button>
              ) : null}
            </div>
          </form>
          {officialPreview ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-indigo-900">
                    예상 점수 변동
                  </h3>
                  <p className="text-xs text-indigo-700">
                    {officialPreview.player.username} 공식 DUPR 기준점 반영 후
                    전체 완료 매치를 재계산한 결과입니다.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                  {officialPreview.impacts.length}명
                </span>
              </div>
              {officialPreview.impacts.length === 0 ? (
                <p className="text-sm text-gray-500">예상 변동이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-indigo-100">
                      <tr className="text-left text-indigo-900">
                        <th className="px-3 py-2">회원</th>
                        <th className="px-3 py-2">Singles</th>
                        <th className="px-3 py-2">Doubles</th>
                        <th className="px-3 py-2">관련 매치</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officialPreview.impacts.map((impact) => (
                        <tr
                          key={impact.playerId}
                          className="border-b last:border-0"
                        >
                          <td className="px-3 py-2 font-semibold text-gray-800">
                            {impact.username}
                          </td>
                          {[
                            [
                              "singles",
                              impact.nextRating.singles,
                              impact.delta.singles,
                            ],
                            [
                              "doubles",
                              impact.nextRating.doubles,
                              impact.delta.doubles,
                            ],
                          ].map(([key, nextValue, deltaValue]) => (
                            <td key={key} className="px-3 py-2">
                              <span className="font-medium text-gray-800">
                                {formatDupr(nextValue as number)}
                              </span>
                              <span
                                className={`ml-1 ${
                                  (deltaValue as number) > 0
                                    ? "text-emerald-600"
                                    : (deltaValue as number) < 0
                                      ? "text-red-500"
                                      : "text-gray-400"
                                }`}
                              >
                                ({formatDuprDelta(deltaValue as number)})
                              </span>
                            </td>
                          ))}
                          <td className="px-3 py-2 text-gray-600">
                            {impact.relatedMatchCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </section>
        ) : null}

        {activeSection === "matches" ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-700">
              매치 목록 ({matches.length})
            </h2>
            <button
              type="button"
              onClick={() => setIsMatchListExpanded((prev) => !prev)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {isMatchListExpanded ? "접기" : "펼치기"}
            </button>
          </div>

          {!isMatchListExpanded ? null : matches.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              등록된 매치가 없습니다.
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">
                  선택 매치 설정
                </h3>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      일괄 세션 ID
                    </label>
                    <input
                      value={bulkSessionId}
                      onChange={(e) => setBulkSessionId(e.target.value)}
                      placeholder="예: Ssnj75xd"
                      className="w-full rounded-lg border px-3 py-2"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      등록 세션에서 선택
                    </label>
                    <select
                      value={bulkSessionId}
                      onChange={(e) => setBulkSessionId(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2"
                    >
                      <option value="">세션 선택</option>
                      {sessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.name} · {formatDateTime(session.date)} · {session.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleAllMatches}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white"
                    >
                      {selectedMatchIds.length === matches.length
                        ? "전체 선택 해제"
                        : "전체 선택"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        isSavingBulkMatchMetadata ||
                        selectedMatchIds.length === 0
                      }
                      onClick={() => void handleBulkSessionApply()}
                      className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                    >
                      {isSavingBulkMatchMetadata
                        ? "일괄 반영 중..."
                        : `선택 ${selectedMatchIds.length}개 세션 연결`}
                    </button>
                    <button
                      type="button"
                      disabled={
                        isSavingBulkMatchMetadata ||
                        selectedMatchIds.length === 0
                      }
                      onClick={() => void handleBulkSessionDisconnect()}
                      className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:border-slate-200 disabled:text-slate-400"
                    >
                      선택 연결 해제
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 lg:flex-row lg:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      일괄 매치 장소
                    </label>
                    <input
                      value={bulkMatchLocation}
                      onChange={(e) => setBulkMatchLocation(e.target.value)}
                      placeholder="예: Court A"
                      className="w-full rounded-lg border px-3 py-2"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      isSavingBulkMatchMetadata ||
                      selectedMatchIds.length === 0
                    }
                    onClick={() => void handleBulkMatchLocationApply()}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                  >
                    {isSavingBulkMatchMetadata
                      ? "일괄 설정 중..."
                      : `선택 ${selectedMatchIds.length}개 장소 설정`}
                  </button>
                </div>
                <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 lg:flex-row lg:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      일괄 경기 예정 일시
                    </label>
                    <input
                      type="datetime-local"
                      value={bulkMatchStartsAt}
                      onChange={(e) => setBulkMatchStartsAt(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      isSavingBulkMatchMetadata ||
                      selectedMatchIds.length === 0
                    }
                    onClick={() => void handleBulkMatchStartsAtApply()}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                  >
                    {isSavingBulkMatchMetadata
                      ? "일괄 설정 중..."
                      : `선택 ${selectedMatchIds.length}개 일시 설정`}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  선택한 매치의 세션 연결, 매치 장소 또는 경기 예정 일시를 일괄
                  설정할 수 있습니다. 연결 해제는 별도 버튼과 확인 절차로만 수행됩니다.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1800px] table-auto text-sm">
                  <thead className="bg-slate-100">
                    <tr className="text-left text-slate-600">
                      <th className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={
                            matches.length > 0 &&
                            selectedMatchIds.length === matches.length
                          }
                          onChange={handleToggleAllMatches}
                          aria-label="전체 매치 선택"
                          className="size-6"
                        />
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap">일시</th>
                      <th className="px-4 py-3 whitespace-nowrap">세션 ID</th>
                      <th className="px-4 py-3 whitespace-nowrap">세션명</th>
                      <th className="px-4 py-3 whitespace-nowrap">세션 날짜</th>
                      <th className="px-4 py-3 whitespace-nowrap">
                        매치 장소
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap">매치명</th>
                      <th className="px-4 py-3 whitespace-nowrap">타입</th>
                      <th className="px-4 py-3 whitespace-nowrap">모드</th>
                      <th className="px-4 py-3 whitespace-nowrap">상태</th>
                      <th className="px-4 py-3 whitespace-nowrap">생성 방식</th>
                      <th className="px-4 py-3 whitespace-nowrap">A팀</th>
                      <th className="px-4 py-3 whitespace-nowrap">B팀</th>
                      <th className="px-4 py-3 whitespace-nowrap">결과</th>
                      <th className="px-4 py-3 whitespace-nowrap">수정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match) => {
                      const draftMatchName =
                        matchNameDrafts[match.id] ?? match.name ?? "";
                      const draftMatchStartsAt =
                        matchStartsAtDrafts[match.id] ??
                        toLocalDateTimeInputValue(match.matchStartsAt);
                      const draftSessionId =
                        matchSessionIdDrafts[match.id] ?? match.session?.id ?? "";
                      const normalizedDraftMatchName =
                        normalizeDraftValue(draftMatchName);
                      const isMatchNameDirty =
                        normalizedDraftMatchName !== (match.name ?? "");
                      const isMatchStartsAtDirty =
                        draftMatchStartsAt !==
                        toLocalDateTimeInputValue(match.matchStartsAt);
                      const isSessionIdDirty =
                        draftSessionId.trim() !== (match.session?.id ?? "");
                      const isSavingMatchMetadata =
                        savingMatchMetadataIds.includes(match.id);
                      const displayedMatchLocation =
                        match.location?.trim() ||
                        match.session?.location?.trim() ||
                        "-";

                      return (
                        <tr
                          key={match.id}
                          className="border-b align-top hover:bg-gray-50"
                        >
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedMatchIds.includes(match.id)}
                              onChange={() => toggleMatchSelection(match.id)}
                              aria-label={`${match.name ?? match.id} 선택`}
                              className="size-6"
                            />
                          </td>
                          <td className="px-4 py-4 min-w-[190px] text-xs text-gray-600">
                            <input
                              type="datetime-local"
                              value={draftMatchStartsAt}
                              onChange={(e) =>
                                setMatchStartsAtDrafts((prev) => ({
                                  ...prev,
                                  [match.id]: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border px-3 py-2"
                              aria-label={`${match.name ?? match.id} 경기 예정 일시`}
                            />
                          </td>
                          <td className="px-4 py-4 min-w-[180px]">
                            <div className="space-y-2">
                              <input
                                value={draftSessionId}
                                onChange={(e) =>
                                  setMatchSessionIdDrafts((prev) => ({
                                    ...prev,
                                    [match.id]: e.target.value,
                                  }))
                                }
                                placeholder="세션 ID"
                                className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
                              />
                              <select
                                value={draftSessionId}
                                onChange={(e) =>
                                  setMatchSessionIdDrafts((prev) => ({
                                    ...prev,
                                    [match.id]: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border px-3 py-2 text-xs"
                              >
                                <option value="">세션 선택</option>
                                {sessions.map((session) => (
                                  <option key={session.id} value={session.id}>
                                    {session.name} · {formatDateTime(session.date)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="px-4 py-4 min-w-[220px]">
                            <span className="text-xs text-slate-600">
                              {match.session?.name ?? "연결된 세션 없음"}
                            </span>
                          </td>
                          <td className="px-4 py-4 min-w-[180px]">
                            <span className="text-xs text-slate-600">
                              {match.session?.date
                                ? formatDateTime(match.session.date)
                                : "-"}
                            </span>
                          </td>
                          <td className="px-4 py-4 min-w-[180px]">
                            <span className="text-xs text-slate-600">
                              {displayedMatchLocation}
                            </span>
                          </td>
                          <td className="px-4 py-4 min-w-[180px]">
                            <RecentValueComboBox
                              fieldKey={recentInputFieldKeys.matchName}
                              value={draftMatchName}
                              onChange={(nextValue) =>
                                setMatchNameDrafts((prev) => ({
                                  ...prev,
                                  [match.id]: nextValue,
                                }))
                              }
                              placeholder="매치명"
                              className="w-full"
                              inputClassName="w-full rounded-lg border px-3 py-2"
                            />
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-700">
                            {matchTypeLabels[match.type]}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-700">
                            {matchModeLabels[match.mode]}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${matchStatusBadgeClassMap[match.status]}`}
                            >
                              {matchStatusLabelMap[match.status]}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-700">
                            {matchSourceLabels[match.source]}
                          </td>
                          <td className="px-4 py-4 min-w-[180px] text-xs text-gray-600">
                            {getTeamLabel(match.teams[0], match.type)}
                          </td>
                          <td className="px-4 py-4 min-w-[180px] text-xs text-gray-600">
                            {getTeamLabel(match.teams[1], match.type)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-700">
                            {getScoreLabel(match.scores)}
                          </td>
                          <td className="px-4 py-4 min-w-[120px]">
                            <button
                              type="button"
                              disabled={
                                isSavingMatchMetadata ||
                                (!isMatchNameDirty &&
                                  !isMatchStartsAtDirty &&
                                  !isSessionIdDirty)
                              }
                              onClick={() =>
                                void handleMatchMetadataSave(match.id)
                              }
                              className="rounded-lg bg-slate-800 px-3 py-2 text-white disabled:bg-slate-300"
                            >
                              {isSavingMatchMetadata ? "저장 중..." : "저장"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
        ) : null}

        {activeSection === "members" ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">
            회원 목록 ({players.length})
          </h2>

          {players.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              등록된 회원이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1720px] table-auto text-sm">
                <thead className="bg-slate-100">
                  <tr className="text-left text-slate-600">
                    <th className="px-4 py-3 whitespace-nowrap">Username</th>
                    <th className="px-4 py-3 whitespace-nowrap">계정</th>
                    <th className="px-4 py-3 whitespace-nowrap">레이팅</th>
                    <th className="px-4 py-3 whitespace-nowrap">Confidence</th>
                    <th className="px-4 py-3 whitespace-nowrap">성별</th>
                    <th className="px-4 py-3 whitespace-nowrap">현재 상태</th>
                    <th className="px-4 py-3 whitespace-nowrap">상태 변경</th>
                    <th className="px-4 py-3 whitespace-nowrap">생성 로그</th>
                    <th className="px-4 py-3 whitespace-nowrap">상태 로그</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => {
                    const creationLogs = creationLogsByPlayerId[p.id] ?? [];
                    const statusLogs = statusLogsByPlayerId[p.id] ?? [];
                    const latestCreationLog = creationLogs[0];
                    const draftGender = genderDrafts[p.id] ?? p.gender;
                    const draftStatus = statusDrafts[p.id] ?? p.status;
                    const isSavingGender = savingGenderPlayerId === p.id;
                    const isSaving = savingPlayerId === p.id;
                    const isGenderDirty = draftGender !== p.gender;
                    const isDirty = draftStatus !== p.status;
                    const draftUsername = usernameDrafts[p.id] ?? p.username;
                    const isSavingUsername = savingUsernamePlayerId === p.id;
                    const isUsernameDirty =
                      normalizeDraftValue(draftUsername) !== p.username;
                    const isResettingPassword =
                      resettingPasswordPlayerId === p.id;
                    const singlesRating = getCompositeSinglesRating(
                      p.duprRating,
                    );
                    const doublesRating = getCompositeDoublesRating(
                      p.duprRating,
                    );
                    const singlesConfidence = p.duprRating
                      ? getCompositeSinglesConfidence(p.duprMetrics)
                      : null;
                    const doublesConfidence = p.duprRating
                      ? getCompositeDoublesConfidence(p.duprMetrics)
                      : null;

                    return (
                      <tr
                        key={p.id}
                        className="border-b align-top hover:bg-gray-50"
                      >
                        <td className="px-4 py-4 min-w-[260px]">
                          <div className="font-medium">{p.username}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              aria-label={`${p.username} 새 아이디`}
                              autoCapitalize="none"
                              spellCheck={false}
                              value={draftUsername}
                              onChange={(e) =>
                                setUsernameDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              className="w-40 border rounded-lg px-3 py-2"
                            />
                            <button
                              type="button"
                              disabled={!isUsernameDirty || isSavingUsername}
                              onClick={() => void handleUsernameChange(p.id)}
                              className="px-3 py-2 rounded-lg bg-slate-800 text-white disabled:bg-slate-300"
                            >
                              {isSavingUsername ? "저장 중..." : "저장"}
                            </button>
                          </div>
                          {isUsernameDirty && (
                            <p className="mt-1 text-xs text-amber-700">
                              저장하면 회원은 새 아이디로 로그인해야 합니다.
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 min-w-[180px]">
                          <button
                            type="button"
                            // 발급 비밀번호는 한 번만 보이므로, 응답이 서로 덮어쓰지 않게 초기화는 한 번에 하나만 한다.
                            disabled={resettingPasswordPlayerId !== null}
                            onClick={() => void handlePasswordReset(p)}
                            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-300"
                          >
                            {isResettingPassword
                              ? "초기화 중..."
                              : "비밀번호 초기화"}
                          </button>
                          <p className="mt-1 text-xs text-slate-500">
                            계정이 없는 회원은 이 버튼으로 발급합니다.
                          </p>
                        </td>
                        <td className="px-4 py-4 min-w-[120px] text-blue-600">
                          <div className="space-y-1 text-xs">
                            <div>S {formatDupr(singlesRating)}</div>
                            <div>D {formatDupr(doublesRating)}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 min-w-[120px] text-slate-600">
                          <div className="space-y-1 text-xs">
                            <div>S {formatConfidence(singlesConfidence)}</div>
                            <div>D {formatConfidence(doublesConfidence)}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 min-w-[220px]">
                          <div className="flex items-center gap-2">
                            <select
                              value={draftGender}
                              onChange={(e) =>
                                setGenderDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value as PlayerGender,
                                }))
                              }
                              className="border rounded-lg px-3 py-2 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              <option value="M">남</option>
                              <option value="F">여</option>
                            </select>
                            <button
                              type="button"
                              disabled={!isGenderDirty || isSavingGender}
                              onClick={() => void handleGenderChange(p.id)}
                              className="px-3 py-2 rounded-lg bg-slate-800 text-white disabled:bg-slate-300"
                            >
                              {isSavingGender ? "저장 중..." : "저장"}
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            현재: {genderLabelMap[p.gender]}
                          </p>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClassMap[p.status]}`}
                          >
                            {statusLabelMap[p.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <select
                              value={draftStatus}
                              onChange={(e) =>
                                setStatusDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value as PlayerStatus,
                                }))
                              }
                              className="border rounded-lg px-3 py-2 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              <option value="active">active</option>
                              <option value="inactive">inactive</option>
                            </select>
                            <button
                              type="button"
                              disabled={!isDirty || isSaving}
                              onClick={() => handleStatusChange(p.id)}
                              className="px-3 py-2 rounded-lg bg-slate-800 text-white disabled:bg-slate-300"
                            >
                              {isSaving ? "저장 중..." : "저장"}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4 min-w-[240px] text-xs text-gray-600">
                          {!latestCreationLog ? (
                            <span className="text-gray-400">로그 없음</span>
                          ) : (
                            <div className="space-y-1.5 leading-5">
                              <div className="font-medium text-gray-700">
                                {
                                  creationSourceLabelMap[
                                    latestCreationLog.creationSource
                                  ]
                                }
                              </div>
                              <div>
                                생성자: {latestCreationLog.createdByUsername}
                              </div>
                              <div>
                                {new Date(
                                  latestCreationLog.createdAt,
                                ).toLocaleString("ko-KR")}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 min-w-[300px] text-xs text-gray-600">
                          {statusLogs.length === 0 ? (
                            <span className="text-gray-400">로그 없음</span>
                          ) : (
                            <ul className="space-y-1.5">
                              {statusLogs.slice(0, 3).map((log) => (
                                <li key={log.id} className="leading-5">
                                  <span className="font-medium text-gray-700">
                                    {statusLabelMap[log.previousStatus]}
                                  </span>
                                  <span className="mx-1">→</span>
                                  <span className="font-medium text-gray-700">
                                    {statusLabelMap[log.nextStatus]}
                                  </span>
                                  <span className="mx-1">·</span>
                                  <span>{log.changedByUsername}</span>
                                  <span className="mx-1">·</span>
                                  <span>
                                    {new Date(log.changedAt).toLocaleString(
                                      "ko-KR",
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        ) : null}

          <footer className="text-center text-xs text-gray-400">
            Last checked: {nowPlaying()}
          </footer>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
