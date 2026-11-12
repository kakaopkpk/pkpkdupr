import React, { useState } from "react";
import { PLAYER_STATUS_MESSAGE_MAX_LENGTH } from "@pkpkdupr/shared/player";
import BottomSheet from "@/components/BottomSheet";
import { PkButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Form";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { StatusMessageChip } from "@/components/ui/StatusMessageChip";
import type { PlayerInfo } from "@/context/AuthContext";
import {
  STATUS_MESSAGE_PALETTE,
  type StatusMessageColorKey,
  resolveStatusMessageColor,
} from "@/lib/statusMessagePalette";

export interface StatusEditInput {
  statusMessage: string | null;
  statusMessageBackgroundColor: string;
}

interface StatusEditSheetBodyProps {
  player: PlayerInfo;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (input: StatusEditInput) => void;
}

/** 상태메시지와 9색 배경 편집. 저장값은 고른 팔레트 항목의 bg hex다 */
export const StatusEditSheetBody: React.FC<StatusEditSheetBodyProps> = ({
  player,
  isSaving,
  error,
  onCancel,
  onSave,
}) => {
  const [statusMessage, setStatusMessage] = useState(
    player.statusMessage ?? "",
  );
  const [colorKey, setColorKey] = useState<StatusMessageColorKey>(
    () => resolveStatusMessageColor(player.statusMessageBackgroundColor).key,
  );
  const selected =
    STATUS_MESSAGE_PALETTE.find((entry) => entry.key === colorKey) ??
    STATUS_MESSAGE_PALETTE[0];
  const trimmed = statusMessage.trim();
  const username = player.username ?? "";

  return (
    <>
      <BottomSheet.Header>
        <SheetTitle title="상태메시지" />
      </BottomSheet.Header>
      <BottomSheet.Body>
        <TextField
          label="상태메시지"
          value={statusMessage}
          maxLength={PLAYER_STATUS_MESSAGE_MAX_LENGTH}
          disabled={isSaving}
          onChange={(event) => setStatusMessage(event.target.value)}
        />

        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-pk-13 font-bold text-pk-sub">배경색</span>
          <div
            role="radiogroup"
            aria-label="배경색"
            // 시트 좌우 여백까지 스크롤하고, 오른쪽 끝을 흐려 더 있다는 것을 보인다
            className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent_100%)] [&::-webkit-scrollbar]:hidden"
          >
            {STATUS_MESSAGE_PALETTE.map((entry) => {
              const isSelected = entry.key === colorKey;
              return (
                <button
                  key={entry.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isSaving}
                  onClick={() => setColorKey(entry.key)}
                  className="h-11 w-14 shrink-0 rounded-pk-sm text-pk-12 font-bold"
                  style={{
                    backgroundColor: entry.bg,
                    color: entry.fg,
                    boxShadow: isSelected
                      ? `inset 0 0 0 2px ${entry.fg}`
                      : undefined,
                  }}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-pk-13 font-bold text-pk-sub">미리보기</span>
          <div className="flex min-w-0 items-center gap-2.5 rounded-pk-sm bg-pk-bg p-3">
            <PlayerAvatar
              player={{ id: player.id, username, avatarUrl: player.avatarUrl }}
              size={36}
            />
            <span className="shrink-0 text-pk-15 font-extrabold text-pk-ink">
              {username}
            </span>
            {trimmed ? (
              <span className="flex min-w-0">
                <StatusMessageChip message={trimmed} color={selected.bg} />
              </span>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-pk-13 font-bold text-pk-down">
            {error}
          </p>
        ) : null}
      </BottomSheet.Body>
      <BottomSheet.Footer className="flex items-center gap-2">
        <PkButton
          variant="ghost"
          size="lg"
          disabled={isSaving}
          onClick={onCancel}
        >
          취소
        </PkButton>
        <PkButton
          size="lg"
          className="flex-1"
          disabled={isSaving}
          onClick={() =>
            onSave({
              statusMessage: trimmed || null,
              statusMessageBackgroundColor: selected.bg,
            })
          }
        >
          {isSaving ? "저장 중..." : "저장"}
        </PkButton>
      </BottomSheet.Footer>
    </>
  );
};
