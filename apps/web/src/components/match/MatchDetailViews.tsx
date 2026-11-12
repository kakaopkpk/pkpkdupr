import React, { useEffect, useMemo, useState } from "react";
import { getMatchTopLevelType } from "@pkpkdupr/shared/match";
import { getTeamResultScores, type MatchInfo } from "@/types/match";
import SkeletonBlock from "@/components/SkeletonBlock";
import { PkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RatingDelta } from "@/components/ui/Delta";
import { PlayerAvatar, TeamAvatars } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import { formatKstShortDate, formatKstTime } from "@/lib/format";
import { formatRating } from "@/utils/dupr";

type MatchTeam = MatchInfo["teams"][number];

const MINUTE_MS = 60_000;
const BG_COLOR = "var(--color-pk-bg)";

const useMinuteClock = () => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return now;
};

const getSessionLabel = (session: NonNullable<MatchInfo["session"]>) =>
  session.name?.trim() || `${formatKstShortDate(session.date)} 세션`;

/** 하단 고정 버튼 자리. 스크롤해도 화면 아래에 붙어 있다 */
const BottomActions: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="sticky bottom-0 z-10 mt-auto bg-linear-to-b from-pk-bg/0 to-pk-bg to-40% px-4 pt-6 pb-2">
    {children}
  </div>
);

/** 정보 카드의 한 줄. 왼쪽 이름, 오른쪽 값 */
const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex min-h-[52px] items-center gap-3 text-pk-ink not-last:shadow-[inset_0_-1px_0_var(--color-pk-divider)]">
    <span className="min-w-0 flex-1 text-pk-15 font-medium">{label}</span>
    <span className="min-w-0 truncate text-right text-pk-15 text-pk-sub tabular-nums">
      {children}
    </span>
  </div>
);

const SessionLink: React.FC<{
  session: NonNullable<MatchInfo["session"]>;
  onOpen: (sessionId: string) => void;
}> = ({ session, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(session.id)}
    className="font-bold text-pk-primary active:opacity-70"
  >
    {getSessionLabel(session)} ›
  </button>
);

/** 팀 아바타 쌍과 이름 두 줄을 세로로 쌓는다 */
const TeamColumn: React.FC<{ team: MatchTeam; tone: "strong" | "weak" }> = ({
  team,
  tone,
}) => (
  <div className="flex min-w-0 flex-col items-center gap-1.5">
    <TeamAvatars players={team.players} size={32} ringColor={BG_COLOR} />
    <span
      className={cx(
        "flex max-w-full min-w-0 flex-col items-center text-pk-13 leading-[1.35]",
        tone === "strong" ? "font-bold text-pk-ink" : "font-medium text-pk-sub",
      )}
    >
      {team.players.map((player) => (
        <span key={player.id} className="max-w-full truncate">
          {player.username}
        </span>
      ))}
    </span>
  </div>
);

export interface LiveMatchDetailProps {
  match: MatchInfo;
  /** 시작한 사람 아이디. 모르면 null */
  creatorUsername: string | null;
  onOpenSession: (sessionId: string) => void;
  onEnterScore: () => void;
}

/** 진행 중 경기. 참가자가 아니어도 같은 화면과 점수 입력 버튼을 본다 */
export const LiveMatchDetail: React.FC<LiveMatchDetailProps> = ({
  match,
  creatorUsername,
  onOpenSession,
  onEnterScore,
}) => {
  const now = useMinuteClock();
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - new Date(match.matchStartsAt).getTime()) / MINUTE_MS),
  );

  return (
    <>
      <div className="flex flex-col gap-4 px-4 pt-1">
        <span className="inline-flex items-center gap-1.5 self-center rounded-full bg-pk-primary-soft px-3 py-1 text-pk-13 font-bold text-pk-primary tabular-nums">
          <span aria-hidden="true" className="size-[7px] rounded-full bg-pk-primary" />
          진행 중 · {elapsedMinutes}분째
        </span>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <TeamColumn team={match.teams[0]} tone="strong" />
          <span className="text-pk-15 font-bold text-pk-muted">vs</span>
          <TeamColumn team={match.teams[1]} tone="strong" />
        </div>
        <Card>
          {match.session ? (
            <InfoRow label="세션">
              <SessionLink session={match.session} onOpen={onOpenSession} />
            </InfoRow>
          ) : null}
          <InfoRow label="시작">{formatKstTime(match.matchStartsAt)}</InfoRow>
          <InfoRow label="시작한 사람">{creatorUsername ?? "–"}</InfoRow>
        </Card>
      </div>
      <BottomActions>
        <PkButton size="lg" fullWidth className="h-14" onClick={onEnterScore}>
          점수 입력
        </PkButton>
      </BottomActions>
    </>
  );
};

/** 큰 점수 블록. 이긴 쪽 점수는 블루, 진 쪽은 회색 */
const ScoreBlock: React.FC<{ match: MatchInfo }> = ({ match }) => {
  const hasScores = (match.scores?.length ?? 0) > 0;
  const [scoreA, scoreB] = getTeamResultScores(match);
  const winnerIndex = !hasScores || scoreA === scoreB ? null : scoreA > scoreB ? 0 : 1;
  const scoreClassName = (index: 0 | 1) =>
    winnerIndex === index ? "text-pk-primary" : "text-pk-muted";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      <TeamColumn
        team={match.teams[0]}
        tone={winnerIndex === 1 ? "weak" : "strong"}
      />
      <div className="font-num text-[64px] leading-none font-bold tabular-nums">
        <span className="sr-only">
          {hasScores ? `${scoreA} 대 ${scoreB}` : "점수 없음"}
        </span>
        <span aria-hidden="true">
          <span className={scoreClassName(0)}>{hasScores ? scoreA : "–"}</span>
          <span className="px-2 text-[#c5ccda]">:</span>
          <span className={scoreClassName(1)}>{hasScores ? scoreB : "–"}</span>
        </span>
      </div>
      <TeamColumn
        team={match.teams[1]}
        tone={winnerIndex === 0 ? "weak" : "strong"}
      />
    </div>
  );
};

const RatingChangeCard: React.FC<{ match: MatchInfo }> = ({ match }) => {
  // 경기 분류(단식/복식)에 맞는 평점의 이전·이후 값을 보인다
  const ratingCategory =
    getMatchTopLevelType(match.type) === "singles" ? "singles" : "doubles";
  const entries = useMemo(() => {
    const changeByPlayerId = new Map(
      (match.ratingChanges ?? []).map((change) => [change.playerId, change]),
    );
    return match.teams
      .flatMap((team) => team.players)
      .flatMap((player) => {
        const change = changeByPlayerId.get(player.id);
        return change ? [{ player, change }] : [];
      });
  }, [match.ratingChanges, match.teams]);

  if (entries.length === 0) return null;

  return (
    <Card>
      <h2 className="mt-3 mb-0.5 text-pk-13 font-bold text-pk-sub">평점 변화</h2>
      {entries.map(({ player, change }) => (
        <div
          key={player.id}
          className="grid grid-cols-[24px_minmax(0,1fr)_auto_60px] items-center gap-2.5 py-[11px] not-last:shadow-[inset_0_-1px_0_#e6e9f0]"
        >
          <PlayerAvatar player={player} size={24} />
          <span className="min-w-0 truncate text-pk-15 font-bold">
            {player.username}
          </span>
          <span className="text-pk-13 text-pk-sub tabular-nums">
            {formatRating(change.previousRating[ratingCategory])} →{" "}
            {formatRating(change.nextRating[ratingCategory])}
          </span>
          <RatingDelta
            value={change.delta[ratingCategory]}
            className="text-right"
          />
        </div>
      ))}
    </Card>
  );
};

export interface CompletedMatchDetailProps {
  match: MatchInfo;
  recorderUsername: string | null;
  /** false면 수정·한 판 더 버튼을 그리지 않는다(안내 문구 없음) */
  canEdit: boolean;
  onOpenSession: (sessionId: string) => void;
  onEdit: () => void;
  onPlayAgain: () => void;
}

/** 완료 경기. 수정할 수 없으면 같은 화면에서 버튼만 빠진다 */
export const CompletedMatchDetail: React.FC<CompletedMatchDetailProps> = ({
  match,
  recorderUsername,
  canEdit,
  onOpenSession,
  onEdit,
  onPlayAgain,
}) => (
  <>
    <div className="flex flex-col gap-4 px-4 pt-1">
      <p className="text-center text-pk-13 text-pk-sub tabular-nums">
        {formatKstShortDate(match.matchStartsAt)}{" "}
        {formatKstTime(match.matchStartsAt)}
        {match.session ? (
          <>
            {" · "}
            <SessionLink session={match.session} onOpen={onOpenSession} />
          </>
        ) : null}
      </p>
      <ScoreBlock match={match} />
      <RatingChangeCard match={match} />
      <Card>
        <InfoRow label="장소">{match.location || "–"}</InfoRow>
        <InfoRow label="기록한 사람">{recorderUsername ?? "–"}</InfoRow>
      </Card>
    </div>
    {canEdit ? (
      <BottomActions>
        <div className="grid grid-cols-2 gap-2">
          <PkButton variant="soft" size="lg" onClick={onEdit}>
            수정
          </PkButton>
          <PkButton size="lg" onClick={onPlayAgain}>
            한 판 더
          </PkButton>
        </div>
      </BottomActions>
    ) : null}
  </>
);

/** 불러오는 동안 자리만 그린다 */
export const MatchDetailSkeleton: React.FC = () => (
  <div
    role="status"
    aria-label="경기 상세 불러오는 중"
    className="flex flex-col gap-4 px-4 pt-1"
  >
    <SkeletonBlock className="mx-auto h-4 w-40" />
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      {[0, 1].map((index) => (
        <div
          key={index}
          className={cx(
            "flex flex-col items-center gap-1.5",
            index === 1 && "order-3",
          )}
        >
          <SkeletonBlock className="h-8 w-14 rounded-full" />
          <SkeletonBlock className="h-3.5 w-14" />
          <SkeletonBlock className="h-3.5 w-12" />
        </div>
      ))}
      <SkeletonBlock className="order-2 h-14 w-28" />
    </div>
    <div className="flex flex-col gap-3 rounded-pk-lg bg-white px-4 py-4">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-2.5">
          <SkeletonBlock className="size-6 shrink-0 rounded-full" />
          <SkeletonBlock className="h-4 flex-1" />
          <SkeletonBlock className="h-4 w-24" />
        </div>
      ))}
    </div>
    <div className="flex flex-col gap-4 rounded-pk-lg bg-white px-4 py-4">
      <SkeletonBlock className="h-4 w-full" />
      <SkeletonBlock className="h-4 w-full" />
    </div>
  </div>
);
