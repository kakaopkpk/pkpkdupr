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
 * 회원 한 명의 비율 막대 줄. 누르면 그 회원 프로필을 연다.
 * % 칸을 96px로 고정해 줄마다 막대 길이가 같다.
 */
export const StatBarRow: React.FC<{
  player: StatPlayer;
  /** 0~100 */
  percent: number;
  barClassName: string;
  wins: number;
  losses: number;
}> = ({ player, percent, barClassName, wins, losses }) => {
  const { openMemberProfile } = useAppNavigation();
  return (
    <li>
      <button
        type="button"
        onClick={() => openMemberProfile(player.id)}
        className="grid w-full grid-cols-[28px_72px_minmax(0,1fr)] items-center gap-2.5 text-left"
      >
        <PlayerAvatar player={player} size={28} />
        <span className="truncate text-pk-15 font-bold text-pk-ink">
          {player.username}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="block h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-pk-divider"
          >
            <span
              className={cx("block h-2 rounded-full", barClassName)}
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="w-24 shrink-0 whitespace-nowrap text-left text-pk-13 tabular-nums">
            <b className="font-extrabold text-pk-ink">{percent}%</b>{" "}
            <span className="text-pk-sub">
              {wins}승 {losses}패
            </span>
          </span>
        </span>
      </button>
    </li>
  );
};

/** 회원별 비율 막대 줄을 담는 카드(안쪽 16px, 줄 간격 14px) */
export const StatBarCard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Card className="p-4">
    <ul className="flex flex-col gap-3.5">{children}</ul>
  </Card>
);

/** 같은 팀으로 뛴 파트너별 승률. 50% 이상이면 블루 막대 */
const PartnerChemistryCard: React.FC<{ partners: readonly PartnerStat[] }> = ({
  partners,
}) => (
  <StatBarCard>
    {partners.map(({ partner, matchCount, wins, losses }) => {
      const winRate = toPercent(wins, matchCount);
      return (
        <StatBarRow
          key={partner.id}
          player={partner}
          percent={winRate}
          barClassName={winRate >= 50 ? "bg-pk-primary" : "bg-pk-quiet"}
          wins={wins}
          losses={losses}
        />
      );
    })}
  </StatBarCard>
);

export default PartnerChemistryCard;
