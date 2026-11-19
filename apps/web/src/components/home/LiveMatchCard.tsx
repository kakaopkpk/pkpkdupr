import React from "react";
import { isMatchScheduled, type MatchInfo } from "@/types/match";
import { RallyTeamRow } from "@/components/match/LiveMatchRally";
import { PkButton, rowPressClassName } from "@/components/ui/Button";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { formatElapsed } from "@/lib/format";
import { formatBracketRoundLabel } from "@/lib/tournament";
import { TeamsVersus } from "./TeamBlock";

/** 카드 머리 줄. 앞 칩·경과 시간·꺾쇠 */
const LiveMatchHeader: React.FC<{
  match: MatchInfo;
  now: Date;
  chip?: React.ReactNode;
}> = ({ match, now, chip }) => (
  <span className="flex w-full items-center gap-2">
    {chip}
    <span className="text-pk-13 text-pk-sub tabular-nums">
      {formatElapsed(match.matchStartsAt, now)}
    </span>
    <ChevronRightIcon className="ml-auto shrink-0 text-pk-quiet" />
  </span>
);

/** 머리 줄 앞 굵은 글자(칩 대신). 대회 홈 "내 경기" 섹션 카드에 쓴다 */
const HeaderTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-pk-15 font-extrabold text-pk-ink">{children}</span>
);

/** "진행 중 · 4라운드" | 라운드 없는 경기면 접두 글자만 */
const formatRoundTitle = (prefix: string, round: number | null | undefined) =>
  round == null ? prefix : `${prefix} · ${formatBracketRoundLabel(round)}`;

const formatInProgressTitle = (round: number | null | undefined) =>
  formatRoundTitle("진행 중", round);

const formatNextMatchTitle = (round: number | null | undefined) =>
  formatRoundTitle("다음 경기", round);

/** 내 경기 카드 틀. 2px 연한 블루 테두리, 위 본문(누르면 경기 상세)과 아래 버튼 */
const MyMatchCardFrame: React.FC<{
  match: MatchInfo;
  now: Date;
  header: React.ReactNode;
  onOpenDetail: () => void;
  footer: React.ReactNode;
}> = ({ match, now, header, onOpenDetail, footer }) => (
  <article className="flex flex-col gap-3 rounded-pk-lg border-2 border-pk-primary-line bg-white p-3.5">
    <button
      type="button"
      onClick={onOpenDetail}
      className="flex flex-col gap-1 text-left active:opacity-80"
    >
      {header}
      <RallyTeamRow
        teams={match.teams}
        isScheduled={isMatchScheduled(match, now)}
        ringColor="#ffffff"
        vsClassName="text-pk-12 font-bold text-pk-muted"
        renderNames={(team) => (
          <span className="flex max-w-full min-w-0 flex-col items-center text-pk-15 font-bold leading-[1.35] text-pk-ink">
            {team.players.map((player) => (
              <span key={player.id} className="max-w-full truncate">
                {player.username}
              </span>
            ))}
          </span>
        )}
      />
    </button>
    {footer}
  </article>
);

/**
 * 진행 중인 내 경기. 2px 연한 블루 테두리와 "점수 입력" 버튼. 버튼 위 본문을 누르면 경기 상세를 연다.
 * 팀 줄은 경기 상세처럼 두 팀 사이로 공이 오가는 랠리를 그리고, 시작 전 예정 경기면 vs 글자만 둔다.
 * 머리는 "내 경기" 칩이고, 대회 홈 "내 경기" 섹션(isTournament)에서는 칩 대신 "진행 중 · N라운드" 글자다.
 */
export const MyLiveMatchCard: React.FC<{
  match: MatchInfo;
  now: Date;
  isTournament?: boolean;
  onOpenDetail: () => void;
  onEnterScore: () => void;
}> = ({ match, now, isTournament = false, onOpenDetail, onEnterScore }) => (
  <MyMatchCardFrame
    match={match}
    now={now}
    onOpenDetail={onOpenDetail}
    header={
      <LiveMatchHeader
        match={match}
        now={now}
        chip={
          isTournament ? (
            <HeaderTitle>{formatInProgressTitle(match.round)}</HeaderTitle>
          ) : (
            <span className="rounded-full bg-pk-primary px-[9px] py-[3px] text-pk-12 font-extrabold text-white">
              내 경기
            </span>
          )
        }
      />
    }
    footer={
      <PkButton size="md" fullWidth className="h-12" onClick={onEnterScore}>
        점수 입력
      </PkButton>
    }
  />
);

/**
 * 대회 대진의 내 다음 예정 경기. 내 경기 카드 틀에 머리 "다음 경기 · N라운드"와 "경기 시작" 버튼이다.
 * 시작하는 동안 버튼을 막고, 서버가 거절한 문구는 카드 아래에 보인다
 */
export const MyNextBracketMatchCard: React.FC<{
  match: MatchInfo;
  now: Date;
  isStarting: boolean;
  error: string | null;
  onOpenDetail: () => void;
  onStart: () => void;
}> = ({ match, now, isStarting, error, onOpenDetail, onStart }) => (
  <div className="flex flex-col gap-1.5">
    <MyMatchCardFrame
      match={match}
      now={now}
      onOpenDetail={onOpenDetail}
      header={
        <span className="flex w-full items-center gap-2">
          <HeaderTitle>{formatNextMatchTitle(match.round)}</HeaderTitle>
          <ChevronRightIcon className="ml-auto shrink-0 text-pk-quiet" />
        </span>
      }
      footer={
        <PkButton
          size="md"
          fullWidth
          className="h-12"
          onClick={onStart}
          disabled={isStarting}
        >
          {isStarting ? "시작하는 중…" : "경기 시작"}
        </PkButton>
      }
    />
    {error ? (
      <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
        {error}
      </p>
    ) : null}
  </div>
);

/** 진행 중인 남의 경기. 내 경기 카드에서 "내 경기" 칩·테두리·점수 입력 버튼을 뺀 모양이고, 누르면 경기 상세를 연다 */
export const LiveMatchCard: React.FC<{
  match: MatchInfo;
  now: Date;
  onOpenDetail: () => void;
}> = ({ match, now, onOpenDetail }) => (
  <button
    type="button"
    onClick={onOpenDetail}
    className={cx(
      "flex w-full flex-col gap-2.5 rounded-pk-lg bg-white px-4 py-3.5 text-left active:bg-pk-primary-soft/60",
      rowPressClassName,
    )}
  >
    <LiveMatchHeader match={match} now={now} />
    <TeamsVersus teams={[match.teams[0].players, match.teams[1].players]} />
  </button>
);
