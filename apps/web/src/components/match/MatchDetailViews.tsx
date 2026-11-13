import React, { useEffect, useMemo, useState } from "react";
import { getMatchTopLevelType } from "@pkpkdupr/shared/match";
import {
  getTeamResultScores,
  type MatchInfo,
  RATING_EXCLUDED_NOTICE,
} from "@/types/match";
import SkeletonBlock from "@/components/SkeletonBlock";
import { FooterError } from "@/components/record/RecordMatchParts";
import { PkButton, rowPressClassName } from "@/components/ui/Button";
import { MatchRatingChangeCount } from "@/components/match/MatchRatingChangeCount";
import { Card } from "@/components/ui/Card";
import {
  COUNT_UP,
  COUNT_UP_SECOND,
  CountUpNumber,
} from "@/components/ui/CountUpNumber";
import { PlayerAvatar, TeamAvatars } from "@/components/ui/PlayerAvatar";
import { LinkChevron } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import {
  formatKstShortDate,
  formatKstTime,
  formatKstWeekdayTime,
} from "@/lib/format";

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
    className="inline-flex items-center gap-0.5 font-bold text-pk-primary active:opacity-70"
  >
    {getSessionLabel(session)}
    <LinkChevron />
  </button>
);

/** 팀 아바타 쌍과 이름 두 줄을 세로로 쌓는다. 이름을 누르면 그 회원 프로필을 연다 */
const TeamColumn: React.FC<{
  team: MatchTeam;
  tone: "strong" | "weak";
  onOpenPlayer: (playerId: string) => void;
}> = ({ team, tone, onOpenPlayer }) => (
  <div className="flex min-w-0 flex-col items-center gap-1.5">
    <TeamAvatars players={team.players} size={32} ringColor={BG_COLOR} />
    <span
      className={cx(
        "flex max-w-full min-w-0 flex-col items-center text-pk-13 leading-[1.35]",
        tone === "strong" ? "font-bold text-pk-ink" : "font-medium text-pk-sub",
      )}
    >
      {team.players.map((player) => (
        <button
          key={player.id}
          type="button"
          onClick={() => onOpenPlayer(player.id)}
          className="max-w-full truncate active:opacity-70"
        >
          {player.username}
        </button>
      ))}
    </span>
  </div>
);

export interface LiveMatchDetailProps {
  match: MatchInfo;
  /** 시작한 사람 아이디. 모르면 null */
  creatorUsername: string | null;
  onOpenSession: (sessionId: string) => void;
  onOpenPlayer: (playerId: string) => void;
}

/** 진행 중(또는 시작 전 예정) 경기 본문. 참가자가 아니어도 같은 화면을 보며, 점수 입력 버튼은 LiveMatchActions로 하단 고정 바에 둔다 */
export const LiveMatchDetail: React.FC<LiveMatchDetailProps> = ({
  match,
  creatorUsername,
  onOpenSession,
  onOpenPlayer,
}) => {
  const now = useMinuteClock();
  const startsAtMs = new Date(match.matchStartsAt).getTime();
  // 관리자 예정 경기처럼 시작 시각 전의 created 경기는 진행 중이 아니라 예정으로 보인다
  const isScheduled = startsAtMs > now;
  const elapsedMinutes = Math.floor((now - startsAtMs) / MINUTE_MS);

  return (
    <div className="flex flex-col gap-4 px-4 pt-1">
      <span
        className={cx(
          "inline-flex items-center gap-1.5 self-center rounded-full px-3 py-1 text-pk-13 font-bold tabular-nums",
          isScheduled ? "bg-pk-neutral text-pk-sub" : "bg-pk-primary-soft text-pk-primary",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "size-[7px] rounded-full",
            isScheduled ? "bg-pk-muted" : "bg-pk-primary",
          )}
        />
        {isScheduled
          ? `예정 · ${formatKstWeekdayTime(match.matchStartsAt)}`
          : `진행 중 · ${elapsedMinutes}분째`}
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <TeamColumn
          team={match.teams[0]}
          tone="strong"
          onOpenPlayer={onOpenPlayer}
        />
        <span className="text-pk-15 font-bold text-pk-muted">vs</span>
        <TeamColumn
          team={match.teams[1]}
          tone="strong"
          onOpenPlayer={onOpenPlayer}
        />
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
  );
};

/** 진행 중 경기 하단 고정 바 내용 */
export const LiveMatchActions: React.FC<{ onEnterScore: () => void }> = ({
  onEnterScore,
}) => (
  <PkButton size="lg" fullWidth className="h-14" onClick={onEnterScore}>
    점수 입력
  </PkButton>
);

/** 큰 점수 블록. 이긴 쪽 점수는 블루, 진 쪽은 회색. 점수는 0부터 센다(평점 변화보다 한 박자 먼저) */
const ScoreBlock: React.FC<{
  match: MatchInfo;
  onOpenPlayer: (playerId: string) => void;
}> = ({ match, onOpenPlayer }) => {
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
        onOpenPlayer={onOpenPlayer}
      />
      <div className="font-num text-[64px] leading-none font-bold tabular-nums">
        <span className="sr-only">
          {hasScores ? `${scoreA} 대 ${scoreB}` : "점수 없음"}
        </span>
        <span aria-hidden="true">
          <span className={scoreClassName(0)}>
            {hasScores ? <CountUpNumber value={scoreA} {...COUNT_UP} /> : "–"}
          </span>
          <span className="px-2 text-[#c5ccda]">:</span>
          <span className={scoreClassName(1)}>
            {hasScores ? <CountUpNumber value={scoreB} {...COUNT_UP} /> : "–"}
          </span>
        </span>
      </div>
      <TeamColumn
        team={match.teams[1]}
        tone={winnerIndex === 0 ? "weak" : "strong"}
        onOpenPlayer={onOpenPlayer}
      />
    </div>
  );
};

const RatingChangeCard: React.FC<{
  match: MatchInfo;
  onOpenPlayer: (playerId: string) => void;
}> = ({ match, onOpenPlayer }) => {
  // 경기 분류(단식/복식)에 맞는 평점으로 이전 평점에서 새 평점까지 센다
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

  const title = (
    <h2 className="mt-3 mb-0.5 text-pk-13 font-bold text-pk-sub">평점 변화</h2>
  );

  // 게스트가 낀 경기는 평점 변화가 없으므로 미반영 안내 한 줄만 보인다
  if (match.ratingExcluded) {
    return (
      <Card>
        {title}
        <p className="py-[11px] text-pk-15 text-pk-sub">
          {RATING_EXCLUDED_NOTICE}
        </p>
      </Card>
    );
  }

  if (entries.length === 0) return null;

  return (
    <Card>
      {title}
      {entries.map(({ player, change }) => (
        <button
          key={player.id}
          type="button"
          onClick={() => onOpenPlayer(player.id)}
          className={cx(
            "grid w-full grid-cols-[24px_minmax(0,1fr)_auto_60px] items-center gap-2.5 py-[11px] text-left not-last:shadow-[inset_0_-1px_0_#e6e9f0] active:opacity-70",
            rowPressClassName,
          )}
        >
          <PlayerAvatar player={player} size={24} />
          <span className="min-w-0 truncate text-pk-15 font-bold">
            {player.username}
          </span>
          <MatchRatingChangeCount
            previousRating={change.previousRating[ratingCategory]}
            nextRating={change.nextRating[ratingCategory]}
            delta={change.delta[ratingCategory]}
            timing={COUNT_UP_SECOND}
          />
        </button>
      ))}
    </Card>
  );
};

export interface CompletedMatchDetailProps {
  match: MatchInfo;
  recorderUsername: string | null;
  onOpenSession: (sessionId: string) => void;
  onOpenPlayer: (playerId: string) => void;
}

/** 완료 경기 본문. 수정·한 판 더 버튼은 CompletedMatchActions로 하단 고정 바에 둔다 */
export const CompletedMatchDetail: React.FC<CompletedMatchDetailProps> = ({
  match,
  recorderUsername,
  onOpenSession,
  onOpenPlayer,
}) => (
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
    <ScoreBlock match={match} onOpenPlayer={onOpenPlayer} />
    <RatingChangeCard match={match} onOpenPlayer={onOpenPlayer} />
    <Card>
      <InfoRow label="장소">{match.location || "–"}</InfoRow>
      <InfoRow label="기록한 사람">{recorderUsername ?? "–"}</InfoRow>
    </Card>
  </div>
);

/** 완료 경기 하단 고정 바 내용. 2칸 같은 너비이며, 한 판 더가 거절되면 버튼 위에 서버 문구를 보인다 */
export const CompletedMatchActions: React.FC<{
  isBusy: boolean;
  error: string | null;
  onEdit: () => void;
  onPlayAgain: () => void;
}> = ({ isBusy, error, onEdit, onPlayAgain }) => (
  <>
    <FooterError message={error} />
    <div className="grid grid-cols-2 gap-2">
      <PkButton
        variant="soft"
        size="lg"
        fullWidth
        disabled={isBusy}
        onClick={onEdit}
      >
        수정
      </PkButton>
      <PkButton size="lg" fullWidth disabled={isBusy} onClick={onPlayAgain}>
        같은 멤버로 한 판 더
      </PkButton>
    </div>
  </>
);

/** 경기 상세 헤더 오른쪽 "삭제" 글자 버튼 */
export const DeleteMatchHeaderButton: React.FC<{ onPress: () => void }> = ({
  onPress,
}) => (
  <button
    type="button"
    onClick={onPress}
    className="inline-flex min-h-11 items-center px-2 text-pk-15 font-bold text-pk-sub active:opacity-70"
  >
    삭제
  </button>
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
