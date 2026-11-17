import React, { useState } from "react";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import {
  DEFAULT_MATCH_LOCATION,
  kstDateKeyTimeToDate,
} from "@pkpkdupr/shared/session";
import { createAdminMatches } from "../../api/matches";
import { isClientError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/InlineError";
import { TextInput, textInputClassName } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import { MatchLineupEditor } from "./MatchLineupEditor";
import {
  inferLineupMatchType,
  toMatchScore,
  toRecordTeams,
  validateMatchLineup,
  type MatchLineupValue,
} from "./matchLineup";
import {
  parseKstDateTimeInputValue,
  toKstDateTimeInputValue,
} from "./matchView";
import type { SessionOption } from "./sessionOptions";

const NO_SESSION_VALUE = "";
const EMPTY_LINEUP: MatchLineupValue = { teams: [[], []], scores: ["", ""] };

const FieldLabel: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label className="block space-y-2">
    <span className="block text-pk-12 font-bold text-pk-muted">{label}</span>
    {children}
  </label>
);

/** 관리자가 경기 한 개를 넣는 대화상자. 열 때마다 새로 마운트해 입력을 초기화한다 */
export const AddMatchDialog: React.FC<{
  players: AdminPlayer[];
  sessionOptions: SessionOption[];
  onClose: () => void;
  /** 넣은 뒤 목록을 다시 읽는다 */
  onCreated: () => void;
}> = ({ players, sessionOptions, onClose, onCreated }) => {
  const { showToast } = useToast();
  const [sessionId, setSessionId] = useState(NO_SESSION_VALUE);
  const [startsAtInput, setStartsAtInput] = useState(() =>
    toKstDateTimeInputValue(new Date()),
  );
  const [location, setLocation] = useState(DEFAULT_MATCH_LOCATION);
  const [lineup, setLineup] = useState<MatchLineupValue>(EMPTY_LINEUP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSessionChange = (nextId: string) => {
    setSessionId(nextId);
    const session = sessionOptions.find((option) => option.id === nextId);
    setLocation(session?.location || DEFAULT_MATCH_LOCATION);
    if (!session) return;
    // 세션 시작 시각이 있으면 그 시각으로, 없으면 날짜만 세션 날짜로 바꾼다
    setStartsAtInput((current) =>
      session.startTime
        ? toKstDateTimeInputValue(kstDateKeyTimeToDate(session.dateKey, session.startTime))
        : `${session.dateKey}T${current.slice(11) || "00:00"}`,
    );
  };

  const parsedStartsAt = parseKstDateTimeInputValue(startsAtInput);
  const matchType = inferLineupMatchType(lineup);
  const blockedReason =
    validateMatchLineup(lineup) ??
    (parsedStartsAt ? null : "경기 시각을 넣어 주세요.") ??
    (location.trim() ? null : "장소를 넣어 주세요.");

  const handleSubmit = async () => {
    if (blockedReason || !parsedStartsAt || !matchType) return;
    setSaving(true);
    setError(null);
    try {
      await createAdminMatches({
        ...(sessionId !== NO_SESSION_VALUE && { sessionId }),
        matches: [
          {
            type: matchType,
            teams: toRecordTeams(lineup),
            location: location.trim(),
            matchStartsAt: parsedStartsAt.toISOString(),
            scores: [toMatchScore(lineup)],
          },
        ],
      });
    } catch (err) {
      if (isClientError(err)) {
        setError(err.message);
      } else {
        showToast(err instanceof Error ? err.message : "경기를 넣지 못했어요.");
      }
      setSaving(false);
      return;
    }
    showToast("경기를 넣었어요");
    onClose();
    onCreated();
  };

  return (
    <Dialog
      open
      title="경기 넣기"
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
            {saving ? "넣는 중…" : "넣기"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldLabel label="세션">
          <select
            value={sessionId}
            disabled={saving}
            onChange={(event) => handleSessionChange(event.target.value)}
            className={textInputClassName}
          >
            <option value={NO_SESSION_VALUE}>세션 없음</option>
            {sessionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldLabel>
        <div className="flex gap-3">
          <div className="flex-1">
            <FieldLabel label="경기 시각">
              <input
                type="datetime-local"
                value={startsAtInput}
                disabled={saving}
                onChange={(event) => setStartsAtInput(event.target.value)}
                className={textInputClassName}
              />
            </FieldLabel>
          </div>
          <div className="flex-1">
            <FieldLabel label="장소">
              <TextInput
                value={location}
                disabled={saving}
                onChange={(event) => setLocation(event.target.value)}
              />
            </FieldLabel>
          </div>
        </div>
        <MatchLineupEditor
          value={lineup}
          onChange={setLineup}
          players={players}
          disabled={saving}
        />
        {blockedReason && (
          <p className="text-pk-13 font-semibold text-pk-sub">{blockedReason}</p>
        )}
        <InlineError message={error} />
      </div>
    </Dialog>
  );
};
