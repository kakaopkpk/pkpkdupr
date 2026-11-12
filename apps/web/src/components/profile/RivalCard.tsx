import React from "react";
import type { OpponentStat } from "@pkpkdupr/shared/profileStats";
import { Card } from "@/components/ui/Card";
import {
  StatBarCard,
  StatBarRow,
  toPercent,
} from "@/components/profile/PartnerChemistryCard";

/** 상대로 만나 자주 진 회원별 진 비율. 막대는 하락색 */
const RivalCard: React.FC<{ rivals: readonly OpponentStat[] }> = ({
  rivals,
}) =>
  rivals.length > 0 ? (
    <StatBarCard>
      {rivals.map(({ opponent, matchCount, wins, losses }) => (
        <StatBarRow
          key={opponent.id}
          player={opponent}
          percent={toPercent(losses, matchCount)}
          barClassName="bg-pk-down"
          wins={wins}
          losses={losses}
        />
      ))}
    </StatBarCard>
  ) : (
    <Card>
      <p className="py-6 text-center text-pk-13 text-pk-muted">
        아직 자주 진 상대가 없어요
      </p>
    </Card>
  );

export default RivalCard;
