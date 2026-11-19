import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Match } from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { isClientError } from "../../api/client";
import { deleteMatchAsAdmin } from "../../api/matches";
import { fetchSessionMatches } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { AddBracketMatchDialog } from "./AddBracketMatchDialog";
import { getLoadErrorMessage } from "./sessionErrors";
import { PanelStatus } from "./SessionPanelParts";

interface RoundGroup {
  /** null이면 라운드 없는 경기 묶음 */
  round: number | null;
  matches: Match[];
}

const toTime = (value: Date | string) => new Date(value).getTime();

/** 라운드 오름차순으로 묶고 라운드 없는 경기는 맨 끝. 묶음 안은 경기 시각·만든 순 */
const groupByRound = (matches: Match[]): RoundGroup[] => {
  const groups = new Map<number | null, Match[]>();
  for (const match of matches) {
    const round = match.round ?? null;
    groups.set(round, [...(groups.get(round) ?? []), match]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([round, items]) => ({
      round,
      matches: [...items].sort(
        (a, b) =>
          toTime(a.matchStartsAt) - toTime(b.matchStartsAt) ||
          toTime(a.createdAt) - toTime(b.createdAt),
      ),
    }));
};

const formatTeam = (team: Match["teams"][number]) =>
  team.players.map((player) => player.username).join(" · ");

const getStatusLabel = (match: Match): string => {
  switch (match.status) {
    case "scheduled":
      return "예정";
    case "created":
      return "진행 중";
    case "cancelled":
      return "취소됨";
    case "completed": {
      const score = match.scores?.[0];
      return score ? `완료 ${score.scoreA}:${score.scoreB}` : "완료";
    }
  }
};

/**
 * 오늘·미래 대회 세션의 대진 칸. 라운드별 경기를 보이고, 예정 경기를 만들고 지운다.
 * 진행 중·완료 경기는 여기서 지우지 않는다(경기 화면에서 정정).
 */
export const TournamentBracketSection: React.FC<{
  sessionId: string;
  players: AdminPlayer[];
  /** 세션 참여자 id. 대진 후보다 */
  participantIds: string[];
  /** 대진을 만들거나 지우면 세션(참여자·경기 수)을 다시 읽으려고 부른다 */
  onChanged: () => void;
}> = ({ sessionId, players, participantIds, onChanged }) => {
  const { showToast } = useToast();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Match | null>(null);

  useEffect(() => {
    let canceled = false;
    setLoadError(null);
    fetchSessionMatches(sessionId)
      .then((next) => {
        if (!canceled) setMatches(next);
      })
      .catch((err: unknown) => {
        if (!canceled) setLoadError(getLoadErrorMessage(err, "대진을 불러오지 못했어요."));
      });
    return () => {
      canceled = true;
    };
  }, [sessionId, reloadKey]);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
    onChanged();
  }, [onChanged]);

  const groups = useMemo(() => (matches ? groupByRound(matches) : []), [matches]);
  const maxRound = useMemo(
    () =>
      (matches ?? []).reduce((max, match) => Math.max(max, match.round ?? 0), 0) || 1,
    [matches],
  );

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMatchAsAdmin(deleting.id);
    } catch (err) {
      // 4xx는 확인 대화상자 안 문구로 보이고, 네트워크·5xx는 토스트로 알린 뒤 닫는다
      if (isClientError(err)) throw err;
      showToast(getLoadErrorMessage(err, "처리하지 못했어요. 다시 시도해 주세요."));
      return;
    }
    showToast("대진 경기를 지웠어요");
    reload();
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-pk-12 font-bold text-pk-muted">
          대진{matches ? ` ${matches.length}` : ""}
        </h3>
        <Button size="sm" variant="soft" onClick={() => setDialogOpen(true)}>
          + 대진 추가
        </Button>
      </div>

      {!matches ? (
        <PanelStatus>{loadError ?? "대진을 불러오는 중…"}</PanelStatus>
      ) : groups.length === 0 ? (
        <PanelStatus>아직 대진이 없어요. 라운드와 두 팀을 골라 예정 경기를 만들어요.</PanelStatus>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.round ?? "none"}>
              <h4 className="mb-1 text-pk-13 font-bold text-pk-ink">
                {group.round === null ? "그 밖의 경기" : `${group.round}라운드`}
              </h4>
              <ul className="divide-y divide-pk-divider">
                {group.matches.map((match) => (
                  <li key={match.id} className="flex min-h-11 items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 text-pk-15 text-pk-ink">
                      {formatTeam(match.teams[0])}
                      <span className="text-pk-muted"> vs </span>
                      {formatTeam(match.teams[1])}
                    </span>
                    <Chip className="tabular-nums">{getStatusLabel(match)}</Chip>
                    {match.status === "scheduled" && (
                      <Button size="sm" variant="outline" onClick={() => setDeleting(match)}>
                        삭제…
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <AddBracketMatchDialog
          sessionId={sessionId}
          players={players}
          participantIds={participantIds}
          defaultRound={maxRound}
          onClose={() => setDialogOpen(false)}
          onCreated={reload}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="대진 경기를 지울까요?"
        description={
          deleting
            ? `${formatTeam(deleting.teams[0])} vs ${formatTeam(deleting.teams[1])} 예정 경기를 지워요.`
            : undefined
        }
        confirmLabel="경기 삭제"
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
};
