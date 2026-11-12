import React from "react";
import { Card } from "@/components/ui/Card";

/** 라벨·큰 값·보조 문구로 된 통계 타일 */
const ProfileStatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  foot: React.ReactNode;
}> = ({ label, value, foot }) => (
  <Card className="flex min-w-0 flex-col gap-0.5 !px-4 !py-3">
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
