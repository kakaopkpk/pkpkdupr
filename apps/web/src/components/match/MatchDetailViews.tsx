import React, { useMemo } from "react";
import {
  getMatchRecordedAt,
  getMatchTopLevelType,
} from "@pkpkdupr/shared/match";
import {
  getTeamResultScores,
  type MatchInfo,
  RATING_EXCLUDED_NOTICE,
} from "@/types/match";
import SkeletonBlock from "@/components/SkeletonBlock";
import { FooterError } from "@/components/record/RecordMatchParts";
import { PkButton, rowPressClassName, buttonPressClassName } from "@/components/ui/Button";
import {
  RallyTeamRow,
  TEAM_ROW_AVATAR_SIZE,
} from "@/components/match/LiveMatchRally";
import { MatchAchievementRow } from "@/components/match/MatchAchievementRow";
import { MatchRatingChangeCount } from "@/components/match/MatchRatingChangeCount";
import { Card } from "@/components/ui/Card";
import {
  COUNT_UP,
  CountUpNumber,
} from "@/components/ui/CountUpNumber";
import { rowDividerClassName } from "@/components/ui/MatchRow";
import { PlayerAvatar, TeamAvatars } from "@/components/ui/PlayerAvatar";
import { MatchResultLabel } from "@/components/ui/SpecialMatchLabel";
import { LinkChevron, Section } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import { useIsMatchScheduled } from "@/hooks/useIsMatchScheduled";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { pickMatchEarnedAchievements } from "@/lib/achievements";
import { getMatchResultName } from "@/lib/matchResult";
import { formatBracketRoundLabel } from "@/lib/tournament";
import {
  formatElapsed,
  formatKstShortDate,
  formatKstTime,
  formatKstWeekdayTime,
} from "@/lib/format";

type MatchTeam = MatchInfo["teams"][number];

const BG_COLOR = "var(--color-pk-bg)";

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
    className={cx("inline-flex items-center gap-0.5 font-bold text-pk-primary", buttonPressClassName)}
  >
    {getSessionLabel(session)}
    <LinkChevron />
  </button>
);

/** 팀 이름 두 줄. 이름을 누르면 그 회원 프로필을 연다 */
const TeamNames: React.FC<{
  team: MatchTeam;
  tone: "strong" | "weak";
  onOpenPlayer: (playerId: string) => void;
}> = ({ team, tone, onOpenPlayer }) => (
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
        className={cx("max-w-full truncate", buttonPressClassName)}
      >
        {player.username}
      </button>
    ))}
  </span>
);

/** 팀 아바타 쌍과 이름 두 줄을 세로로 쌓는다 */
const TeamColumn: React.FC<{
  team: MatchTeam;
  tone: "strong" | "weak";
  onOpenPlayer: (playerId: string) => void;
}> = ({ team, tone, onOpenPlayer }) => (
  <div className="flex min-w-0 flex-col items-center gap-1.5">
    <TeamAvatars players={team.players} size={TEAM_ROW_AVATAR_SIZE} ringColor={BG_COLOR} />
    <TeamNames team={team} tone={tone} onOpenPlayer={onOpenPlayer} />
  </div>
);

export interface LiveMatchDetailProps {
  match: MatchInfo;
  /** 시작한 사람 아이디. 모르면 null */
  creatorUsername: string | null;
  onOpenSession: (sessionId: string) => void;
  onOpenPlayer: (playerId: string) => void;
}

/** 진행 중(또는 시작 전 예정·대진 예정) 경기 본문. 참가자가 아니어도 같은 화면을 보며, 점수 입력 버튼은 LiveMatchActions로 하단 고정 바에 둔다 */
export const LiveMatchDetail: React.FC<LiveMatchDetailProps> = ({
  match,
  creatorUsername,
  onOpenSession,
  onOpenPlayer,
}) => {
  const now = useMinuteClock();
  const startsAt = new Date(match.matchStartsAt);
  const isScheduled = useIsMatchScheduled(match, now);
  // 대진 예정 경기는 시각이 정해져 있지 않아 시각·시작한 사람을 보이지 않는다
  const isBracketScheduled = match.status === "scheduled";
  const showStartRows = !isBracketScheduled;
  // 보일 행이 하나도 없으면 빈 카드를 그리지 않는다
  const showInfoCard = !!match.session || showStartRows;
  const getPillLabel = () => {
    if (isBracketScheduled) {
      return match.round != null
        ? `${formatBracketRoundLabel(match.round)} · 예정`
        : "예정";
    }
    return isScheduled
      ? `예정 · ${formatKstWeekdayTime(startsAt)}`
      : `진행 중 · ${formatElapsed(startsAt, now)}`;
  };

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
        {getPillLabel()}
      </span>
      {/* 진행 중이면 vs 자리에 네트를 두고 두 팀 사이로 공이 오간다. 예정 경기는 vs 글자만 */}
      <RallyTeamRow
        teams={match.teams}
        isScheduled={isScheduled}
        ringColor={BG_COLOR}
        vsClassName="text-pk-15 font-bold text-pk-muted"
        renderNames={(team) => (
          <TeamNames team={team} tone="strong" onOpenPlayer={onOpenPlayer} />
        )}
      />
      {showInfoCard ? (
        <Card>
          {match.session ? (
            <InfoRow label="세션">
              <SessionLink session={match.session} onOpen={onOpenSession} />
            </InfoRow>
          ) : null}
          {showStartRows ? (
            <>
              <InfoRow label="시작">{formatKstTime(match.matchStartsAt)}</InfoRow>
              <InfoRow label="시작한 사람">{creatorUsername ?? "–"}</InfoRow>
            </>
          ) : null}
        </Card>
      ) : null}
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

/** 대진 예정 경기 하단 고정 바 내용. 시작이 거절되면 버튼 위에 서버 문구를 보인다 */
export const ScheduledMatchActions: React.FC<{
  isBusy: boolean;
  error: string | null;
  onStart: () => void;
}> = ({ isBusy, error, onStart }) => (
  <>
    <FooterError message={error} />
    <PkButton
      size="lg"
      fullWidth
      className="h-14"
      disabled={isBusy}
      onClick={onStart}
    >
      {isBusy ? "시작하는 중…" : "경기 시작"}
    </PkButton>
  </>
);

/**
 * 큰 점수 블록. 이긴 쪽 점수는 블루, 진 쪽은 회색. 점수는 0부터 센다(평점 변화보다 한 박자 먼저).
 * 점수 아래에는 내 기준 결과 이름을 두고, 내가 경기하지 않았으면 없다
 */
const ScoreBlock: React.FC<{
  match: MatchInfo;
  viewerId: string | null;
  onOpenPlayer: (playerId: string) => void;
}> = ({ match, viewerId, onOpenPlayer }) => {
  const matchResult = useMemo(() => getMatchResultName(match, viewerId), [match, viewerId]);
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
      <div className="flex flex-col items-center">
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
        {matchResult ? <MatchResultLabel result={matchResult} className="mt-1.5" /> : null}
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

  // 게스트가 낀 경기는 평점 변화가 없으므로 제목 아래 미반영 안내 한 줄만 보인다
  if (match.ratingExcluded) {
    return (
      <Section title="평점 변화">
        <Card>
          <p className="py-[11px] text-pk-15 text-pk-sub">
            {RATING_EXCLUDED_NOTICE}
          </p>
        </Card>
      </Section>
    );
  }

  if (entries.length === 0) return null;

  return (
    <Section title="평점 변화">
      <Card>
        {entries.map(({ player, change }) => (
          <button
            key={player.id}
            type="button"
            onClick={() => onOpenPlayer(player.id)}
            className={cx(
              "grid min-h-14 w-full grid-cols-[32px_minmax(0,1fr)_auto_60px] items-center gap-3 text-left",
              rowDividerClassName,
              rowPressClassName,
            )}
          >
            <PlayerAvatar player={player} size={32} />
            <span className="min-w-0 truncate text-pk-15 font-bold">
              {player.username}
            </span>
            <MatchRatingChangeCount
              previousRating={change.previousRating[ratingCategory]}
              nextRating={change.nextRating[ratingCategory]}
              delta={change.delta[ratingCategory]}
            />
          </button>
        ))}
      </Card>
    </Section>
  );
};

/** 이 경기로 참가자들이 받은 업적. 없으면(게스트가 낀 경기 포함) 섹션을 숨긴다 */
const MatchAchievementsCard: React.FC<{
  match: MatchInfo;
  onOpenAchievement: (playerId: string, achievementId: string) => void;
}> = ({ match, onOpenAchievement }) => {
  const achievements = useMemo(
    () => pickMatchEarnedAchievements(match.achievements ?? [], match),
    [match],
  );

  if (achievements.length === 0) return null;

  return (
    <Section title="이 경기로 받은 업적">
      <Card>
        {achievements.map((achievement) => (
          <MatchAchievementRow
            key={`${achievement.player.id}:${achievement.definition.id}`}
            achievement={achievement}
            onPress={() =>
              onOpenAchievement(achievement.player.id, achievement.definition.id)
            }
            className={cx(
              "py-3",
              rowDividerClassName,
            )}
          />
        ))}
      </Card>
    </Section>
  );
};

export interface CompletedMatchDetailProps {
  match: MatchInfo;
  recorderUsername: string | null;
  /** 보는 회원. 점수 아래 결과 이름의 기준 팀을 정한다 */
  viewerId: string | null;
  onOpenSession: (sessionId: string) => void;
  onOpenPlayer: (playerId: string) => void;
  onOpenAchievement: (playerId: string, achievementId: string) => void;
}

/** 완료 경기 본문. 수정·한 판 더 버튼은 CompletedMatchActions로 하단 고정 바에 둔다 */
export const CompletedMatchDetail: React.FC<CompletedMatchDetailProps> = ({
  match,
  recorderUsername,
  viewerId,
  onOpenSession,
  onOpenPlayer,
  onOpenAchievement,
}) => (
  // 제목 없는 요소 사이는 16px(gap 10 + 6)이고, 평점 변화 섹션은 Section 규칙(위 20px)을 따른다
  <div className="flex flex-col gap-2.5 px-4 pt-1">
    <p className="mb-1.5 text-center text-pk-13 text-pk-sub tabular-nums">
      {formatKstShortDate(getMatchRecordedAt(match))}{" "}
      {formatKstTime(getMatchRecordedAt(match))}
      {match.session ? (
        <>
          {" · "}
          <SessionLink session={match.session} onOpen={onOpenSession} />
        </>
      ) : null}
    </p>
    <ScoreBlock match={match} viewerId={viewerId} onOpenPlayer={onOpenPlayer} />
    <RatingChangeCard match={match} onOpenPlayer={onOpenPlayer} />
    <MatchAchievementsCard match={match} onOpenAchievement={onOpenAchievement} />
    <Card className="mt-1.5">
      <InfoRow label="장소">{match.location || "–"}</InfoRow>
      <InfoRow label="기록한 사람">{recorderUsername ?? "–"}</InfoRow>
    </Card>
  </div>
);

/**
 * 완료 경기 하단 고정 바 내용. 한 판 더가 있으면 2칸 같은 너비, 없으면(onPlayAgain 생략) 수정만 전체 너비다.
 * 한 판 더가 거절되면 버튼 위에 서버 문구를 보인다
 */
export const CompletedMatchActions: React.FC<{
  isBusy: boolean;
  error: string | null;
  onEdit: () => void;
  onPlayAgain?: () => void;
}> = ({ isBusy, error, onEdit, onPlayAgain }) => (
  <>
    <FooterError message={error} />
    <div className={onPlayAgain ? "grid grid-cols-2 gap-2" : undefined}>
      <PkButton
        variant="soft"
        size="lg"
        fullWidth
        disabled={isBusy}
        onClick={onEdit}
      >
        수정
      </PkButton>
      {onPlayAgain && (
        <PkButton size="lg" fullWidth disabled={isBusy} onClick={onPlayAgain}>
          같은 멤버로 한 판 더
        </PkButton>
      )}
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
    className={cx("inline-flex min-h-11 items-center px-2 text-pk-15 font-bold text-pk-sub", buttonPressClassName)}
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
