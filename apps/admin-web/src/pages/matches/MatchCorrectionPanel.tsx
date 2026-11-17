import React, { useMemo, useState } from "react";
import {
  resolveRatingExcludedAfterEdit,
  type ManagedMatchSession,
  type Match,
  type RecordMatchRequest,
} from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { deleteMatchAsAdmin, updateMatch } from "../../api/matches";
import { isClientError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DetailPanel, PanelSection } from "../../components/ui/DetailPanel";
import { InlineError } from "../../components/ui/InlineError";
import { textInputClassName } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import { formatKstDateTime, formatKstMonthDay } from "../../lib/format";
import { MatchLineupEditor } from "./MatchLineupEditor";
import {
  isSameLineupScores,
  toMatchScore,
  toRecordTeams,
  validateMatchLineup,
  type MatchLineupValue,
} from "./matchLineup";
import {
  buildPlayerLookup,
  lookupUsername,
  parseKstDateTimeInputValue,
  toDate,
  toKstDateTimeInputValue,
  type PlayerLookup,
} from "./matchView";

const NO_SESSION_VALUE = "";
const CONFLICT_MESSAGE = "다른 사람이 먼저 고쳤어요. 새로 불러올까요?";

const toLineupValue = (match: Match): MatchLineupValue => {
  const score = match.scores?.[0];
  return {
    teams: [
      match.teams[0].players.map((player) => player.id),
      match.teams[1].players.map((player) => player.id),
    ],
    scores: score ? [String(score.scoreA), String(score.scoreB)] : ["", ""],
  };
};

const formatScores = (scores: MatchLineupValue["scores"]) =>
  scores.every((score) => score.trim() === "")
    ? "없음"
    : scores.map((score) => score.trim() || "–").join(" : ");

const formatRatingReflection = (ratingExcluded: boolean) =>
  ratingExcluded ? "미반영" : "반영";

/** 팀 선수 바뀜 문구. 같은 선수 구성이면(순서만 다르면) null */
const describeTeamChange = (
  teamIndex: number,
  before: readonly string[],
  after: readonly string[],
  lookup: PlayerLookup,
): string | null => {
  const removed = before.filter((id) => !after.includes(id));
  const added = after.filter((id) => !before.includes(id));
  if (!removed.length && !added.length) return null;
  const names = (ids: string[]) =>
    ids.map((id) => lookupUsername(lookup, id)).join(" · ");
  const label = `팀 ${teamIndex + 1}`;
  if (!added.length) return `${label} ${names(removed)} 빠짐`;
  if (!removed.length) return `${label} ${names(added)} 추가`;
  return `${label} ${names(removed)} → ${names(added)}`;
};

/**
 * 경기 정정 패널. 부모는 key에 경기 id와 updatedAt을 넣어, 새로 불러온 값이 오면 입력을 초기화한다.
 * 저장 때 보내는 expectedUpdatedAt은 패널을 연(마운트한) 시점의 updatedAt이다.
 */
export const MatchCorrectionPanel: React.FC<{
  match: Match;
  players: AdminPlayer[];
  sessions: ManagedMatchSession[];
  onClose: () => void;
  /** 저장·삭제 뒤나 충돌 때 목록을 다시 읽는다 */
  onReload: () => Promise<void>;
  onDeleted: () => void;
}> = ({ match, players, sessions, onClose, onReload, onDeleted }) => {
  const { showToast } = useToast();
  const original = useMemo(() => toLineupValue(match), [match]);
  const originalSessionId = match.session?.id ?? NO_SESSION_VALUE;
  const originalStartsAtInput = toKstDateTimeInputValue(match.matchStartsAt);

  const [lineup, setLineup] = useState<MatchLineupValue>(original);
  const [sessionId, setSessionId] = useState(originalSessionId);
  const [startsAtInput, setStartsAtInput] = useState(originalStartsAtInput);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isCancelled = match.status === "cancelled";
  const lookup = useMemo(() => buildPlayerLookup(players, [match]), [players, match]);
  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  // 날짜 내림차순. 지금 세션이 목록에 없으면(드묾) 경기의 세션 정보로 채운다
  const sessionOptions = useMemo(() => {
    const options = sessions.map((session) => ({
      id: session.id,
      name: session.name,
      date: toDate(session.date),
    }));
    if (match.session && !options.some((option) => option.id === match.session?.id)) {
      options.push({
        id: match.session.id,
        name: match.session.name ?? "이름 없는 세션",
        date: toDate(match.session.date),
      });
    }
    return options.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sessions, match.session]);

  const sessionName = (id: string) =>
    id === NO_SESSION_VALUE
      ? "세션 없음"
      : (sessionOptions.find((option) => option.id === id)?.name ?? "이름 없는 세션");

  const parsedStartsAt = parseKstDateTimeInputValue(startsAtInput);
  const sessionChanged = sessionId !== originalSessionId;
  const startsAtChanged = startsAtInput !== originalStartsAtInput;
  const teamChanges = [0, 1]
    .map((teamIndex) =>
      describeTeamChange(
        teamIndex,
        original.teams[teamIndex],
        lineup.teams[teamIndex],
        lookup,
      ),
    )
    .filter((change): change is string => change !== null);
  const scoresChanged = !isSameLineupScores(lineup.scores, original.scores);
  const hasChanges =
    sessionChanged || startsAtChanged || teamChanges.length > 0 || scoresChanged;

  const blockedReason = isCancelled
    ? null
    : (validateMatchLineup(lineup, original) ??
      (parsedStartsAt ? null : "경기 시각을 넣어 주세요.") ??
      (hasChanges ? null : "바뀐 내용이 없어요."));

  const ratingExcludedBefore = match.ratingExcluded;
  const ratingExcludedAfter = resolveRatingExcludedAfterEdit(
    match,
    lineup.teams.map((team) => ({
      players: team.map((id) => ({ isGuest: playersById.get(id)?.isGuest ?? false })),
    })),
  );

  const changeLines = [
    ...teamChanges,
    scoresChanged &&
      `점수 ${formatScores(original.scores)} → ${formatScores(lineup.scores)}`,
    sessionChanged &&
      `세션 ${sessionName(originalSessionId)} → ${sessionName(sessionId)}`,
    startsAtChanged &&
      parsedStartsAt &&
      `경기 시각 ${formatKstDateTime(match.matchStartsAt)} → ${formatKstDateTime(parsedStartsAt)}`,
  ].filter((line): line is string => Boolean(line));

  const subtitle = [
    `기록 ${lookupUsername(lookup, match.creatorPlayerId)}`,
    formatKstDateTime(match.createdAt),
    match.resultSubmittedByPlayerId &&
      `마지막 수정 ${lookupUsername(lookup, match.resultSubmittedByPlayerId)}${
        match.resultSubmittedAt ? ` ${formatKstDateTime(match.resultSubmittedAt)}` : ""
      }`,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleSave = async () => {
    if (blockedReason || isCancelled || !parsedStartsAt) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    const body: RecordMatchRequest = {
      name: match.name,
      teams: toRecordTeams(lineup),
      location: match.location,
      scores: [toMatchScore(lineup)],
      expectedUpdatedAt: toDate(match.updatedAt).toISOString(),
      ...(sessionChanged && { sessionId: sessionId || null }),
      ...(startsAtChanged && { matchStartsAt: parsedStartsAt.toISOString() }),
    };
    try {
      await updateMatch(match.id, body);
      showToast("경기를 고쳤어요");
      // 다시 읽으면 updatedAt이 바뀌어 패널이 새 값으로 다시 열린다
      await onReload();
    } catch (err) {
      if (isClientError(err) && err.status === 409) {
        setConflict(true);
      } else if (isClientError(err)) {
        setError(err.message);
      } else {
        showToast(err instanceof Error ? err.message : "경기를 고치지 못했어요.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "경기를 불러오지 못했어요.");
    } finally {
      setReloading(false);
    }
  };

  const inputsDisabled = isCancelled || saving;

  return (
    <DetailPanel title="경기 정정" subtitle={subtitle} onClose={onClose}>
      {isCancelled && (
        <p className="text-pk-13 font-semibold text-pk-sub">취소된 경기는 고칠 수 없어요.</p>
      )}

      <PanelSection title="세션">
        <select
          aria-label="세션"
          value={sessionId}
          disabled={inputsDisabled}
          onChange={(event) => setSessionId(event.target.value)}
          className={textInputClassName}
        >
          <option value={NO_SESSION_VALUE}>세션 없음</option>
          {sessionOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {formatKstMonthDay(option.date)} {option.name}
            </option>
          ))}
        </select>
      </PanelSection>

      <PanelSection title="경기 시각">
        <input
          type="datetime-local"
          aria-label="경기 시각"
          value={startsAtInput}
          disabled={inputsDisabled}
          onChange={(event) => setStartsAtInput(event.target.value)}
          className={textInputClassName}
        />
      </PanelSection>

      <PanelSection title="선수와 점수">
        <MatchLineupEditor
          value={lineup}
          onChange={setLineup}
          players={players}
          disabled={inputsDisabled}
        />
        <p className="mt-3 text-pk-12 text-pk-muted">
          점수를 바꾸면 이긴 쪽 점수만 진하게 보여요. 15점을 넘거나 동점이면 저장할 수 없어요.
        </p>
      </PanelSection>

      {!isCancelled && hasChanges && (
        <PanelSection title="바뀌는 내용">
          <div className="space-y-1 rounded-pk-sm bg-pk-bg p-3.5 text-pk-13 text-pk-ink">
            {changeLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>
              평점 반영: {formatRatingReflection(ratingExcludedBefore)} →{" "}
              {formatRatingReflection(ratingExcludedAfter)}
            </p>
            {(match.status === "completed" || sessionChanged) && (
              <p className="pt-1 text-pk-sub">
                {[
                  match.status === "completed" && "저장하면 평점을 처음부터 다시 계산해요.",
                  sessionChanged && "세션을 옮기면 두 세션의 리포트·세션 업적도 바뀌어요.",
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            )}
          </div>
        </PanelSection>
      )}

      {blockedReason && (
        <p className="text-pk-13 font-semibold text-pk-sub">{blockedReason}</p>
      )}
      {conflict && (
        <InlineError
          message={CONFLICT_MESSAGE}
          action={
            <Button
              size="sm"
              variant="soft"
              disabled={reloading}
              onClick={() => void handleReload()}
            >
              {reloading ? "불러오는 중…" : "새로 불러오기"}
            </Button>
          }
        />
      )}
      <InlineError message={error} />

      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => setConfirmingDelete(true)}
        >
          경기 삭제…
        </Button>
        {!isCancelled && (
          <Button
            disabled={Boolean(blockedReason) || saving || conflict}
            onClick={() => void handleSave()}
          >
            {saving ? "저장 중…" : "저장"}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="이 경기를 지울까요?"
        description="완료 경기면 평점을 처음부터 다시 계산해요. 지운 경기는 되살리지 않아요."
        confirmLabel="지우기"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await deleteMatchAsAdmin(match.id);
          onDeleted();
        }}
      />
    </DetailPanel>
  );
};
