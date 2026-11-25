import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchSessionParticipant } from "@pkpkdupr/shared/match";
import BottomSheet from "@/components/BottomSheet";
import { PkButton, buttonPressClassName, rowPressClassName } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GuestLabel } from "@/components/ui/GuestLabel";
import { PersonAddIcon } from "@/components/ui/Icons";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SearchField } from "@/components/ui/SearchField";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { StateMessage } from "@/components/ui/StateMessage";
import { cx } from "@/components/ui/cx";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { type MemberListPlayerInfo, usePlayers } from "@/hooks/usePlayers";
import {
  addMatchSessionGuest,
  addMatchSessionParticipant,
  type MatchSessionDetailInfo,
  removeMatchSessionParticipant,
} from "@/lib/matchSessions";
import { getGuestAddOption, GUEST_USERNAME_FORMAT_HINT } from "./guestAdd";
import { getUserErrorMessage, isNetworkError } from "@/lib/errors";
import { getErrorMessage } from "./saveError";

export interface ParticipantsSheetProps {
  isOpen: boolean;
  tabKey: TabKey;
  session: MatchSessionDetailInfo;
  /** 진행 중 경기에 든 선수. 잠긴 체크·"경기 중"으로 보이고 뺄 수 없다 */
  lockedPlayerIds?: readonly string[];
  onClose: () => void;
  /** 수정 모드에서 참여자를 바꾼 뒤 호출 */
  onChanged: () => void;
  /** 끝난 세션처럼 참여자를 바꿀 수 없으면 보기 모드만 있고 "수정"이 없다 */
  isReadOnly?: boolean;
}

const DEPTH_ID = "participants-sheet";
/** 수정 모드 깊이. 뒤로가기는 시트를 닫지 않고 보기 모드로 돌아간다 */
const EDIT_DEPTH_ID = "participants-sheet-edit";
const GUEST_CONFIRM_DEPTH_ID = "participants-guest-confirm";
const SHEET_LAYER = 70;
const GUEST_CONFIRM_LAYER = SHEET_LAYER + 5;
const EMPTY_IDS: readonly string[] = [];

/** 22px 원형 체크. 참여자는 블루, 잠긴 참여자는 회색, 비참여는 빈 원 */
const CheckMark: React.FC<{ isChecked: boolean; isLocked: boolean }> = ({
  isChecked,
  isLocked,
}) =>
  isChecked ? (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-white",
        isLocked ? "bg-pk-quiet" : "bg-pk-primary",
      )}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="size-[22px] shrink-0 rounded-full shadow-[inset_0_0_0_2px_var(--color-pk-quiet)]"
    />
  );

const compareUsername = (a: { username: string }, b: { username: string }) =>
  a.username.localeCompare(b.username, "ko");

/** 보기·수정 모드가 같이 쓰는 줄 내용: 아바타·아이디·게스트 라벨·"경기 중" */
const ParticipantRowContent: React.FC<{
  player: MatchSessionParticipant;
  isGuest: boolean;
  isLocked: boolean;
}> = ({ player, isGuest, isLocked }) => (
  <>
    <PlayerAvatar player={player} size={32} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex min-w-0 items-baseline gap-1">
        <span className="truncate text-pk-15 font-bold text-pk-ink">
          {player.username}
        </span>
        {isGuest ? <GuestLabel /> : null}
      </span>
      {isLocked ? (
        <span className="text-pk-12 text-pk-muted">경기 중</span>
      ) : null}
    </span>
  </>
);

type ParticipantRow = Pick<
  MemberListPlayerInfo,
  "id" | "username" | "avatarUrl" | "status" | "isGuest"
>;

/** 저장할 변경. 실패한 것만 남겨 다시 시도한다 */
interface ParticipantChange {
  playerId: string;
  action: "add" | "remove";
}

interface ParticipantsEditFormProps {
  tabKey: TabKey;
  session: MatchSessionDetailInfo;
  /** 서버에 반영된 참여자. 저장·게스트 추가 뒤 `onSavedParticipantsChange`로 올린 값이 다시 내려온다 */
  participants: readonly MatchSessionParticipant[];
  lockedPlayerIds: readonly string[];
  /** 완료로 저장을 마쳤을 때 호출. 시트는 보기 모드로 돌아간다 */
  onDone: (didChange: boolean) => void;
  onCancel: () => void;
  onChanged: () => void;
  /**
   * 서버에 반영된 참여자가 바뀔 때마다 호출. 저장 중 뒤로가기로 이 폼이 사라져도 보기 모드가
   * 다시 불러오기 전에 최신 참여자를 보이도록, 저장·게스트 추가가 끝난 자리에서 바로 부른다
   */
  onSavedParticipantsChange: (participants: MatchSessionParticipant[]) => void;
}

const ParticipantsEditForm: React.FC<ParticipantsEditFormProps> = ({
  tabKey,
  session,
  participants,
  lockedPlayerIds,
  onDone,
  onCancel,
  onChanged,
  onSavedParticipantsChange,
}) => {
  const {
    players,
    status: playersStatus,
    error: playersError,
    reload: reloadPlayers,
  } = usePlayers();
  const { showSaveFailure } = useSystemNotice();
  const { selectedTab } = useTabNavigation();
  const [query, setQuery] = useState("");
  const savedIds = useMemo(
    () => new Set(participants.map((member) => member.id)),
    [participants],
  );
  const [selectedIds, setSelectedIds] = useState(() => new Set(savedIds));
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 확인 창에 띄운 게스트 아이디. 있으면 확인 창이 열린다
  const [pendingGuestUsername, setPendingGuestUsername] = useState<
    string | null
  >(null);
  const isGuestConfirmLayerOpen = useLayerDepth({
    isOpen: pendingGuestUsername !== null,
    tabKey,
    depthId: GUEST_CONFIRM_DEPTH_ID,
    kind: "dialog",
    onClose: () => setPendingGuestUsername(null),
  });
  // 이 시트에서 만든 게스트. 회원 목록을 다시 받기 전에도 목록에 보인다
  const [addedGuests, setAddedGuests] = useState<ParticipantRow[]>([]);
  // 정렬은 열 때의 참여자(와 새로 만든 게스트) 기준으로 고정해 체크를 바꿔도 행이 움직이지 않게 한다
  const [sortAnchorIds, setSortAnchorIds] = useState(() => savedIds);
  const lockedIds = useMemo(() => new Set(lockedPlayerIds), [lockedPlayerIds]);

  // 상태와 상관없는 모든 회원과 이 시트에서 만든 게스트. 아이디 중복 판정에도 쓴다
  const allRows = useMemo(() => {
    const playerIds = new Set(players.map((player) => player.id));
    return [
      ...players,
      ...addedGuests.filter((guest) => !playerIds.has(guest.id)),
    ];
  }, [addedGuests, players]);

  /** 서버에 반영된 참여자 id를 보기 모드 목록으로 바꿔 올린다 */
  const reportSavedParticipants = useCallback(
    (ids: ReadonlySet<string>, extraRows: readonly ParticipantRow[] = []) => {
      // 회원 목록을 아직 못 받았어도 지금 참여자로 이름·사진을 채운다
      const byId = new Map<string, MatchSessionParticipant>(
        participants.map((member) => [member.id, member]),
      );
      for (const row of [...allRows, ...extraRows]) byId.set(row.id, row);
      onSavedParticipantsChange(
        [...ids]
          .map((id) => byId.get(id))
          .filter((member) => member !== undefined),
      );
    },
    [allRows, onSavedParticipantsChange, participants],
  );

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return allRows
      .filter((player) => player.status === "active")
      .filter(
        (player) =>
          !normalizedQuery ||
          player.username.toLocaleLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => {
        const rankA = sortAnchorIds.has(a.id) ? 0 : 1;
        const rankB = sortAnchorIds.has(b.id) ? 0 : 1;
        return rankA - rankB || compareUsername(a, b);
      });
  }, [allRows, query, sortAnchorIds]);

  const guestAddOption = useMemo(
    () =>
      getGuestAddOption({
        query,
        playersStatus,
        existingUsernames: allRows.map((row) => row.username),
      }),
    [allRows, playersStatus, query],
  );

  const toggle = (playerId: string) => {
    if (lockedIds.has(playerId) || isSaving || isAddingGuest) return;
    setError(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  /** 바뀐 사람만 한 명씩 반영한다. 네트워크 실패면 throw 해서 토스트로 다시 시도하게 한다 */
  const save = useCallback(async () => {
    const changes: ParticipantChange[] = [
      ...[...selectedIds]
        .filter((id) => !savedIds.has(id))
        .map((playerId) => ({ playerId, action: "add" as const })),
      ...[...savedIds]
        .filter((id) => !selectedIds.has(id) && !lockedIds.has(id))
        .map((playerId) => ({ playerId, action: "remove" as const })),
    ];
    if (changes.length === 0) {
      onDone(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    const applied: ParticipantChange[] = [];
    let serverError: string | null = null;
    let networkError: unknown = null;

    for (const change of changes) {
      try {
        if (change.action === "add") {
          await addMatchSessionParticipant(session.id, change.playerId);
        } else {
          await removeMatchSessionParticipant(session.id, change.playerId);
        }
        applied.push(change);
      } catch (err) {
        if (isNetworkError(err)) {
          // 연결이 끊겼으면 나머지도 실패하므로 멈춘다
          networkError = err;
          break;
        }
        serverError ??= getErrorMessage(err, "참여자를 반영하지 못했어요");
      }
    }

    setIsSaving(false);
    const didApplyAny = applied.length > 0;
    if (didApplyAny) {
      // 저장 중에는 게스트 추가가 막혀 있어 시작 시점 savedIds에 반영분만 더하면 서버 상태와 같다
      const next = new Set(savedIds);
      for (const change of applied) {
        if (change.action === "add") next.add(change.playerId);
        else next.delete(change.playerId);
      }
      reportSavedParticipants(next);
    }

    if (!networkError && !serverError) {
      onDone(true);
      return;
    }
    // 일부라도 반영됐으면 화면이 서버 상태를 다시 읽게 한다
    if (didApplyAny) onChanged();
    if (serverError) setError(serverError);
    if (networkError) throw networkError;
  }, [
    lockedIds,
    onChanged,
    onDone,
    reportSavedParticipants,
    savedIds,
    selectedIds,
    session.id,
  ]);

  // 토스트의 "다시 시도"는 그 시점의 선택으로 남은 변경을 다시 저장한다
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /** 게스트를 만들면 서버가 바로 참여자로 넣으므로, 저장된 참여자로 체크해 둔다 */
  const addGuest = useCallback(
    async (username: string) => {
      setIsAddingGuest(true);
      setError(null);
      try {
        const guest = await addMatchSessionGuest(session.id, username);
        setQuery("");
        setAddedGuests((current) => [...current, guest]);
        setSortAnchorIds((current) => new Set(current).add(guest.id));
        setSelectedIds((current) => new Set(current).add(guest.id));
        reportSavedParticipants(new Set(savedIds).add(guest.id), [guest]);
        void reloadPlayers();
        onChanged();
      } catch (err) {
        if (isNetworkError(err)) throw err;
        setError(getErrorMessage(err, "게스트를 추가하지 못했어요"));
      } finally {
        setIsAddingGuest(false);
      }
    },
    [onChanged, reloadPlayers, reportSavedParticipants, savedIds, session.id],
  );

  const handleAddGuest = async (username: string) => {
    if (isSaving || isAddingGuest) return;
    try {
      await addGuest(username);
    } catch {
      showSaveFailure({ onRetry: () => addGuest(username) });
    }
  };

  /** 성공·실패와 상관없이 창을 닫는다. 실패 문구는 시트 하단·토스트가 보인다 */
  const confirmGuest = async (username: string) => {
    await handleAddGuest(username);
    setPendingGuestUsername(null);
  };

  const handleDone = async () => {
    if (isSaving || isAddingGuest) return;
    try {
      await save();
    } catch {
      showSaveFailure({ onRetry: () => saveRef.current() });
    }
  };

  return (
    <>
      <BottomSheet.Header className="flex flex-col gap-3">
        <SheetTitle
          title="참여자 수정"
          sub={`${session.name} · ${selectedIds.size}명`}
        />
        <SearchField
          aria-label="아이디 검색"
          placeholder="아이디 검색"
          value={query}
          onValueChange={setQuery}
        />
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0 gap-0 overflow-y-auto">
        {rows.length === 0 ? (
          playersStatus === "error" ? (
            <StateMessage
              kind="error"
              message={getUserErrorMessage(
                playersError,
                "회원 목록을 불러오지 못했어요",
              )}
              onRetry={() => void reloadPlayers()}
            />
          ) : playersStatus === "loading" ? (
            <p className="py-6 text-center text-pk-13 text-pk-muted">
              회원 목록을 불러오는 중…
            </p>
          ) : guestAddOption ? null : (
            <StateMessage kind="empty" message="검색 결과가 없어요" />
          )
        ) : (
          <ul aria-label="회원" className="flex flex-col">
            {rows.map((player) => {
              const isLocked = lockedIds.has(player.id);
              const isChecked = isLocked || selectedIds.has(player.id);
              const content = (
                <>
                  <ParticipantRowContent
                    player={player}
                    isGuest={player.isGuest}
                    isLocked={isLocked}
                  />
                  <CheckMark isChecked={isChecked} isLocked={isLocked} />
                </>
              );
              const rowClassName =
                "flex min-h-14 w-full items-center gap-3 px-1 text-left";

              return (
                <li
                  key={player.id}
                  className="not-last:border-b not-last:border-pk-divider"
                >
                  {isLocked ? (
                    <div
                      role="checkbox"
                      aria-checked="true"
                      aria-disabled="true"
                      className={rowClassName}
                    >
                      {content}
                    </div>
                  ) : (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      disabled={isSaving || isAddingGuest}
                      onClick={() => toggle(player.id)}
                      className={rowClassName}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {guestAddOption ? (
          <button
            type="button"
            disabled={!guestAddOption.isValid || isAddingGuest || isSaving}
            onClick={() => {
              setError(null);
              setPendingGuestUsername(guestAddOption.username);
            }}
            className={cx(
              "flex min-h-14 w-full shrink-0 items-center gap-3 px-1 text-left text-pk-primary",
              rowPressClassName,
              rows.length > 0 && "border-t border-pk-divider",
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                "flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed",
                guestAddOption.isValid
                  ? "border-pk-primary"
                  : "border-pk-muted text-pk-muted",
              )}
            >
              <PersonAddIcon />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cx(
                  "truncate text-pk-15 font-bold",
                  !guestAddOption.isValid && "text-pk-muted",
                )}
              >
                ‘{guestAddOption.username}’ 게스트로 추가
              </span>
              <span className="text-pk-12 text-pk-sub">
                {/* 추가 중 뒤로가기로 확인 창이 먼저 닫혀도 진행 상태가 보이게 줄에도 표시한다 */}
                {isAddingGuest
                  ? "추가하는 중…"
                  : guestAddOption.isValid
                    ? "이 아이디로 게스트를 만들고 이 세션에 넣어요"
                    : GUEST_USERNAME_FORMAT_HINT}
              </span>
            </span>
          </button>
        ) : null}
      </BottomSheet.Body>
      <BottomSheet.Footer className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="px-1 text-pk-13 font-bold text-pk-down">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <PkButton
            variant="soft"
            size="lg"
            disabled={isSaving || isAddingGuest}
            onClick={onCancel}
          >
            취소
          </PkButton>
          <PkButton
            size="lg"
            className="flex-1"
            disabled={isSaving || isAddingGuest}
            onClick={() => void handleDone()}
          >
            {isSaving ? "저장 중…" : "완료"}
          </PkButton>
        </div>
      </BottomSheet.Footer>
      {pendingGuestUsername !== null ? (
        <ConfirmDialog
          isOpen={isGuestConfirmLayerOpen}
          isActive={tabKey === selectedTab}
          layer={GUEST_CONFIRM_LAYER}
          title="게스트로 추가할까요?"
          confirmLabel={isAddingGuest ? "추가하는 중…" : "추가"}
          isConfirming={isAddingGuest}
          onCancel={() => setPendingGuestUsername(null)}
          onConfirm={() => void confirmGuest(pendingGuestUsername)}
        >
          <div className="flex min-w-0 items-center justify-center gap-2.5 rounded-pk-sm bg-pk-bg px-3 py-3.5">
            <PlayerAvatar
              player={{ id: pendingGuestUsername, username: pendingGuestUsername }}
              size={40}
            />
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="truncate text-pk-17 font-extrabold">
                {pendingGuestUsername}
              </span>
              <GuestLabel />
            </span>
          </div>
          <p className="px-1 text-center text-pk-13 text-pk-sub">
            이 아이디로 게스트를 만들어 {session.name}에 넣어요.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
};

interface ParticipantsViewProps {
  session: MatchSessionDetailInfo;
  participants: readonly MatchSessionParticipant[];
  lockedPlayerIds: readonly string[];
  /** 생략하면(읽기 전용) "수정"이 없다 */
  onEdit?: () => void;
}

/** 보기 모드. 참여자만 보이고, 오른쪽 위 "수정"으로 수정 모드를 연다 */
const ParticipantsView: React.FC<ParticipantsViewProps> = ({
  session,
  participants,
  lockedPlayerIds,
  onEdit,
}) => {
  const { players } = usePlayers();
  const lockedIds = useMemo(() => new Set(lockedPlayerIds), [lockedPlayerIds]);
  // 참여자 응답에는 게스트 여부가 없어 회원 목록에서 찾는다
  const guestIds = useMemo(
    () =>
      new Set(
        players.filter((player) => player.isGuest).map((player) => player.id),
      ),
    [players],
  );
  const rows = useMemo(
    () => [...participants].sort(compareUsername),
    [participants],
  );

  return (
    <>
      <BottomSheet.Header>
        <SheetTitle
          title="참여자"
          sub={`${session.name} · ${participants.length}명`}
          right={
            onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className={cx("inline-flex min-h-11 items-center px-2 text-pk-15 font-bold text-pk-primary", buttonPressClassName)}
              >
                수정
              </button>
            ) : undefined
          }
        />
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0 gap-0 overflow-y-auto">
        {rows.length === 0 ? (
          <StateMessage kind="empty" message="아직 참여자가 없어요" />
        ) : (
          <ul aria-label="참여자" className="flex flex-col">
            {rows.map((member) => (
              <li
                key={member.id}
                className="flex min-h-14 items-center gap-3 px-1 not-last:border-b not-last:border-pk-divider"
              >
                <ParticipantRowContent
                  player={member}
                  isGuest={guestIds.has(member.id)}
                  isLocked={lockedIds.has(member.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </BottomSheet.Body>
    </>
  );
};

/**
 * 세션 참여자 시트. 열면 참여자를 보는 보기 모드이고, "수정"을 누르면 같은 시트에서
 * 수정 모드(전체 회원 체크·게스트 추가)로 바뀐다. 오늘·미래 세션 모두 쓰고, 다른 회원도 대신 추가·삭제한다
 */
export default function ParticipantsSheet({
  isOpen,
  tabKey,
  session,
  lockedPlayerIds = EMPTY_IDS,
  onClose,
  onChanged,
  isReadOnly = false,
}: ParticipantsSheetProps): React.ReactElement {
  const { closeDepth, selectedTab } = useTabNavigation();
  const [isEditing, setIsEditing] = useState(false);
  // 이 시트에서 저장한 참여자. 셸이 넘기는 세션은 연 시점 값이라 저장 뒤에는 이 값을 보인다
  const [savedParticipants, setSavedParticipants] = useState<
    MatchSessionParticipant[] | null
  >(null);
  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId: DEPTH_ID,
    kind: "bottom-sheet",
    onClose,
  });
  // 수정 모드에서 시트 전체를 닫는 중이면 닫히는 동안 보기 모드로 바뀌지 않게 한다
  const isClosingRef = useRef(false);
  const backToView = useCallback(() => {
    if (!isClosingRef.current) setIsEditing(false);
  }, []);
  // 보는 중 세션이 끝나 읽기 전용이 되면 수정 모드도 닫는다
  const isEditMode = isEditing && !isReadOnly;
  useLayerDepth({
    isOpen: isOpen && isEditMode,
    tabKey,
    depthId: EDIT_DEPTH_ID,
    kind: "bottom-sheet",
    onClose: backToView,
  });

  // 열 때마다 보기 모드로 시작한다. 수정 깊이가 지난 상태로 쌓이지 않도록 effect 전에 렌더 중 초기화한다
  const openedSessionId = isOpen ? session.id : null;
  const [lastOpenedSessionId, setLastOpenedSessionId] = useState(openedSessionId);
  if (openedSessionId !== lastOpenedSessionId) {
    setLastOpenedSessionId(openedSessionId);
    if (openedSessionId !== null) {
      setIsEditing(false);
      setSavedParticipants(null);
    }
  }

  const participants = savedParticipants ?? session.participants;

  const closeSheet = useCallback(() => {
    if (!closeDepth(tabKey, DEPTH_ID)) onClose();
  }, [closeDepth, onClose, tabKey]);

  /** 배경 탭·끌어내리기. 수정 모드면 히스토리가 남지 않게 수정 깊이부터 닫는다 */
  const close = useCallback(() => {
    if (isEditMode) {
      isClosingRef.current = true;
      if (!closeDepth(tabKey, EDIT_DEPTH_ID, closeSheet)) closeSheet();
    } else {
      closeSheet();
    }
  }, [closeDepth, closeSheet, isEditMode, tabKey]);

  const startEditing = () => {
    isClosingRef.current = false;
    setIsEditing(true);
  };

  const exitEditing = useCallback(() => {
    if (!closeDepth(tabKey, EDIT_DEPTH_ID)) backToView();
  }, [backToView, closeDepth, tabKey]);

  const handleDone = useCallback(
    (didChange: boolean) => {
      exitEditing();
      if (didChange) onChanged();
    },
    [exitEditing, onChanged],
  );

  return (
    <BottomSheet
      isOpen={isLayerOpen}
      isActive={tabKey === selectedTab}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) close();
      }}
      ariaLabel="참여자"
      layer={SHEET_LAYER}
    >
      {isEditMode ? (
        <ParticipantsEditForm
          key={session.id}
          tabKey={tabKey}
          session={session}
          participants={participants}
          lockedPlayerIds={lockedPlayerIds}
          onDone={handleDone}
          onCancel={exitEditing}
          onChanged={onChanged}
          onSavedParticipantsChange={setSavedParticipants}
        />
      ) : (
        <ParticipantsView
          session={session}
          participants={participants}
          lockedPlayerIds={lockedPlayerIds}
          onEdit={isReadOnly ? undefined : startEditing}
        />
      )}
    </BottomSheet>
  );
}
