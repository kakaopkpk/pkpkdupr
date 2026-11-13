import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { PkButton } from "@/components/ui/Button";
import { GuestLabel } from "@/components/ui/GuestLabel";
import { PersonAddIcon } from "@/components/ui/Icons";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SearchField } from "@/components/ui/SearchField";
import { SheetTitle } from "@/components/ui/SheetTitle";
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
import { getErrorMessage, isNetworkError } from "./saveError";

export interface ParticipantsSheetProps {
  isOpen: boolean;
  tabKey: TabKey;
  session: MatchSessionDetailInfo;
  /** 진행 중 경기에 든 선수. 잠긴 체크·"경기 중"으로 보이고 뺄 수 없다 */
  lockedPlayerIds?: readonly string[];
  onClose: () => void;
  /** "완료"로 참여자를 바꾼 뒤 호출 */
  onChanged: () => void;
}

const DEPTH_ID = "participants-sheet";
const SHEET_LAYER = 70;
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

type ParticipantRow = Pick<
  MemberListPlayerInfo,
  "id" | "username" | "avatarUrl" | "status" | "isGuest"
>;

/** 저장할 변경. 실패한 것만 남겨 다시 시도한다 */
interface ParticipantChange {
  playerId: string;
  action: "add" | "remove";
}

interface ParticipantsFormProps {
  session: MatchSessionDetailInfo;
  lockedPlayerIds: readonly string[];
  onDone: (didChange: boolean) => void;
  onChanged: () => void;
}

const ParticipantsForm: React.FC<ParticipantsFormProps> = ({
  session,
  lockedPlayerIds,
  onDone,
  onChanged,
}) => {
  const {
    players,
    status: playersStatus,
    reload: reloadPlayers,
  } = usePlayers();
  const { showSaveFailure } = useSystemNotice();
  const [query, setQuery] = useState("");
  // 열 때의 참여자. 저장에 성공한 변경만큼 따라 바뀐다
  const [savedIds, setSavedIds] = useState(
    () => new Set(session.participants.map((member) => member.id)),
  );
  const [selectedIds, setSelectedIds] = useState(() => new Set(savedIds));
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 이 시트에서 만든 게스트. 회원 목록을 다시 받기 전에도 목록에 보인다
  const [addedGuests, setAddedGuests] = useState<ParticipantRow[]>([]);
  // 정렬은 열 때의 참여자(와 새로 만든 게스트) 기준으로 고정해 체크를 바꿔도 행이 움직이지 않게 한다
  const [sortAnchorIds, setSortAnchorIds] = useState(() => savedIds);
  const lockedIds = useMemo(() => new Set(lockedPlayerIds), [lockedPlayerIds]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const playerIds = new Set(players.map((player) => player.id));
    const allRows: ParticipantRow[] = [
      ...players,
      ...addedGuests.filter((guest) => !playerIds.has(guest.id)),
    ];
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
        return rankA - rankB || a.username.localeCompare(b.username, "ko");
      });
  }, [addedGuests, players, query, sortAnchorIds]);

  const guestAddOption = getGuestAddOption({
    query,
    playersStatus,
    resultCount: rows.length,
  });

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
    const nextSavedIds = new Set(savedIds);
    let serverError: string | null = null;
    let networkError: unknown = null;

    for (const change of changes) {
      try {
        if (change.action === "add") {
          await addMatchSessionParticipant(session.id, change.playerId);
          nextSavedIds.add(change.playerId);
        } else {
          await removeMatchSessionParticipant(session.id, change.playerId);
          nextSavedIds.delete(change.playerId);
        }
      } catch (err) {
        if (isNetworkError(err)) {
          // 연결이 끊겼으면 나머지도 실패하므로 멈춘다
          networkError = err;
          break;
        }
        serverError ??= getErrorMessage(err, "참여자를 반영하지 못했어요.");
      }
    }

    setSavedIds(nextSavedIds);
    setIsSaving(false);
    const didApplyAny =
      nextSavedIds.size !== savedIds.size ||
      [...nextSavedIds].some((id) => !savedIds.has(id));

    if (!networkError && !serverError) {
      onDone(true);
      return;
    }
    // 일부라도 반영됐으면 화면이 서버 상태를 다시 읽게 한다
    if (didApplyAny) onChanged();
    if (serverError) setError(serverError);
    if (networkError) throw networkError;
  }, [lockedIds, onChanged, onDone, savedIds, selectedIds, session.id]);

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
        setSavedIds((current) => new Set(current).add(guest.id));
        setSelectedIds((current) => new Set(current).add(guest.id));
        void reloadPlayers();
        onChanged();
      } catch (err) {
        if (isNetworkError(err)) throw err;
        setError(getErrorMessage(err, "게스트를 추가하지 못했어요."));
      } finally {
        setIsAddingGuest(false);
      }
    },
    [onChanged, reloadPlayers, session.id],
  );

  const handleAddGuest = async (username: string) => {
    if (isSaving || isAddingGuest) return;
    try {
      await addGuest(username);
    } catch {
      showSaveFailure({ onRetry: () => addGuest(username) });
    }
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
          title="참여자"
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
        {guestAddOption ? (
          <div className="flex flex-col">
            <p className="py-4 text-center text-pk-13 text-pk-sub">
              회원 중에 ‘{guestAddOption.username}’가 없어요.
            </p>
            <button
              type="button"
              disabled={!guestAddOption.isValid || isAddingGuest || isSaving}
              onClick={() => void handleAddGuest(guestAddOption.username)}
              className="flex min-h-14 w-full items-center gap-3 px-1 text-left text-pk-primary active:opacity-70 disabled:active:opacity-100"
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
                  {isAddingGuest
                    ? "추가하는 중…"
                    : guestAddOption.isValid
                      ? "이 아이디로 게스트를 만들고 이 세션에 넣어요"
                      : GUEST_USERNAME_FORMAT_HINT}
                </span>
              </span>
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-pk-13 text-pk-muted">
            {playersStatus === "error"
              ? "회원 목록을 불러오지 못했어요."
              : playersStatus === "loading"
                ? "회원 목록을 불러오는 중…"
                : "검색 결과가 없어요."}
          </p>
        ) : (
          <ul aria-label="회원" className="flex flex-col">
            {rows.map((player) => {
              const isLocked = lockedIds.has(player.id);
              const isChecked = isLocked || selectedIds.has(player.id);
              const content = (
                <>
                  <PlayerAvatar player={player} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-baseline gap-1">
                      <span className="truncate text-pk-15 font-bold text-pk-ink">
                        {player.username}
                      </span>
                      {player.isGuest ? <GuestLabel /> : null}
                    </span>
                    {isLocked ? (
                      <span className="text-pk-12 text-pk-muted">경기 중</span>
                    ) : null}
                  </span>
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
      </BottomSheet.Body>
      <BottomSheet.Footer className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="px-1 text-pk-13 text-pk-down">
            {error}
          </p>
        ) : null}
        <PkButton
          size="lg"
          fullWidth
          disabled={isSaving || isAddingGuest}
          onClick={() => void handleDone()}
        >
          {isSaving ? "저장 중…" : "완료"}
        </PkButton>
      </BottomSheet.Footer>
    </>
  );
};

/** 세션 참여자 편집 시트. 오늘·미래 세션 모두 쓰고, 다른 회원도 대신 추가·삭제한다 */
export default function ParticipantsSheet({
  isOpen,
  tabKey,
  session,
  lockedPlayerIds = EMPTY_IDS,
  onClose,
  onChanged,
}: ParticipantsSheetProps): React.ReactElement {
  const { closeDepth, selectedTab } = useTabNavigation();
  // 열 때마다 올려서 선택을 세션의 현재 참여자로 초기화한다
  const [sheetKey, setSheetKey] = useState(0);
  const isLayerOpen = useLayerDepth({
    isOpen,
    tabKey,
    depthId: DEPTH_ID,
    kind: "bottom-sheet",
    onClose,
  });

  useEffect(() => {
    if (isOpen) setSheetKey((key) => key + 1);
  }, [isOpen]);

  const close = useCallback(
    (afterClose?: () => void) => {
      if (!closeDepth(tabKey, DEPTH_ID, afterClose)) {
        onClose();
        afterClose?.();
      }
    },
    [closeDepth, onClose, tabKey],
  );

  const handleDone = useCallback(
    (didChange: boolean) => close(didChange ? onChanged : undefined),
    [close, onChanged],
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
      <ParticipantsForm
        key={`${session.id}:${sheetKey}`}
        session={session}
        lockedPlayerIds={lockedPlayerIds}
        onDone={handleDone}
        onChanged={onChanged}
      />
    </BottomSheet>
  );
}
