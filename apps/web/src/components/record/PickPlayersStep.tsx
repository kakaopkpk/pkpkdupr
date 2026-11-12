import React, { useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { PkButton } from "@/components/ui/Button";
import { PlayerAvatar, type AvatarPlayer } from "@/components/ui/PlayerAvatar";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { cx } from "@/components/ui/cx";
import type { MemberListPlayerInfo } from "@/hooks/usePlayers";
import {
  addSlotPlayer,
  buildPickList,
  getNextSlotIndex,
  getSlotPlayerIds,
  getSlotTeams,
  removeSlotPlayer,
  swapSlots,
  type RecordSlots,
} from "./recordMatch.utils";
import { CheckIcon, FooterError } from "./RecordMatchParts";

export interface PickPlayersStepProps {
  slots: RecordSlots;
  onSlotsChange: (slots: RecordSlots) => void;
  players: MemberListPlayerInfo[];
  playersStatus: "loading" | "ready" | "error";
  /** 자리에 그릴 플레이어. 회원 목록에 없는 플레이어(불러오는 중 등)도 찾을 수 있게 셸이 모아 준다 */
  playerById: ReadonlyMap<string, AvatarPlayer>;
  participantIds: readonly string[];
  busyIds: ReadonlySet<string>;
  /**
   * session: 진행 중 세션의 새 경기. "경기 시작"·"점수 입력"
   * plain: 세션 없는 새 경기나 기존 경기의 플레이어 바꾸기. "취소"·"다음"
   */
  footerMode: "session" | "plain";
  isBusy: boolean;
  error: string | null;
  onCancel: () => void;
  onNext: () => void;
  onStartMatch: () => void;
}

/** 자리 아바타를 감싸는 원(아바타 44px + 링 안쪽 여백 3px) */
const SLOT_CIRCLE_CLASS =
  "relative flex size-[50px] items-center justify-center rounded-full";

const CloseMarkIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
  >
    <path d="M7 7l10 10M17 7L7 17" />
  </svg>
);

export default function PickPlayersStep({
  slots,
  onSlotsChange,
  players,
  playersStatus,
  playerById,
  participantIds,
  busyIds,
  footerMode,
  isBusy,
  error,
  onCancel,
  onNext,
  onStartMatch,
}: PickPlayersStepProps): React.ReactElement {
  const [query, setQuery] = useState("");
  // 사용자가 누른 빈자리. 채워지면 다시 왼쪽부터 첫 빈자리가 다음 자리가 된다
  const [preferredIndex, setPreferredIndex] = useState<number | null>(null);
  const [rawSelectedIndex, setSelectedIndex] = useState<number | null>(null);
  const slotRowRef = useRef<HTMLDivElement>(null);
  // 목록에서 빼서 비게 된 자리는 선택으로 보지 않는다
  const selectedIndex =
    rawSelectedIndex !== null && slots[rawSelectedIndex] !== null
      ? rawSelectedIndex
      : null;
  const isSelecting = selectedIndex !== null;
  const nextIndex = getNextSlotIndex(slots, preferredIndex);
  const pickedIds = useMemo(() => new Set(getSlotPlayerIds(slots)), [slots]);
  const isFull = pickedIds.size >= slots.length;
  const slotTeams = getSlotTeams(slots);
  const isTeamReady = !!slotTeams;
  const list = useMemo(
    () => buildPickList(players, { query, participantIds, busyIds }),
    [busyIds, participantIds, players, query],
  );

  // 선택 중에 자리 줄 밖을 누르면 선택만 푼다
  useEffect(() => {
    if (!isSelecting) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        slotRowRef.current?.contains(event.target)
      ) {
        return;
      }
      setSelectedIndex(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isSelecting]);

  const togglePlayer = (playerId: string) => {
    onSlotsChange(
      pickedIds.has(playerId)
        ? removeSlotPlayer(slots, playerId)
        : addSlotPlayer(slots, playerId, preferredIndex),
    );
  };

  const handleSlotPress = (index: number) => {
    const playerId = slots[index];

    if (selectedIndex === null) {
      if (playerId) setSelectedIndex(index);
      else setPreferredIndex(index);
      return;
    }

    setSelectedIndex(null);
    if (selectedIndex === index) {
      if (playerId) onSlotsChange(removeSlotPlayer(slots, playerId));
      return;
    }
    onSlotsChange(swapSlots(slots, selectedIndex, index));
  };

  const renderSlot = (index: number) => {
    const playerId = slots[index];
    const player = playerId
      ? (playerById.get(playerId) ?? { id: playerId, username: "…" })
      : null;
    const isSelected = selectedIndex === index;
    const isTarget = isSelecting && !isSelected;

    let ariaLabel = `${index + 1}번 자리`;
    if (player) {
      ariaLabel = isSelected
        ? `${player.username} 빼기`
        : isTarget
          ? `${player.username}와 자리 바꾸기`
          : `${player.username} 선택`;
    } else if (isTarget) {
      ariaLabel = `${index + 1}번 자리로 옮기기`;
    }

    return (
      <button
        key={index}
        type="button"
        aria-label={ariaLabel}
        aria-pressed={player ? isSelected : undefined}
        onClick={() => handleSlotPress(index)}
        className="flex h-20 min-w-0 flex-col items-center gap-1 text-pk-ink"
      >
        {player ? (
          <>
            <span
              className={cx(
                SLOT_CIRCLE_CLASS,
                isSelected && "shadow-[inset_0_0_0_2px_var(--color-pk-primary)]",
                isTarget && "border-2 border-dashed border-pk-primary",
              )}
            >
              <PlayerAvatar player={player} size={44} />
              {isSelected ? (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-pk-ink/55 text-white"
                >
                  <CloseMarkIcon />
                </span>
              ) : null}
            </span>
            <span
              className={cx(
                "max-w-full truncate text-pk-12 font-bold",
                isSelected && "text-pk-primary",
              )}
            >
              {player.username}
            </span>
          </>
        ) : (
          <span
            className={cx(
              SLOT_CIRCLE_CLASS,
              "border-2",
              isTarget
                ? "border-dashed border-pk-primary bg-pk-primary-soft"
                : !isSelecting && index === nextIndex
                  ? "border-solid border-pk-primary"
                  : "border-dashed border-pk-muted",
            )}
          />
        )}
      </button>
    );
  };

  return (
    <>
      <BottomSheet.Header>
        <SheetTitle title="플레이어 선택" />
        <div
          ref={slotRowRef}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_30px_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 pt-3"
        >
          {[0, 1].map(renderSlot)}
          <span className="flex h-[50px] items-center justify-center text-pk-12 font-bold text-pk-muted">
            {/* 단식/복식 글자는 높이를 차지하지 않게 vs 위에 띄워 자리가 움직이지 않게 한다 */}
            <span className="relative">
              {slotTeams ? (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap text-pk-12 font-extrabold text-pk-ink">
                  {slotTeams[0].length === 1 ? "단식" : "복식"}
                </span>
              ) : null}
              vs
            </span>
          </span>
          {[2, 3].map(renderSlot)}
        </div>
        <label className="mt-3 flex h-11 items-center gap-2 rounded-pk-sm bg-pk-bg px-3.5 text-pk-muted">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="shrink-0"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            type="search"
            aria-label="이름 검색"
            placeholder="이름 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // 16px 미만이면 iOS가 포커스 때 화면을 확대한다
            className="app-mobile-input min-w-0 flex-1 bg-transparent text-[16px] text-pk-ink outline-none placeholder:text-pk-muted"
          />
        </label>
      </BottomSheet.Header>
      <BottomSheet.Body className="pb-2">
        {playersStatus === "error" && players.length === 0 ? (
          <p className="px-1 text-pk-13 font-bold text-pk-down" role="alert">
            회원 목록을 불러오지 못했어요.
          </p>
        ) : (
          <div className="grid shrink-0 grid-cols-2 gap-2 pt-0.5">
            {list.map((player) => {
              const isPicked = pickedIds.has(player.id);
              const isPlaying = busyIds.has(player.id);
              // 경기 중인 사람은 고를 수 없다. 이미 자리에 있으면 목록이나 자리를 눌러 뺀다
              const isDisabled = isPlaying || (!isPicked && isFull);

              return (
                <button
                  key={player.id}
                  type="button"
                  aria-pressed={isPicked}
                  disabled={isDisabled}
                  onClick={() => togglePlayer(player.id)}
                  className={cx(
                    "flex h-[52px] items-center gap-2.5 rounded-pk-sm px-2.5 text-left",
                    isPicked ? "bg-pk-primary-soft" : "bg-pk-bg",
                    isPlaying ? "text-pk-muted" : "text-pk-ink",
                  )}
                >
                  <PlayerAvatar player={player} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-pk-15 font-bold">
                      {player.username}
                    </span>
                    {isPlaying ? (
                      <span className="text-pk-12">경기 중</span>
                    ) : null}
                  </span>
                  {isPicked ? <CheckIcon className="text-pk-primary" /> : null}
                </button>
              );
            })}
          </div>
        )}
      </BottomSheet.Body>
      <BottomSheet.Footer className="-mx-4 border-t border-pk-divider px-4">
        <FooterError message={error} />
        {footerMode === "session" ? (
          <div className="grid grid-cols-2 gap-2">
            <PkButton
              variant="soft"
              size="lg"
              fullWidth
              disabled={!isTeamReady || isBusy}
              onClick={onStartMatch}
            >
              경기 시작
            </PkButton>
            <PkButton
              size="lg"
              fullWidth
              disabled={!isTeamReady || isBusy}
              onClick={onNext}
            >
              점수 입력
            </PkButton>
          </div>
        ) : (
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <PkButton variant="ghost" size="lg" onClick={onCancel}>
              취소
            </PkButton>
            <PkButton
              size="lg"
              fullWidth
              disabled={!isTeamReady}
              onClick={onNext}
            >
              다음
            </PkButton>
          </div>
        )}
      </BottomSheet.Footer>
    </>
  );
}
