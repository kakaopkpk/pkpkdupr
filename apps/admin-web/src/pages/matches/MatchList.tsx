import React, { useMemo } from "react";
import {
  getWinningTeamIndex,
  isSinglesMatchType,
  isWithinMatchEditWindow,
  type Match,
  type Team,
} from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { Chip } from "../../components/ui/Chip";
import { cx } from "../../components/ui/cx";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import {
  formatKstDateWithWeekday,
  formatKstTime,
  formatRelativeDay,
} from "../../lib/format";
import {
  buildPlayerLookup,
  compareMatchesLatestFirst,
  DELETED_PLAYER_LABEL,
  lookupUsername,
  matchKstDateKey,
  toDate,
  type PlayerLookup,
} from "./matchView";

interface MatchGroup {
  key: string;
  label: string;
  matches: Match[];
}

/** 날짜(KST) 내림차순 → 같은 날짜 안에서는 세션별(가장 늦은 경기가 먼저인 묶음부터) */
const groupMatches = (matches: readonly Match[], now: Date): MatchGroup[] => {
  const groups = new Map<string, MatchGroup>();
  for (const match of [...matches].sort(compareMatchesLatestFirst)) {
    const dateKey = matchKstDateKey(match);
    const key = `${dateKey}:${match.session?.id ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      const startsAt = toDate(match.matchStartsAt);
      const relativeDay = formatRelativeDay(startsAt, now);
      const dayPrefix =
        relativeDay === "오늘" || relativeDay === "어제" ? `${relativeDay} · ` : "";
      const sessionLabel = match.session
        ? match.session.name || "이름 없는 세션"
        : "세션 없음";
      group = {
        key,
        label: `${dayPrefix}${formatKstDateWithWeekday(startsAt)} · ${sessionLabel}`,
        matches: [],
      };
      groups.set(key, group);
    }
    group.matches.push(match);
  }
  // 경기를 최신순으로 넣었으므로 묶음도 처음 만든 순서가 날짜 내림차순이다
  return [...groups.values()];
};

const TeamLine: React.FC<{
  team: Team;
  lookup: PlayerLookup;
  score: React.ReactNode;
}> = ({ team, lookup, score }) => {
  const usernames = team.players.map(
    (player) => player.username || lookupUsername(lookup, player.id),
  );
  return (
    <div className="flex h-7 items-center gap-2.5">
      <span className="flex shrink-0 -space-x-1.5">
        {team.players.map((player, index) => (
          <PlayerAvatar
            key={player.id}
            player={{ username: usernames[index], avatarUrl: player.avatarUrl }}
            size={24}
            className="ring-2 ring-white"
          />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-pk-15 text-pk-ink">
        {usernames.length ? usernames.join(" · ") : DELETED_PLAYER_LABEL}
      </span>
      {score}
    </div>
  );
};

const MatchRowContent: React.FC<{
  match: Match;
  lookup: PlayerLookup;
  now: Date;
}> = ({ match, lookup, now }) => {
  const startsAt = toDate(match.matchStartsAt);
  const creator = lookupUsername(lookup, match.creatorPlayerId);
  const editor =
    match.resultSubmittedByPlayerId &&
    match.resultSubmittedByPlayerId !== match.creatorPlayerId
      ? lookupUsername(lookup, match.resultSubmittedByPlayerId)
      : null;
  const score = match.scores?.[0];
  const winnerIndex = getWinningTeamIndex(match);

  const meta = [
    formatKstTime(startsAt),
    isSinglesMatchType(match.type) && "단식",
    `기록 ${creator}`,
    editor && `수정 ${editor}`,
  ].filter(Boolean);

  const chips = [
    match.ratingExcluded && "평점 미반영 · 게스트",
    !isWithinMatchEditWindow(startsAt, now) && "24시간 지남 · 관리자만 수정",
    match.status === "created" && "진행 중",
    match.status === "cancelled" && "취소됨",
  ].filter((chip): chip is string => Boolean(chip));

  const renderScore = (teamIndex: 0 | 1) => {
    if (!score) {
      return teamIndex === 0 ? (
        <span className="shrink-0 text-pk-13 text-pk-muted">점수 없음</span>
      ) : null;
    }
    return (
      <span
        className={cx(
          "w-8 shrink-0 text-right text-pk-15 tabular-nums",
          winnerIndex === teamIndex ? "font-bold text-pk-ink" : "text-pk-muted",
        )}
      >
        {teamIndex === 0 ? score.scoreA : score.scoreB}
      </span>
    );
  };

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-pk-13 font-semibold text-pk-sub">{meta.join(" · ")}</span>
        {chips.map((chip) => (
          <Chip key={chip}>{chip}</Chip>
        ))}
      </div>
      <TeamLine team={match.teams[0]} lookup={lookup} score={renderScore(0)} />
      <TeamLine team={match.teams[1]} lookup={lookup} score={renderScore(1)} />
    </div>
  );
};

/** 날짜·세션 묶음 경기 목록 */
export const MatchList: React.FC<{
  matches: Match[];
  players: AdminPlayer[];
  selectedMatchId: string | null;
  onSelect: (matchId: string) => void;
  /** 주면 줄마다 체크 상자가 생긴다(세션 없는 경기 연결용) */
  selection?: { selectedIds: ReadonlySet<string>; onToggle: (matchId: string) => void };
}> = ({ matches, players, selectedMatchId, onSelect, selection }) => {
  const lookup = useMemo(() => buildPlayerLookup(players, matches), [players, matches]);
  // 목록을 그릴 때마다 "오늘·어제"와 24시간 판정 기준이 같도록 한 번만 잰다
  const now = useMemo(() => new Date(), [matches]);
  const groups = useMemo(() => groupMatches(matches, now), [matches, now]);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="mb-2 px-1 text-pk-13 font-bold text-pk-sub">
            {group.label} · {group.matches.length}경기
          </h2>
          <ul className="overflow-hidden rounded-pk-lg bg-white">
            {group.matches.map((match) => {
              const selected = match.id === selectedMatchId;
              return (
                <li
                  key={match.id}
                  className={cx(
                    "flex items-start gap-3 border-b border-pk-divider px-4 last:border-b-0",
                    selected ? "bg-pk-primary-soft" : "hover:bg-pk-bg",
                  )}
                >
                  {selection && (
                    <input
                      type="checkbox"
                      aria-label={`${formatKstTime(toDate(match.matchStartsAt))} 경기 고르기`}
                      checked={selection.selectedIds.has(match.id)}
                      onChange={() => selection.onToggle(match.id)}
                      className="mt-4 size-4 shrink-0 accent-pk-primary"
                    />
                  )}
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(match.id)}
                    className="flex min-w-0 flex-1 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pk-primary"
                  >
                    <MatchRowContent match={match} lookup={lookup} now={now} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
