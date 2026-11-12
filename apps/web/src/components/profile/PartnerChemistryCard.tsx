import React from "react";
import type { PartnerStat } from "@pkpkdupr/shared/profileStats";
import { Card } from "@/components/ui/Card";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";

/** 같은 팀으로 뛴 파트너별 승률. 50% 이상이면 블루 막대 */
const PartnerChemistryCard: React.FC<{ partners: readonly PartnerStat[] }> = ({
  partners,
}) => (
  <Card className="flex flex-col gap-3.5 !px-4 !py-3.5">
    <h2 className="text-pk-15 font-extrabold text-pk-ink">파트너 궁합</h2>
    <ul className="flex flex-col gap-3.5">
      {partners.map(({ partner, matchCount, wins, losses }) => {
        const winRate =
          matchCount > 0 ? Math.round((wins / matchCount) * 100) : 0;
        return (
          <li
            key={partner.id}
            className="grid grid-cols-[28px_72px_minmax(0,1fr)_96px] items-center gap-2.5"
          >
            <PlayerAvatar player={partner} size={28} />
            <span className="truncate text-pk-15 font-bold text-pk-ink">
              {partner.username}
            </span>
            <span
              aria-hidden="true"
              className="block h-2 overflow-hidden rounded-full bg-pk-divider"
            >
              <span
                className={cx(
                  "block h-2 rounded-full",
                  winRate >= 50 ? "bg-pk-primary" : "bg-pk-quiet",
                )}
                style={{ width: `${winRate}%` }}
              />
            </span>
            <span className="whitespace-nowrap text-right text-pk-13 tabular-nums">
              <b className="font-extrabold text-pk-ink">{winRate}%</b>{" "}
              <span className="text-pk-sub">
                {wins}승 {losses}패
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  </Card>
);

export default PartnerChemistryCard;
