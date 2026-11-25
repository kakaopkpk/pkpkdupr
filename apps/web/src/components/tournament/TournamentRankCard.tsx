import React from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import type { TournamentPlacement } from "@pkpkdupr/shared/tournament";
import { SessionBlueCard } from "@/components/session/SessionBlueCard";
import { formatSessionTimePlace } from "@/components/session/sessionTimeLabel";
import { TeamAvatars } from "@/components/ui/PlayerAvatar";
import { RankBadge } from "@/components/ui/RankBadge";
import { cx } from "@/components/ui/cx";
import { formatRatingDelta } from "@/lib/format";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

const MAX_UNIT_AVATARS = 4;
/** 이 인원까지는 이름을 모두 나열하고, 넘으면 "대표 외 N명" */
const MAX_LISTED_UNIT_NAMES = 2;
const UNIT_AVATAR_SIZE = 24;
const DEEP_RING_COLOR = "var(--color-pk-deep)";

/** 카드 안 구분선(흰색 14%) */
const dividerClassName = "border-t border-white/[0.14]";

/** 참가 단위 이름: 1명 아이디, 2명 "a · b", 3명 이상 "대표 외 N명"(대표는 첫 사람) */
export const formatPlacementUnitName = (
  players: TournamentPlacement["players"],
) => {
  if (players.length <= MAX_LISTED_UNIT_NAMES) {
    return players.map((player) => player.username).join(" · ");
  }
  return `${players[0].username} 외 ${players.length - 1}명`;
};

const formatRecord = (record: { wins: number; losses: number }) =>
  `${record.wins}승 ${record.losses}패`;

/** 남색 바탕 위 평점 변화 색. 상승·하락은 연한 초록·코랄, 0은 흐린 흰색 */
const getDeepDeltaClassName = (delta: number) => {
  // formatRatingDelta와 같이 소수 셋째 자리에서 0이 되는 값은 보합으로 본다
  const rounded = Math.round(delta * 1000) / 1000;
  if (rounded > 0) return "text-pk-up-on-deep";
  if (rounded < 0) return "text-pk-down-on-deep";
  return "text-white/70";
};

/** 순위 한 줄. 인원과 상관없이 줄 높이가 같다 */
const PlacementRow: React.FC<{ placement: TournamentPlacement }> = ({
  placement,
}) => (
  <li className="flex h-8 items-center gap-2.5">
    <RankBadge rank={placement.place} />
    <TeamAvatars
      players={placement.players.slice(0, MAX_UNIT_AVATARS)}
      size={UNIT_AVATAR_SIZE}
      ringColor={DEEP_RING_COLOR}
    />
    <span className="min-w-0 flex-1 truncate text-pk-15 font-bold">
      {formatPlacementUnitName(placement.players)}
    </span>
    {placement.record ? (
      <span className="shrink-0 text-pk-13 font-bold text-white/85 tabular-nums">
        {formatRecord(placement.record)}
      </span>
    ) : null}
  </li>
);

/** 내 기록 줄: "내 기록  3승 1패  +0.084". 세션 후 평점이 없으면 승패만 */
const MineRow: React.FC<{ mine: SessionPlayerReport }> = ({ mine }) => (
  <div className="flex items-center gap-2.5 text-pk-15 tabular-nums">
    <span className="font-bold text-white/70">내 기록</span>
    <span className="font-extrabold">{formatRecord(mine)}</span>
    {mine.ratingAfter !== null ? (
      <span
        className={cx(
          "font-extrabold",
          getDeepDeltaClassName(mine.ratingDelta),
        )}
      >
        {formatRatingDelta(mine.ratingDelta)}
      </span>
    ) : null}
  </div>
);

/**
 * 끝난 대회 순위 카드. 대회 카드 틀에 D-day 자리 "종료"이고,
 * 참여 줄 아래 구분선 → 1~3위 줄 → 구분선 → 내 기록 줄이다.
 * 순위가 없으면 순위 줄, 안 뛰었으면(mine null) 내 기록 줄을 그 위 구분선과 함께 뺀다.
 * 카드 전체가 하나의 누름 영역(onPress)이다
 */
export const TournamentRankCard: React.FC<{
  /** 끝난 대회 세션. placements·participants를 쓴다 */
  session: MatchSessionDetailInfo;
  /** 이 세션 내 기록(세션 리포트 players의 내 줄과 같음). 안 뛰었으면 null */
  mine: SessionPlayerReport | null;
  /** 카드를 누르면. 세션 상세 열기 */
  onPress?: () => void;
  /** 참여 줄을 누르면(세션 상세). 생략하면 참여 줄은 누를 수 없다 */
  onOpenParticipants?: () => void;
}> = ({ session, mine, onPress, onOpenParticipants }) => {
  const placements = [...(session.placements ?? [])].sort(
    (a, b) => a.place - b.place,
  );
  return (
    <SessionBlueCard
      session={session}
      dDayLabel="종료"
      meta={formatSessionTimePlace(session)}
      participantsLabel={`${session.participants.length}명 참여`}
      onPress={onPress}
      onOpenParticipants={onOpenParticipants}
    >
      {placements.length > 0 ? (
        <ol
          aria-label="최종 순위"
          className={cx(dividerClassName, "flex flex-col gap-1.5 pt-4")}
        >
          {placements.map((placement) => (
            <PlacementRow key={placement.place} placement={placement} />
          ))}
        </ol>
      ) : null}
      {mine ? (
        <div className={cx(dividerClassName, "pt-4")}>
          <MineRow mine={mine} />
        </div>
      ) : null}
    </SessionBlueCard>
  );
};
