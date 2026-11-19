import React, { useState } from "react";
import { isValidBracketRound } from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { isClientError } from "../../api/client";
import { createBracketMatch } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/InlineError";
import { TextInput } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import { MatchLineupEditor } from "../matches/MatchLineupEditor";
import {
  inferLineupMatchType,
  toRecordTeams,
  type MatchLineupValue,
} from "../matches/matchLineup";

const EMPTY_LINEUP: MatchLineupValue = { teams: [[], []], scores: ["", ""] };

/** 대회 세션에 대진 예정 경기 하나를 만드는 대화상자. 열 때마다 새로 마운트해 입력을 초기화한다 */
export const AddBracketMatchDialog: React.FC<{
  sessionId: string;
  /** 이름·게스트 여부를 찾을 회원 전체 */
  players: AdminPlayer[];
  /** 고를 수 있는 사람(세션 참여자) */
  participantIds: string[];
  defaultRound: number;
  onClose: () => void;
  onCreated: () => void;
}> = ({ sessionId, players, participantIds, defaultRound, onClose, onCreated }) => {
  const { showToast } = useToast();
  const [roundInput, setRoundInput] = useState(String(defaultRound));
  const [lineup, setLineup] = useState<MatchLineupValue>(EMPTY_LINEUP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const round = Number(roundInput.trim());
  const blockedReason =
    (roundInput.trim() && isValidBracketRound(round)
      ? null
      : "라운드는 1 이상 정수로 넣어 주세요.") ??
    (inferLineupMatchType(lineup) ? null : "두 팀 선수를 1:1 또는 2:2로 맞춰 주세요.");

  const handleSubmit = async () => {
    if (blockedReason) return;
    setSaving(true);
    setError(null);
    try {
      await createBracketMatch(sessionId, { round, teams: toRecordTeams(lineup) });
    } catch (err) {
      if (isClientError(err)) {
        setError(err.message);
      } else {
        showToast(err instanceof Error ? err.message : "대진을 만들지 못했어요.");
      }
      setSaving(false);
      return;
    }
    showToast(`${round}라운드 대진을 만들었어요`);
    onClose();
    onCreated();
  };

  return (
    <Dialog
      open
      title="대진 추가"
      width={560}
      onClose={onClose}
      dismissDisabled={saving}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            닫기
          </Button>
          <Button
            disabled={Boolean(blockedReason) || saving}
            onClick={() => void handleSubmit()}
          >
            {saving ? "만드는 중…" : "만들기"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block w-32 space-y-2">
          <span className="block text-pk-12 font-bold text-pk-muted">라운드</span>
          <TextInput
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={roundInput}
            disabled={saving}
            onChange={(event) => setRoundInput(event.target.value)}
            className="tabular-nums"
          />
        </label>
        <MatchLineupEditor
          value={lineup}
          onChange={setLineup}
          players={players}
          candidateIds={participantIds}
          hideScores
          disabled={saving}
        />
        {participantIds.length === 0 && (
          <p className="text-pk-13 text-pk-muted">
            세션 참여자가 없어요. 패널의 참여자 칸에서 먼저 넣어 주세요.
          </p>
        )}
        {blockedReason && (
          <p className="text-pk-13 font-semibold text-pk-sub">{blockedReason}</p>
        )}
        <InlineError message={error} />
      </div>
    </Dialog>
  );
};
