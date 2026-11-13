import React from "react";
import { Card } from "@/components/ui/Card";
import { CountUpNumber } from "@/components/ui/CountUpNumber";

/** 통계 타일 숫자의 카운트업 시작·길이(ms). 평점 카드보다 조금 늦게 따라온다 */
export const PROFILE_STAT_COUNT = { delayMs: 150, durationMs: 500 } as const;

/** 0부터 세는 "N승 M패". 기본 타이밍은 통계 타일 것이다 */
export const WinLossCount: React.FC<{
  wins: number;
  losses: number;
  delayMs?: number;
}> = ({ wins, losses, delayMs = PROFILE_STAT_COUNT.delayMs }) => (
  <>
    <CountUpNumber
      value={wins}
      delayMs={delayMs}
      durationMs={PROFILE_STAT_COUNT.durationMs}
    />
    승{" "}
    <CountUpNumber
      value={losses}
      delayMs={delayMs}
      durationMs={PROFILE_STAT_COUNT.durationMs}
    />
    패
  </>
);

/** 라벨·큰 값·보조 문구로 된 통계 타일 */
const ProfileStatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  foot: React.ReactNode;
}> = ({ label, value, foot }) => (
  <Card className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
    <span className="truncate text-pk-13 text-pk-sub">{label}</span>
    <span className="truncate text-pk-22 font-extrabold leading-[1.4] tabular-nums text-pk-ink">
      {value}
    </span>
    <span className="truncate text-pk-12 text-pk-muted tabular-nums">
      {foot}
    </span>
  </Card>
);

export default ProfileStatTile;
