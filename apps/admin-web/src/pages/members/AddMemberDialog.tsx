import React, { useEffect, useMemo, useState } from "react";
import { isValidUsername, normalizeUsername } from "@pkpkdupr/shared/auth";
import type { AdminPlayer, Player } from "@pkpkdupr/shared/player";
import { registerPlayer } from "../../api/players";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/InlineError";
import { TextInput } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import { USERNAME_HINT, reportActionError, type Gender } from "./memberModel";
import { FieldHint, GenderControl } from "./panelParts";

export const AddMemberDialog: React.FC<{
  open: boolean;
  players: AdminPlayer[];
  onClose: () => void;
  onAdded: (player: Player) => Promise<void>;
  onOpenGuest: (playerId: string) => void;
}> = ({ open, players, onClose, onAdded, onOpenGuest }) => {
  const { showToast } = useToast();
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUsername("");
      setGender("");
      setPending(false);
      setError(null);
    }
  }, [open]);

  const trimmed = username.trim();
  const formatValid = isValidUsername(trimmed);
  // 아이디는 대소문자를 구분하지 않으므로 정규화한 값으로 겹치는 회원을 찾는다
  const existing = useMemo(() => {
    if (!trimmed) return null;
    const key = normalizeUsername(trimmed);
    return players.find((player) => normalizeUsername(player.username) === key) ?? null;
  }, [players, trimmed]);

  const canSubmit = !pending && formatValid && gender !== "" && existing === null;

  const handleSubmit = async () => {
    if (!gender) return;
    setPending(true);
    setError(null);
    try {
      const { player } = await registerPlayer({ username: trimmed, gender });
      await onAdded(player);
    } catch (err) {
      reportActionError(err, setError, showToast);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="회원 추가"
      onClose={onClose}
      dismissDisabled={pending}
      footer={
        <>
          <Button variant="soft" disabled={pending} onClick={onClose}>
            취소
          </Button>
          <Button type="submit" form="add-member-form" disabled={!canSubmit}>
            {pending ? "추가하는 중…" : "추가"}
          </Button>
        </>
      }
    >
      <form
        id="add-member-form"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) void handleSubmit();
        }}
      >
        <div>
          <label htmlFor="add-member-username" className="mb-1.5 block text-pk-13 font-bold text-pk-ink">
            아이디
          </label>
          <TextInput
            id="add-member-username"
            value={username}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setUsername(event.target.value);
              setError(null);
            }}
          />
          {trimmed && !formatValid ? (
            <FieldHint>아이디 형식이 맞지 않아요. {USERNAME_HINT}</FieldHint>
          ) : existing && !existing.isGuest ? (
            <div className="mt-1.5">
              <InlineError message="이미 있는 아이디예요." />
            </div>
          ) : (
            <FieldHint>{USERNAME_HINT}</FieldHint>
          )}
        </div>

        {existing?.isGuest && (
          <div className="rounded-pk-sm border border-pk-primary-line bg-pk-primary-soft p-3.5 text-pk-13">
            <p className="font-bold text-pk-ink">같은 아이디의 게스트가 있어요</p>
            <p className="mt-1 text-pk-sub">
              {existing.username}는{" "}
              {existing.guestAddedInfo?.addedByUsername
                ? `${existing.guestAddedInfo.addedByUsername}가 추가한 게스트예요.`
                : "회원이 추가한 게스트예요."}{" "}
              새로 만들지 말고 정회원으로 승급하면 지난 기록이 이어져요.
            </p>
            <button
              type="button"
              onClick={() => onOpenGuest(existing.id)}
              className="mt-2 font-bold text-pk-primary hover:underline"
            >
              {existing.username} 승급하러 가기 ›
            </button>
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-pk-13 font-bold text-pk-ink">성별 (필수)</span>
          <GenderControl value={gender} onChange={setGender} />
        </div>

        <InlineError message={error} />
      </form>
    </Dialog>
  );
};
