import React from "react";
import type { OpponentStat } from "@pkpkdupr/shared/profileStats";
import {
  StatCard,
  StatRow,
  toPercent,
} from "@/components/profile/PartnerChemistryCard";

/** 상대로 만나 자주 진 회원별 승패와 승률(%는 하락색). 호출부가 빈 목록은 그리지 않는다 */
const RivalCard: React.FC<{ rivals: readonly OpponentStat[] }> = ({
  rivals,
}) => (
  <StatCard>
    {rivals.map(({ opponent, matchCount, wins, losses }) => (
      <StatRow
        key={opponent.id}
        player={opponent}
        percent={toPercent(wins, matchCount)}
        percentClassName="text-pk-down"
        wins={wins}
        losses={losses}
      />
    ))}
  </StatCard>
);

export default RivalCard;
