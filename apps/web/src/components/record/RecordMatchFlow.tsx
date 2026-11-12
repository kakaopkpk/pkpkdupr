import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isMatchRecordEditable,
  type RecordMatchRequest,
} from "@pkpkdupr/shared/match";
import type { StartSessionMatchRequest } from "@pkpkdupr/shared/session";
import type { MatchInfo } from "@/types/match";
import type { AvatarPlayer } from "@/components/ui/PlayerAvatar";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useLiveSession } from "@/context/LiveSessionContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { usePlayers } from "@/hooks/usePlayers";
import { apiFetch } from "@/lib/api";
import { startSessionMatch } from "@/lib/matchSessions";
import PickPlayersStep from "./PickPlayersStep";
import RecordDoneStep from "./RecordDoneStep";
import {
  EMPTY_SCORE,
  getErrorMessage,
  getSlotTeams,
  isNetworkError,
  slotsFromTeams,
  toDecidedScore,
  type RecordSlots,
  type ScoreDraft,
} from "./recordMatch.utils";
import ScoreStep from "./ScoreStep";

const SAVE_ERROR_FALLBACK = "기록을 저장하지 못했어요.";
const START_ERROR_FALLBACK = "경기를 시작하지 못했어요.";
const NOT_EDITABLE_MESSAGE = "고칠 수 없는 경기예요";
const TEAM_NAMES = ["Team A", "Team B"] as const;
/** 점수 단계에서 기기 뒤로가기로 플레이어 선택에 돌아가도록 쌓는 깊이 */
export const SCORE_STEP_DEPTH_ID = "global-record-match-score-step";

export interface RecordMatchFlowInitial {
  step: "pick" | "score";
  slots: RecordSlots;
  score: ScoreDraft;
  location: string;
  /** kind:"score"로 연 경기. 저장하면 PUT으로 고친다 */
  editMatch: MatchInfo | null;
}

export interface RecordMatchFlowProps {
  initial: RecordMatchFlowInitial;
  /** 시트가 열려 있는지. 닫힌 뒤 끝난 재시도는 화면 이동을 하지 않는다 */
  isOpen: boolean;
  /** 시트가 깊이를 쌓은 탭. 점수 단계 깊이도 같은 탭에 쌓는다 */
  tabKey: TabKey;
  onClose: () => void;
}

type Step = "pick" | "score" | "done";

const toTeamRequests = (
  teams: [string[], string[]],
): StartSessionMatchRequest["teams"] => [
  { name: TEAM_NAMES[0], playerIds: teams[0] },
  { name: TEAM_NAMES[1], playerIds: teams[1] },
];

const saveMatch = async (
  editingMatchId: string | null,
  body: RecordMatchRequest,
): Promise<MatchInfo> => {
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
    throw new Error(errorData.error || SAVE_ERROR_FALLBACK);
  }

  return (await res.json()) as MatchInfo;
};

/**
 * 플레이어 선택 → 점수 입력 → 기록 완료. 시트를 열 때마다 셸이 key로 새로 만든다.
 * 입력과 수정은 같은 화면이며, 수정은 저장된 값이 채워져 있고 PUT으로 저장한다는 점만 다르다.
 */
export default function RecordMatchFlow({
  initial,
  isOpen,
  tabKey,
  onClose,
}: RecordMatchFlowProps): React.ReactElement {
  const { notifyDataChanged, selectTab } = useAppNavigation();
  const { liveSession, inProgressMatches } = useLiveSession();
  const { showSaveFailure } = useSystemNotice();
  const { closeDepth } = useTabNavigation();
  const { players, status: playersStatus } = usePlayers();

  const [step, setStep] = useState<Step>(initial.step);
  const [slots, setSlots] = useState(initial.slots);
  const [score, setScore] = useState(initial.score);
  const [location, setLocation] = useState(initial.location);
  // "한 판 더" 이후에는 수정으로 열었더라도 새 기록이다
  const [editingMatchId, setEditingMatchId] = useState(
    initial.editMatch?.id ?? null,
  );
  const [recordedMatch, setRecordedMatch] = useState<MatchInfo | null>(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 재시도가 늦게 끝났을 때 이미 닫혔거나 다른 요청으로 바뀐 시트를 건드리지 않기 위해 쓴다
  const isActiveRef = useRef(true);
  useEffect(() => {
    isActiveRef.current = isOpen;
  }, [isOpen]);
  useEffect(
    () => () => {
      isActiveRef.current = false;
    },
    [],
  );

  const editMatch =
    editingMatchId && initial.editMatch?.id === editingMatchId
      ? initial.editMatch
      : null;
  const [now] = useState(() => new Date());
  const isEditable =
    !editMatch ||
    isMatchRecordEditable(
      { ...editMatch, matchStartsAt: new Date(editMatch.matchStartsAt) },
      now,
    );

  const playerById = useMemo(() => {
    const map = new Map<string, AvatarPlayer>();
    const add = (player: AvatarPlayer) => {
      if (!map.has(player.id)) map.set(player.id, player);
    };
    players.forEach(add);
    liveSession?.participants.forEach(add);
    initial.editMatch?.teams.forEach((team) => team.players.forEach(add));
    return map;
  }, [initial.editMatch, liveSession, players]);

  const participantIds = useMemo(
    () => liveSession?.participants.map((participant) => participant.id) ?? [],
    [liveSession],
  );
  const busyIds = useMemo(
    () =>
      new Set(
        inProgressMatches
          // 지금 고치는 진행 중 경기의 플레이어는 경기 중으로 보지 않는다
          .filter((match) => match.id !== editingMatchId)
          .flatMap((match) => match.teams.flatMap((team) => team.players))
          .map((player) => player.id),
      ),
    [editingMatchId, inProgressMatches],
  );

  const slotTeams = getSlotTeams(slots);
  const teamPlayers = useMemo<[AvatarPlayer[], AvatarPlayer[]]>(() => {
    const resolve = (id: string | null): AvatarPlayer[] =>
      id ? [playerById.get(id) ?? { id, username: "…" }] : [];
    return [
      [...resolve(slots[0]), ...resolve(slots[1])],
      [...resolve(slots[2]), ...resolve(slots[3])],
    ];
  }, [playerById, slots]);
  const decidedScore = toDecidedScore(score);
  const trimmedLocation = location.trim();
  const canSave =
    isEditable && !!slotTeams && !!decidedScore && !!trimmedLocation;

  const goHome = () => {
    onClose();
    selectTab("home");
  };

  /**
   * 저장·시작 공통 처리. 네트워크 오류면 입력을 그대로 두고 저장 실패 알림으로 다시 시도하게 하고,
   * 서버 오류는 하단 버튼 위 문구로 보인다.
   */
  const attempt = async <T,>(
    action: () => Promise<T>,
    onSuccess: (result: T) => void,
    fallbackMessage: string,
  ) => {
    const succeed = (result: T) => {
      notifyDataChanged();
      if (isActiveRef.current) onSuccess(result);
    };

    setIsBusy(true);
    setError(null);
    try {
      succeed(await action());
    } catch (err) {
      if (isNetworkError(err)) {
        showSaveFailure({
          onRetry: async () => {
            try {
              succeed(await action());
            } catch (retryError) {
              if (!isNetworkError(retryError) && isActiveRef.current) {
                setError(getErrorMessage(retryError, fallbackMessage));
              }
              throw retryError;
            }
          },
        });
      } else {
        setError(getErrorMessage(err, fallbackMessage));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const startMatch = (teams: [string[], string[]]) => {
    if (!liveSession || isBusy) return;
    const sessionId = liveSession.id;
    const body: StartSessionMatchRequest = { teams: toTeamRequests(teams) };
    void attempt(
      () => startSessionMatch(sessionId, body),
      goHome,
      START_ERROR_FALLBACK,
    );
  };

  const handleSave = () => {
    if (!canSave || !slotTeams || !decidedScore || isBusy) return;
    const matchId = editingMatchId;
    const body: RecordMatchRequest = {
      teams: toTeamRequests(slotTeams),
      location: trimmedLocation,
      scores: [decidedScore],
      // 정기 세션은 서버가 시작 시각 규칙으로 정하므로 회원 세션만 지정한다
      ...(!matchId && liveSession?.kind === "custom"
        ? { sessionId: liveSession.id }
        : {}),
    };
    void attempt(
      () => saveMatch(matchId, body),
      (savedMatch) => {
        setRecordedMatch(savedMatch);
        setStep("done");
      },
      SAVE_ERROR_FALLBACK,
    );
  };

  const goToStep = (nextStep: Step) => {
    setError(null);
    setStep(nextStep);
  };

  // 깊이가 닫힐 때 아직 점수 단계면 플레이어 선택으로 간다. 저장 완료로 단계가 바뀌어 닫힐 때는 그대로 둔다
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  const backToPick = useCallback(() => {
    if (stepRef.current !== "score") return;
    setError(null);
    setStep("pick");
  }, []);
  useLayerDepth({
    isOpen: isOpen && step === "score",
    tabKey,
    depthId: SCORE_STEP_DEPTH_ID,
    kind: "bottom-sheet",
    onClose: backToPick,
  });

  if (step === "done" && recordedMatch) {
    const recordedTeams: [string[], string[]] = [
      recordedMatch.teams[0].players.map((player) => player.id),
      recordedMatch.teams[1].players.map((player) => player.id),
    ];

    return (
      <RecordDoneStep
        match={recordedMatch}
        hasLiveSession={!!liveSession}
        isBusy={isBusy}
        error={error}
        onPlayAgain={() => {
          if (liveSession) {
            startMatch(recordedTeams);
            return;
          }
          setSlots(slotsFromTeams(recordedTeams));
          setEditingMatchId(null);
          setScore(EMPTY_SCORE);
          setScrollKey((key) => key + 1);
          goToStep("score");
        }}
        onDone={onClose}
      />
    );
  }

  if (step === "score" && slotTeams) {
    return (
      <ScoreStep
        teams={teamPlayers}
        score={score}
        onScoreChange={(nextScore) => {
          setScore(nextScore);
          setError(null);
        }}
        location={location}
        onLocationChange={(nextLocation) => {
          setLocation(nextLocation);
          setError(null);
        }}
        scrollKey={scrollKey}
        error={isEditable ? error : NOT_EDITABLE_MESSAGE}
        canSave={canSave}
        isSaving={isBusy}
        onBack={() => {
          if (!closeDepth(tabKey, SCORE_STEP_DEPTH_ID)) backToPick();
        }}
        onSave={handleSave}
      />
    );
  }

  return (
    <PickPlayersStep
      slots={slots}
      onSlotsChange={(nextSlots) => {
        setSlots(nextSlots);
        setError(null);
      }}
      players={players}
      playersStatus={playersStatus}
      playerById={playerById}
      participantIds={participantIds}
      busyIds={busyIds}
      footerMode={liveSession && !editingMatchId ? "session" : "plain"}
      isBusy={isBusy}
      error={error}
      onCancel={onClose}
      onNext={() => {
        if (slotTeams) goToStep("score");
      }}
      onStartMatch={() => {
        if (slotTeams) startMatch(slotTeams);
      }}
    />
  );
}
