import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@heroui/react";
import { IoQrCodeSharp } from "react-icons/io5";
import type { MatchMode } from "@pkpkdupr/shared/match";
import { rememberRecentInputValue } from "@pkpkdupr/shared/recentInputHistory";
import {
  computeMatchStartsAt,
  DEFAULT_MATCH_MODE,
} from "@pkpkdupr/shared/match";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import CreateMatchModeSelector from "./CreateMatchModeSelector";
import CreateMatchQrScannerPanel from "./CreateMatchQrScannerPanel";
import BottomSheet from "./BottomSheet";
import CreateMatchTeamGrid from "./CreateMatchTeamGrid";
import BottomSheetSection from "./BottomSheetSection";
import HoldToConfirmButton from "./HoldToConfirmButton";
import RecentValueComboBox from "./RecentValueComboBox";
import {
  areSameMatchMembers,
  areSameMatchTeams,
  areTeamsValid,
  buildInitialTeams,
  buildPreviewTeams,
  canSwapMembers,
  createEmptyTeams,
  mergeUniqueMembers,
  normalizeMatchMember,
  resolveSelectedMatchType,
  type MatchMember,
  type MatchTeams,
} from "./CreateMatchDrawerBody.utils";
import useCreateMatchQrScanner from "./useCreateMatchQrScanner";

interface CreateMatchDrawerBodyProps {
  onCreateMatch: () => void | Promise<void>;
  onCancel: () => void;
  onQrScannerOpenChange?: (isOpen: boolean) => void;
  isOnline?: boolean;
  closeQrScannerRequestKey?: number;
}

const CreateMatchDrawerBody: React.FC<CreateMatchDrawerBodyProps> = ({
  onCreateMatch,
  onCancel,
  onQrScannerOpenChange,
  isOnline = true,
  closeQrScannerRequestKey = 0,
}) => {
  const { player, isAuthenticated } = useAuth();
  const [selectedMatchMembers, setSelectedMatchMembers] = useState<
    MatchMember[]
  >([]);
  const [teams, setTeams] = useState<MatchTeams>(() => createEmptyTeams());
  const [selectedSwapMemberId, setSelectedSwapMemberId] = useState<
    string | null
  >(null);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [createMatchError, setCreateMatchError] = useState<string | null>(null);
  const [matchNameMode, setMatchNameMode] = useState<"auto" | "manual">("auto");
  const [matchName, setMatchName] = useState("");
  const [location, setLocation] = useState("");
  const [selectedMatchMode, setSelectedMatchMode] =
    useState<MatchMode>(DEFAULT_MATCH_MODE);
  const matchStartsAt = useMemo(() => computeMatchStartsAt(), []);
  const selectedMatchMembersRef = useRef<MatchMember[]>(selectedMatchMembers);

  const currentPlayerMember = useMemo(
    () => normalizeMatchMember(player),
    [player],
  );
  const selectedMatchType = useMemo(
    () => resolveSelectedMatchType(selectedMatchMembers),
    [selectedMatchMembers],
  );
  const trimmedMatchName = matchName.trim();
  const trimmedLocation = location.trim();
  const isManualMatchNameEmpty =
    matchNameMode === "manual" && !trimmedMatchName;
  const canCreateMatch =
    isOnline &&
    !!selectedMatchType &&
    areTeamsValid(teams, selectedMatchType) &&
    !isManualMatchNameEmpty &&
    !!trimmedLocation;
  const canAddMatchMember =
    isOnline && isAuthenticated && selectedMatchMembers.length < 4;
  const previewTeams = useMemo(
    () => buildPreviewTeams(selectedMatchMembers, teams, selectedMatchType),
    [selectedMatchMembers, selectedMatchType, teams],
  );

  const applyMembersState = useCallback((nextMembers: MatchMember[]) => {
    const nextMatchType = resolveSelectedMatchType(nextMembers);
    const nextTeams = buildInitialTeams(nextMembers, nextMatchType);

    selectedMatchMembersRef.current = nextMembers;
    setSelectedMatchMembers((prev) =>
      areSameMatchMembers(prev, nextMembers) ? prev : nextMembers,
    );
    setTeams((prev) => (areSameMatchTeams(prev, nextTeams) ? prev : nextTeams));
    setSelectedSwapMemberId(null);
    setCreateMatchError(null);
  }, []);

  useEffect(() => {
    if (!currentPlayerMember) {
      return;
    }

    const nextMembers = mergeUniqueMembers([
      currentPlayerMember,
      ...selectedMatchMembers.filter(
        (member) => member.id !== currentPlayerMember.id,
      ),
    ]).slice(0, 4);

    if (areSameMatchMembers(selectedMatchMembers, nextMembers)) {
      return;
    }

    applyMembersState(nextMembers);
  }, [applyMembersState, currentPlayerMember, selectedMatchMembers]);

  useEffect(() => {
    selectedMatchMembersRef.current = selectedMatchMembers;
  }, [selectedMatchMembers]);

  const {
    videoRef,
    isQrScannerOpen,
    qrScannerStatus,
    qrScannerError,
    pendingQrMember,
    openQrScanner,
    retryQrScan,
    closeQrScanner,
  } = useCreateMatchQrScanner({
    isAuthenticated,
    isOnline,
    selectedMatchMembersRef,
    onQrScannerOpenChange,
    closeQrScannerRequestKey,
  });

  const handleConfirmQrMember = () => {
    if (!pendingQrMember) {
      return;
    }

    const nextMember = pendingQrMember;

    if (selectedMatchMembersRef.current.length >= 4) {
      closeQrScanner();
      return;
    }

    if (
      selectedMatchMembersRef.current.some(
        (member) => member.id === nextMember.id,
      )
    ) {
      retryQrScan();
      return;
    }

    const nextMembers = [...selectedMatchMembersRef.current, nextMember];
    applyMembersState(nextMembers);

    if (nextMembers.length >= 4) {
      closeQrScanner();
      return;
    }

    retryQrScan();
  };

  const handleRemoveMatchMember = (memberId: string) => {
    if (memberId === currentPlayerMember?.id) {
      return;
    }

    const nextMembers = selectedMatchMembersRef.current.filter(
      (member) => member.id !== memberId,
    );

    applyMembersState(nextMembers);
  };

  const handleTeamMemberPress = (member: MatchMember) => {
    if (selectedSwapMemberId === member.id) {
      setSelectedSwapMemberId(null);
      return;
    }

    if (!selectedSwapMemberId) {
      setSelectedSwapMemberId(member.id);
      return;
    }

    if (
      !canSwapMembers(teams, selectedMatchType, selectedSwapMemberId, member)
    ) {
      return;
    }

    setTeams((prev) => {
      const sourceMember = prev
        .flat()
        .find((teamMember) => teamMember.id === selectedSwapMemberId);
      const targetMember = prev
        .flat()
        .find((teamMember) => teamMember.id === member.id);

      if (!sourceMember || !targetMember) {
        return prev;
      }

      return [
        prev[0].map((teamMember) => {
          if (teamMember.id === sourceMember.id) return targetMember;
          if (teamMember.id === targetMember.id) return sourceMember;
          return teamMember;
        }),
        prev[1].map((teamMember) => {
          if (teamMember.id === sourceMember.id) return targetMember;
          if (teamMember.id === targetMember.id) return sourceMember;
          return teamMember;
        }),
      ];
    });
    setSelectedSwapMemberId(null);
  };

  const handleCreateMatchPress = async () => {
    if (!isAuthenticated) {
      setCreateMatchError("로그인이 필요해요.");
      return;
    }
    if (!isOnline) {
      setCreateMatchError(
        "오프라인에서는 매치를 생성할 수 없습니다. 온라인 연결이 필요합니다.",
      );
      return;
    }

    if (!selectedMatchType || !areTeamsValid(teams, selectedMatchType)) {
      setCreateMatchError("유효한 팀 구성이 필요해요.");
      return;
    }

    try {
      setIsCreatingMatch(true);
      setCreateMatchError(null);

      const res = await apiFetch("/api/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(matchNameMode === "manual" ? { name: trimmedMatchName } : {}),
          mode: selectedMatchMode,
          teams: teams.map((team, teamIndex) => ({
            name: `Team ${teamIndex === 0 ? "A" : "B"}`,
            playerIds: team.map((member) => member.id),
          })),
          location: trimmedLocation,
          matchStartsAt: matchStartsAt.toISOString(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "매치를 생성하지 못했어요.");
      }

      if (matchNameMode === "manual") {
        rememberRecentInputValue("web.match.name", trimmedMatchName);
      }
      rememberRecentInputValue("web.match.location", trimmedLocation);

      await onCreateMatch();
    } catch (err) {
      setCreateMatchError(
        err instanceof Error ? err.message : "매치를 생성하지 못했어요.",
      );
    } finally {
      setIsCreatingMatch(false);
    }
  };

  const teamGrid = (
    <CreateMatchTeamGrid
      previewTeams={previewTeams}
      teams={teams}
      selectedMatchType={selectedMatchType}
      selectedSwapMemberId={selectedSwapMemberId}
      currentPlayerMemberId={currentPlayerMember?.id}
      interactive={!isQrScannerOpen}
      onRemoveMember={handleRemoveMatchMember}
      onPressMember={handleTeamMemberPress}
    />
  );

  return (
    <>
      <BottomSheet.Header>
        <h2 className="bs-text-head text-left text-pkpk-main-font">
          {isQrScannerOpen ? "QR코드 스캔" : "매치 생성"}
        </h2>
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0 pb-4">
        {isQrScannerOpen ? (
          <CreateMatchQrScannerPanel
            teamGrid={
              <CreateMatchTeamGrid
                previewTeams={previewTeams}
                teams={teams}
                selectedMatchType={selectedMatchType}
                selectedSwapMemberId={selectedSwapMemberId}
                currentPlayerMemberId={currentPlayerMember?.id}
                interactive={false}
                onRemoveMember={handleRemoveMatchMember}
                onPressMember={handleTeamMemberPress}
              />
            }
            videoRef={videoRef}
            qrScannerStatus={qrScannerStatus}
            qrScannerError={qrScannerError}
            pendingQrMember={pendingQrMember}
            currentPlayerId={player?.id}
            onRetry={retryQrScan}
            onConfirm={handleConfirmQrMember}
            onClose={closeQrScanner}
          />
        ) : (
          <>
            <BottomSheetSection>
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="bs-text-title text-pkpk-sub-font">팀 구성</p>
                </div>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openQrScanner();
                  }}
                  disabled={!canAddMatchMember || isQrScannerOpen}
                  className="absolute right-0 -top-2 flex shrink-0 items-center gap-1 rounded-full bg-[#409eff] px-4 py-2 text-sm font-medium text-white disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <IoQrCodeSharp className="size-4" />
                  멤버 추가
                </button>
              </div>

              {selectedMatchType ? (
                <>
                  <p className="bs-text-caption text-pkpk-sub-font">
                    {selectedSwapMemberId
                      ? "교체할 상대 팀 멤버를 선택하세요."
                      : "멤버를 탭해서 팀을 교체할 수 있어요."}
                  </p>
                  {teamGrid}
                </>
              ) : (
                <>
                  <p className="bs-text-caption text-error">
                    멤버 2명 또는 4명이 필요해요.
                  </p>
                  {teamGrid}
                </>
              )}
            </BottomSheetSection>

            <BottomSheetSection>
              <CreateMatchModeSelector
                selectedMatchMode={selectedMatchMode}
                onChange={setSelectedMatchMode}
              />
            </BottomSheetSection>

            <BottomSheetSection>
              <p className="bs-text-title text-pkpk-sub-font">
                매치 시작(자동)
              </p>
              <p className="bs-text-body pt-1 text-slate-500">
                {matchStartsAt.toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
            </BottomSheetSection>

            <BottomSheetSection>
              <p className="bs-text-title text-pkpk-sub-font">매치 이름</p>
              <div
                role="radiogroup"
                aria-label="매치 이름 입력 방식"
                className="flex items-start gap-5"
              >
                <label className="flex shrink-0 cursor-pointer items-center gap-2 py-1">
                  <input
                    type="radio"
                    name="match-name-mode"
                    value="auto"
                    checked={matchNameMode === "auto"}
                    onChange={() => setMatchNameMode("auto")}
                    className="sr-only"
                  />
                  <span className="flex size-5 items-center justify-center rounded-full border border-slate-300 bg-white">
                    <span
                      className={`block size-2.5 rounded-full bg-[#409eff] transition-all duration-200 ease-out ${
                        matchNameMode === "auto"
                          ? "scale-100 opacity-100"
                          : "scale-0 opacity-0"
                      }`}
                    />
                  </span>
                  <span
                    className={`bs-text-title text-pkpk-sub-font transition-all duration-200 ease-out ${
                      matchNameMode === "auto" ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    자동
                  </span>
                </label>
                <div className="flex min-w-0 flex-1 items-start gap-2 pt-1">
                  <label
                    aria-label="수동 입력"
                    className="flex shrink-0 cursor-pointer items-center"
                  >
                    <input
                      type="radio"
                      name="match-name-mode"
                      value="manual"
                      checked={matchNameMode === "manual"}
                      onChange={() => setMatchNameMode("manual")}
                      className="sr-only"
                    />
                    <span className="flex size-5 items-center justify-center rounded-full border border-slate-300 bg-white">
                      <span
                        className={`block size-2.5 rounded-full bg-[#409eff] transition-all duration-200 ease-out ${
                          matchNameMode === "manual"
                            ? "scale-100 opacity-100"
                            : "scale-0 opacity-0"
                        }`}
                      />
                    </span>
                  </label>
                  <RecentValueComboBox
                    fieldKey="web.match.name"
                    value={matchName}
                    onFocus={() => setMatchNameMode("manual")}
                    onChange={(nextValue) => {
                      setMatchName(nextValue);
                      setCreateMatchError(null);
                    }}
                    placeholder="매치 이름 입력"
                    className="min-w-0 flex-1"
                    inputClassName="app-mobile-input min-w-0 flex-1 rounded-2xl border border-border px-4 py-2 text-base text-pkpk-sub-font outline-none"
                  />
                </div>
              </div>
            </BottomSheetSection>

            <BottomSheetSection>
              <label
                htmlFor="create-match-location"
                className="bs-text-title text-pkpk-sub-font"
              >
                장소
              </label>
              <RecentValueComboBox
                id="create-match-location"
                fieldKey="web.match.location"
                value={location}
                onChange={(nextValue) => {
                  setLocation(nextValue);
                  setCreateMatchError(null);
                }}
                required
                placeholder="장소 입력"
                className="w-full"
                inputClassName="app-mobile-input w-full rounded-2xl border border-border bg-white px-4 py-2 text-base text-pkpk-sub-font outline-none"
              />
            </BottomSheetSection>
          </>
        )}
        {!isQrScannerOpen ? (
          <div className="flex flex-col gap-2">
            {createMatchError ? (
              <p className="bs-text-body text-error">{createMatchError}</p>
            ) : null}
            <div className="grid w-full grid-cols-3 gap-2">
              <Button
                className="app-action-button w-full rounded-2xl bg-red-50 py-3 text-base font-semibold text-red-500"
                isDisabled={isCreatingMatch}
                onPress={onCancel}
              >
                취소
              </Button>
              <HoldToConfirmButton
                ariaLabel="길게 눌러 매치생성"
                onComplete={handleCreateMatchPress}
                isDisabled={!canCreateMatch || isCreatingMatch}
                className="app-action-button col-span-2 w-full justify-center rounded-2xl bg-[#409eff] px-3 py-3 text-base font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
                progressClassName="bg-white/20"
              >
                {!isOnline
                  ? "온라인 연결 필요"
                  : isCreatingMatch
                    ? "생성 중..."
                    : "길게 눌러 매치생성"}
              </HoldToConfirmButton>
            </div>
          </div>
        ) : null}
      </BottomSheet.Body>
    </>
  );
};

export default CreateMatchDrawerBody;
