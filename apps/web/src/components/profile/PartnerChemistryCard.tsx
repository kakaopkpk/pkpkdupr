import React from "react";
import type { PartnerStat, StatPlayer } from "@pkpkdupr/shared/profileStats";
import { Card } from "@/components/ui/Card";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";

/** 비율을 정수 %로 바꾼다. 분모가 0이면 0 */
export const toPercent = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 100) : 0;

/**
 * 회원 한 명의 승패·승률 줄. 누르면 그 회원 프로필을 연다.
 * % 칸의 최소 폭을 고정해 줄마다 오른쪽 끝이 맞는다.
 */
export const StatRow: React.FC<{
  player: StatPlayer;
  /** 0~100 */
  percent: number;
  percentClassName: string;
  wins: number;
  losses: number;
}> = ({ player, percent, percentClassName, wins, losses }) => {
  const { openMemberProfile } = useAppNavigation();
  return (
    <li className="not-last:border-b not-last:border-pk-divider">
      <button
        type="button"
        onClick={() => openMemberProfile(player.id)}
        className="flex min-h-12 w-full items-center gap-2.5 text-left"
      >
        <PlayerAvatar player={player} size={28} />
        <span className="min-w-0 flex-1 truncate text-pk-15 font-bold text-pk-ink">
          {player.username}
        </span>
        <span className="flex shrink-0 items-center gap-2 leading-none tabular-nums">
          <span className="whitespace-nowrap text-pk-13 text-pk-sub">
            {wins}승 {losses}패
          </span>
          <b
            className={cx(
              "min-w-11 text-right text-pk-17 font-extrabold",
              percentClassName,
            )}
          >
            {percent}%
          </b>
        </span>
      </button>
    </li>
  );
};

/** 회원별 승패·승률 줄을 담는 카드(안쪽 4px 16px는 Card 기본 패딩) */
export const StatCard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Card>
    <ul className="flex flex-col">{children}</ul>
  </Card>
);

/** 같은 팀으로 뛴 파트너별 승률. 50% 이상이면 primary, 미만이면 ink */
const PartnerChemistryCard: React.FC<{ partners: readonly PartnerStat[] }> = ({
  partners,
}) => (
  <StatCard>
    {partners.map(({ partner, matchCount, wins, losses }) => {
      const winRate = toPercent(wins, matchCount);
      return (
        <StatRow
          key={partner.id}
          player={partner}
          percent={winRate}
          percentClassName={winRate >= 50 ? "text-pk-primary" : "text-pk-ink"}
          wins={wins}
          losses={losses}
        />
      );
    })}
  </StatCard>
);

export default PartnerChemistryCard;
