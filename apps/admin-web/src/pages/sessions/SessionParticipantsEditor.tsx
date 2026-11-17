import React, { useMemo, useState } from "react";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import type { MatchSessionDetail } from "@pkpkdupr/shared/session";
import { addSessionParticipant, removeSessionParticipant } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { InlineError } from "../../components/ui/InlineError";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { PlayerPicker } from "../../components/ui/PlayerPicker";
import { useToast } from "../../components/ui/Toast";
import { reportMutationError } from "./sessionErrors";

/**
 * 오늘·미래 세션 참여자를 한 명씩 더하고 뺀다(회원용 참여자 API).
 * 후보는 활성 회원·게스트이고, 이미 참여한 사람은 빠진다.
 */
export const SessionParticipantsEditor: React.FC<{
  detail: MatchSessionDetail;
  players: AdminPlayer[];
  onChanged: (detail: MatchSessionDetail) => void;
}> = ({ detail, players, onChanged }) => {
  const { showToast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () => players.filter((player) => player.status === "active"),
    [players],
  );
  const participantIds = useMemo(
    () => detail.participants.map((participant) => participant.id),
    [detail.participants],
  );

  // 요청이 겹치면 늦게 온 응답이 최신 참여자 목록을 덮으므로 한 번에 하나만 보낸다
  const run = async (action: () => Promise<MatchSessionDetail>) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      onChanged(await action());
    } catch (err) {
      reportMutationError(err, setError, showToast);
    } finally {
      setPending(false);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-pk-12 font-bold text-pk-muted">
          참여자 {detail.participants.length}
        </h3>
        <Button
          size="sm"
          variant="soft"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          {pickerOpen ? "닫기" : "+ 참여자 추가"}
        </Button>
      </div>

      {pickerOpen && (
        <div className="mb-3">
          <PlayerPicker
            players={candidates}
            excludeIds={participantIds}
            autoFocus
            onSelect={(playerId) =>
              void run(() => addSessionParticipant(detail.id, playerId))
            }
          />
        </div>
      )}

      {detail.participants.length === 0 ? (
        <p className="text-pk-13 text-pk-muted">아직 참여자가 없어요.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-busy={pending}>
            {detail.participants.map((participant) => (
              <li
                key={participant.id}
                className="group inline-flex h-8 items-center gap-1.5 rounded-full bg-pk-bg pl-1 pr-1.5 text-pk-13 font-semibold text-pk-ink"
              >
                <PlayerAvatar player={participant} size={24} />
                <span>
                  {participant.username}
                  {participant.isGuest && (
                    <span className="font-normal text-pk-muted"> · 게스트</span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`${participant.username} 빼기`}
                  disabled={pending}
                  onClick={() =>
                    void run(() => removeSessionParticipant(detail.id, participant.id))
                  }
                  // 마우스를 올리거나 키보드로 포커스하면 보인다
                  className="flex size-5 items-center justify-center rounded-full text-pk-12 text-pk-muted opacity-0 hover:bg-pk-neutral hover:text-pk-sub focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-pk-primary group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-pk-12 text-pk-muted">
            이름에 마우스를 올리면 빼기(✕)가 보여요.
          </p>
        </>
      )}

      <div className="mt-2">
        <InlineError message={error} />
      </div>
    </section>
  );
};
