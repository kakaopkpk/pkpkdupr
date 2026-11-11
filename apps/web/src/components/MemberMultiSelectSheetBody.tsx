import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { IoSearch } from "react-icons/io5";
import type { Player } from "@pkpkdupr/shared/player";
import UserChip from "@/components/UserChip";
import { apiFetch } from "@/lib/api";
import BottomSheet from "./BottomSheet";
import BottomSheetSection from "./BottomSheetSection";

type SelectablePlayer = Pick<
  Player,
  "id" | "username" | "avatarUrl" | "gender" | "status"
>;

interface MemberMultiSelectSheetBodyProps {
  title: string;
  initialSelectedIds: string[];
  currentPlayerId?: string;
  isOnline?: boolean;
  /** 선택이 처음과 같으면 저장 버튼이 비활성이다 */
  onSave: (selectedIds: string[]) => Promise<void>;
  onCancel: () => void;
}

const MemberMultiSelectSheetBody: React.FC<MemberMultiSelectSheetBodyProps> = ({
  title,
  initialSelectedIds,
  currentPlayerId,
  isOnline = true,
  onSave,
  onCancel,
}) => {
  const [players, setPlayers] = useState<SelectablePlayer[]>([]);
  const [isPlayersLoading, setIsPlayersLoading] = useState(true);
  const [isPlayersError, setIsPlayersError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(initialSelectedIds),
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadPlayers = async () => {
      try {
        const res = await apiFetch("/api/players");
        if (!res.ok) throw new Error("players request failed");

        const data = (await res.json()) as SelectablePlayer[];
        if (!isCancelled) {
          setPlayers(data.filter((player) => player.status === "active"));
          setIsPlayersError(false);
        }
      } catch {
        if (!isCancelled) setIsPlayersError(true);
      } finally {
        if (!isCancelled) setIsPlayersLoading(false);
      }
    };

    void loadPlayers();

    return () => {
      isCancelled = true;
    };
  }, []);

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const candidates = normalizedQuery
      ? players.filter((player) =>
          player.username.toLocaleLowerCase().includes(normalizedQuery),
        )
      : players;

    return [...candidates].sort((a, b) =>
      a.username.localeCompare(b.username, "ko"),
    );
  }, [players, query]);

  const isChanged = useMemo(() => {
    if (selectedIds.size !== initialSelectedIds.length) return true;
    return initialSelectedIds.some((id) => !selectedIds.has(id));
  }, [initialSelectedIds, selectedIds]);

  const toggle = (playerId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!isChanged || !isOnline || isSaving) return;

    setIsSaving(true);
    try {
      await onSave([...selectedIds]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <BottomSheet.Header>
        <h2 className="bs-text-head text-left text-pkpk-main-font">{title}</h2>
      </BottomSheet.Header>
      <BottomSheet.Body className="min-w-0 pb-4">
        <BottomSheetSection>
          <div className="flex items-center justify-between">
            <p className="bs-text-title text-pkpk-sub-font">멤버</p>
            <span className="bs-text-caption text-pkpk-detail-font">
              {selectedIds.size}명 선택
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
          ) : isPlayersLoading ? (
            <p className="bs-text-caption text-pkpk-detail-font">
              멤버 목록을 불러오는 중…
            </p>
          ) : filteredPlayers.length === 0 ? (
            <p className="bs-text-caption text-pkpk-detail-font">
              검색 결과가 없어요.
            </p>
          ) : (
            <div
              role="group"
              aria-label="멤버 선택"
              className="flex max-h-[45vh] flex-wrap gap-x-2 gap-y-2.5 overflow-y-auto px-1 pt-2 pb-1"
            >
              {filteredPlayers.map((player) => {
                const isSelected = selectedIds.has(player.id);

                return (
                  <div
                    key={player.id}
                    className={isSelected ? "" : "opacity-60"}
                  >
                    <UserChip
                      player={player}
                      isMe={player.id === currentPlayerId}
                      isPressable
                      isSelected={isSelected}
                      isDisabled={isSaving}
                      onPress={() => toggle(player.id)}
                      chipWidthClass="w-[6.6rem]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </BottomSheetSection>

        <div className="grid w-full grid-cols-3 gap-2">
          <Button
            className="app-action-button w-full rounded-2xl bg-red-50 py-3 text-base font-semibold text-red-500"
            isDisabled={isSaving}
            onPress={onCancel}
          >
            취소
          </Button>
          <Button
            className="app-action-button col-span-2 w-full rounded-2xl bg-[#409eff] py-3 text-base font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
            isDisabled={!isChanged || !isOnline || isSaving}
            onPress={() => void handleSave()}
          >
            {!isOnline ? "온라인 연결 필요" : isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </BottomSheet.Body>
    </>
  );
};

export default MemberMultiSelectSheetBody;
