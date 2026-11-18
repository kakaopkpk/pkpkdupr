import React from "react";
import type { MatchInfo } from "@/types/match";
import { RallyTeamRow, TEAM_ROW_AVATAR_SIZE } from "@/components/match/LiveMatchRally";
import { PkButton, rowPressClassName } from "@/components/ui/Button";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { TeamAvatars } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import { formatElapsed } from "@/lib/format";
import { TeamsVersus } from "./TeamBlock";

type MatchTeam = MatchInfo["teams"][number];

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

/** 랠리 팀 줄의 한 팀 칸. 아바타 쌍 아래 이름을 가운데 정렬한다 */
const RallyTeamColumn: React.FC<{ team: MatchTeam; avatarClassName?: string }> = ({
  team,
  avatarClassName,
}) => (
  <span className="flex min-w-0 flex-col items-center gap-1.5">
    <span className={cx("inline-flex", avatarClassName)}>
      <TeamAvatars players={team.players} size={TEAM_ROW_AVATAR_SIZE} />
    </span>
    <span className="flex max-w-full min-w-0 flex-col items-center text-pk-15 font-bold leading-[1.35] text-pk-ink">
      {team.players.map((player) => (
        <span key={player.id} className="max-w-full truncate">
          {player.username}
        </span>
      ))}
    </span>
  </span>
);

/**
 * 진행 중인 내 경기. 2px 연한 블루 테두리와 "점수 입력" 버튼. 버튼 위 본문을 누르면 경기 상세를 연다.
 * 팀 줄은 경기 상세처럼 두 팀 사이로 공이 오가는 랠리를 그리고, 시작 전 예정 경기면 vs 글자만 둔다.
 */
export const MyLiveMatchCard: React.FC<{
  match: MatchInfo;
  now: Date;
  onOpenDetail: () => void;
  onEnterScore: () => void;
}> = ({ match, now, onOpenDetail, onEnterScore }) => (
  <article className="flex flex-col gap-3 rounded-pk-lg border-2 border-pk-primary-line bg-white p-3.5">
    <button
      type="button"
      onClick={onOpenDetail}
      className="flex flex-col gap-1 text-left active:opacity-80"
    >
      <LiveMatchHeader
        match={match}
        now={now}
        chip={
          <span className="rounded-full bg-pk-primary px-[9px] py-[3px] text-pk-12 font-extrabold text-white">
            내 경기
          </span>
        }
      />
      <RallyTeamRow
        isScheduled={new Date(match.matchStartsAt).getTime() > now.getTime()}
        playerCounts={[match.teams[0].players.length, match.teams[1].players.length]}
        vsClassName="text-pk-12 font-bold text-pk-muted"
        ballRingClassName="fill-white"
        renderTeam={(side, avatarClassName) => (
          <RallyTeamColumn team={match.teams[side]} avatarClassName={avatarClassName} />
        )}
      />
    </button>
    <PkButton size="md" fullWidth className="h-12" onClick={onEnterScore}>
      점수 입력
    </PkButton>
  </article>
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
