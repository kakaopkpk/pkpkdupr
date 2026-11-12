import React, { useMemo, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { PkButton } from "@/components/ui/Button";
import { PlayerAvatar, type AvatarPlayer } from "@/components/ui/PlayerAvatar";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { cx } from "@/components/ui/cx";
import type { MemberListPlayerInfo } from "@/hooks/usePlayers";
import {
  addSlotPlayer,
  buildPickList,
  getSlotPlayerIds,
  getSlotTeams,
  removeSlotPlayer,
  type RecordSlots,
} from "./recordMatch.utils";
import { CheckIcon, FooterError } from "./RecordMatchParts";

export interface PickPlayersStepProps {
  slots: RecordSlots;
  onSlotsChange: (slots: RecordSlots) => void;
  players: MemberListPlayerInfo[];
  playersStatus: "loading" | "ready" | "error";
  /** 자리에 그릴 선수. 회원 목록에 없는 선수(불러오는 중 등)도 찾을 수 있게 셸이 모아 준다 */
  playerById: ReadonlyMap<string, AvatarPlayer>;
  participantIds: readonly string[];
  busyIds: ReadonlySet<string>;
  /**
   * session: 진행 중 세션의 새 경기. "경기 시작"·"점수 입력"
   * plain: 세션 없는 새 경기나 기존 경기의 선수 바꾸기. "취소"·"다음"
   */
  footerMode: "session" | "plain";
  isBusy: boolean;
  error: string | null;
  onCancel: () => void;
  onNext: () => void;
  onStartMatch: () => void;
}

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
  const pickedIds = useMemo(() => new Set(getSlotPlayerIds(slots)), [slots]);
  const isFull = pickedIds.size >= slots.length;
  const isTeamReady = !!getSlotTeams(slots);
  const list = useMemo(
    () => buildPickList(players, { query, participantIds, busyIds }),
    [busyIds, participantIds, players, query],
  );

  const togglePlayer = (playerId: string) => {
    onSlotsChange(
      pickedIds.has(playerId)
        ? removeSlotPlayer(slots, playerId)
        : addSlotPlayer(slots, playerId),
    );
  };

  const renderSlot = (index: number) => {
    const playerId = slots[index];
    if (!playerId) {
      return (
        <span key={index} className="flex w-16 flex-col items-center gap-1">
          <span className="size-10 rounded-full border-[1.5px] border-dashed border-[#c5ccda]" />
          <span className="text-pk-12 text-pk-muted">빈 자리</span>
        </span>
      );
    }

    const player = playerById.get(playerId) ?? { id: playerId, username: "…" };
    return (
      <button
        key={index}
        type="button"
        aria-label={`${player.username} 빼기`}
        onClick={() => onSlotsChange(removeSlotPlayer(slots, playerId))}
        className="flex w-16 flex-col items-center gap-1 text-pk-ink"
      >
        <span className="relative inline-flex">
          <PlayerAvatar player={player} size={40} />
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 size-[18px] rounded-full bg-white text-center text-pk-12 leading-[18px] text-pk-muted shadow-[0_0_0_1px_#dde2ec]"
          >
            ×
          </span>
        </span>
        <span className="max-w-16 truncate text-pk-12 font-bold">
          {player.username}
        </span>
      </button>
    );
  };

  return (
    <>
      <BottomSheet.Header>
        <SheetTitle title="선수 고르기" />
        <div className="flex items-center justify-between px-1 pt-3">
          <div className="flex gap-1">{[0, 1].map(renderSlot)}</div>
          <span className="pb-[18px] text-pk-12 font-bold text-pk-muted">
            vs
          </span>
          <div className="flex gap-1">{[2, 3].map(renderSlot)}</div>
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
              // 경기 중인 사람은 고를 수 없다. 이미 자리에 있으면 자리를 눌러 뺀다
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
