import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { PkButton } from "@/components/ui/Button";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { cx } from "@/components/ui/cx";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { usePlayers } from "@/hooks/usePlayers";
import {
  addMatchSessionParticipant,
  type MatchSessionDetailInfo,
  removeMatchSessionParticipant,
} from "@/lib/matchSessions";
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

const SearchIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);

/** 22px 원형 체크. 참여자는 블루, 잠긴 참여자는 회색, 비참여는 빈 원 */
const CheckMark: React.FC<{ isChecked: boolean; isLocked: boolean }> = ({
  isChecked,
  isLocked,
}) =>
  isChecked ? (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full",
        isLocked ? "bg-pk-quiet" : "bg-pk-primary",
      )}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
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
  const { players, status: playersStatus } = usePlayers();
  const { showSaveFailure } = useSystemNotice();
  const [query, setQuery] = useState("");
  // 열 때의 참여자. 저장에 성공한 변경만큼 따라 바뀐다
  const [savedIds, setSavedIds] = useState(
    () => new Set(session.participants.map((member) => member.id)),
  );
  const [selectedIds, setSelectedIds] = useState(() => new Set(savedIds));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 정렬은 열 때의 참여자 기준으로 고정해 체크를 바꿔도 행이 움직이지 않게 한다
  const [initialIds] = useState(() => savedIds);
  const lockedIds = useMemo(() => new Set(lockedPlayerIds), [lockedPlayerIds]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return players
      .filter((player) => player.status === "active")
      .filter(
        (player) =>
          !normalizedQuery ||
          player.username.toLocaleLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => {
        const rankA = initialIds.has(a.id) ? 0 : 1;
        const rankB = initialIds.has(b.id) ? 0 : 1;
        return rankA - rankB || a.username.localeCompare(b.username, "ko");
      });
  }, [initialIds, players, query]);

  const toggle = (playerId: string) => {
    if (lockedIds.has(playerId) || isSaving) return;
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

  const handleDone = async () => {
    if (isSaving) return;
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
        <label className="flex h-11 items-center gap-2 rounded-pk-sm bg-pk-bg px-3.5 text-pk-muted">
          <SearchIcon />
          <input
            type="search"
            aria-label="이름 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름 검색"
            // 16px 미만이면 iOS가 포커스 때 화면을 확대한다
            className="min-w-0 flex-1 bg-transparent text-[16px] text-pk-ink outline-none placeholder:text-pk-muted"
          />
        </label>
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0 gap-0 overflow-y-auto">
        {rows.length === 0 ? (
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
                    <span className="truncate text-pk-15 font-bold text-pk-ink">
                      {player.username}
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
                      disabled={isSaving}
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
          disabled={isSaving}
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
