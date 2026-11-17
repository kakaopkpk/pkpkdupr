import React, { useEffect, useState } from "react";
import { ACHIEVEMENTS, type AchievementDefinition } from "@pkpkdupr/shared/achievements";
import { fetchAchievementHolders } from "../../api/ratings";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InlineError } from "../../components/ui/InlineError";

const COLLAPSED_COUNT = 4;

// "구름 위 산책 (3.5)"처럼 이름에 없는 숫자 꼬리표만 붙인다("10경기"에는 붙이지 않는다)
const achievementLabel = (definition: AchievementDefinition) =>
  definition.badgeNumber && !definition.name.includes(definition.badgeNumber)
    ? `${definition.name} (${definition.badgeNumber})`
    : definition.name;

export const AchievementHoldersCard: React.FC<{
  /** 바뀌면 다시 읽는다 */
  reloadKey: number;
}> = ({ reloadKey }) => {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let canceled = false;
    fetchAchievementHolders()
      .then((data) => {
        if (canceled) return;
        setCounts(data.counts);
        setError(null);
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "업적 현황을 불러오지 못했어요.");
      });
    return () => {
      canceled = true;
    };
  }, [reloadKey]);

  const visible = expanded ? ACHIEVEMENTS : ACHIEVEMENTS.slice(0, COLLAPSED_COUNT);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-pk-17 font-bold text-pk-ink">업적 현황</h2>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "접기" : "전체 보기 ›"}
        </Button>
      </div>
      <InlineError message={error} />
      {counts && (
        <ul className="mt-2">
          {visible.map((definition) => (
            <li
              key={definition.id}
              className="flex items-center justify-between gap-3 border-b border-pk-divider py-3 text-pk-15 last:border-b-0"
            >
              <span className="min-w-0 truncate text-pk-ink">{achievementLabel(definition)}</span>
              <span className="shrink-0 font-semibold tabular-nums text-pk-sub">
                {counts[definition.id] ?? 0}명
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-pk-13 text-pk-sub">업적별로 받은 활성 회원 수예요.</p>
    </Card>
  );
};
