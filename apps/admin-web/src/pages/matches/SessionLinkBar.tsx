import React, { useEffect, useMemo, useState } from "react";
import type { Match } from "@pkpkdupr/shared/match";
import { linkMatchesToSession } from "../../api/matches";
import { isClientError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { InlineError } from "../../components/ui/InlineError";
import { textInputClassName } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import { matchKstDateKey } from "./matchView";
import type { SessionOption } from "./sessionOptions";

/** 고른 경기가 모두 같은 날짜이고 그날 세션이 하나면 그 세션 id */
const findDefaultSessionId = (
  selectedMatches: readonly Match[],
  sessionOptions: readonly SessionOption[],
): string | null => {
  const dateKeys = new Set(selectedMatches.map(matchKstDateKey));
  if (dateKeys.size !== 1) return null;
  const [dateKey] = dateKeys;
  const sameDay = sessionOptions.filter((option) => option.dateKey === dateKey);
  return sameDay.length === 1 ? sameDay[0].id : null;
};

/** 세션 없는 경기를 골라 세션에 붙이는 막대 */
export const SessionLinkBar: React.FC<{
  selectedMatches: Match[];
  sessionOptions: SessionOption[];
  /** 연결이 끝나면 선택을 비우고 목록을 다시 읽는다 */
  onLinked: () => void;
}> = ({ selectedMatches, sessionOptions, onLinked }) => {
  const { showToast } = useToast();
  // null이면 아직 직접 고르지 않아 기본값을 따른다
  const [chosenSessionId, setChosenSessionId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = selectedMatches.length;
  useEffect(() => {
    if (selectedCount === 0) setChosenSessionId(null);
    setError(null);
  }, [selectedCount]);

  const defaultSessionId = useMemo(
    () =>
      selectedCount > 0 ? findDefaultSessionId(selectedMatches, sessionOptions) : null,
    [selectedMatches, selectedCount, sessionOptions],
  );
  const sessionId = chosenSessionId ?? defaultSessionId ?? "";
  const session = sessionOptions.find((option) => option.id === sessionId);

  const handleLink = async () => {
    if (!session || selectedCount === 0) return;
    setLinking(true);
    setError(null);
    try {
      await linkMatchesToSession(
        selectedMatches.map((match) => match.id),
        session.id,
      );
    } catch (err) {
      if (isClientError(err)) {
        setError(err.message);
      } else {
        showToast(err instanceof Error ? err.message : "세션에 연결하지 못했어요.");
      }
      setLinking(false);
      return;
    }
    setLinking(false);
    showToast(`${selectedCount}경기를 ${session.name}에 연결했어요`);
    onLinked();
  };

  return (
    <div className="mb-5 space-y-2 rounded-pk-lg bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-pk-13 text-pk-sub">
          시트로 넣었거나 세션 없이 기록한 경기를 골라 한 번에 세션에 붙여요
        </p>
        <span className="text-pk-13 font-bold text-pk-ink">{selectedCount}경기 선택</span>
        <select
          aria-label="연결할 세션"
          value={sessionId}
          disabled={linking}
          onChange={(event) => setChosenSessionId(event.target.value)}
          className={cx(textInputClassName, "w-64 cursor-pointer")}
        >
          <option value="">세션 고르기</option>
          {sessionOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          disabled={!session || selectedCount === 0 || linking}
          onClick={() => void handleLink()}
        >
          {linking ? "연결 중…" : "세션에 연결"}
        </Button>
      </div>
      <InlineError message={error} />
    </div>
  );
};
