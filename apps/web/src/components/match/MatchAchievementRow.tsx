import React from "react";
import type { Player } from "@pkpkdupr/shared/player";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import type { MatchEarnedAchievement } from "@/lib/achievements";

export interface MatchAchievementRowProps {
  achievement: MatchEarnedAchievement<Player>;
  onPress: () => void;
  /** 줄 바탕·여백·등장 연출 */
  className?: string;
  style?: React.CSSProperties;
  /** 배지 등장 연출 */
  badgeClassName?: string;
  badgeStyle?: React.CSSProperties;
}

/**
 * 경기로 받은 업적 한 줄(기록 완료 띠·경기 상세 공통).
 * 왼쪽 배지 → 업적 이름·조건 → 오른쪽 끝에 받은 회원 아바타 위·아이디 아래
 */
export const MatchAchievementRow: React.FC<MatchAchievementRowProps> = ({
  achievement: { definition, player },
  onPress,
  className,
  style,
  badgeClassName,
  badgeStyle,
}) => (
  <button
    type="button"
    onClick={onPress}
    style={style}
    className={cx("flex w-full items-center gap-3 text-left", className)}
  >
    <span style={badgeStyle} className={cx("flex shrink-0", badgeClassName)}>
      <AchievementBadge achievement={definition} earned size={40} />
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-pk-15 font-extrabold text-pk-ink">
        {definition.name}
      </span>
      <span className="truncate text-pk-13 text-pk-sub">
        {definition.condition}
      </span>
    </span>
    <span className="flex w-16 shrink-0 flex-col items-center gap-1">
      <PlayerAvatar player={player} size={28} />
      <span className="max-w-full truncate text-pk-12 font-bold text-pk-ink">
        {player.username}
      </span>
    </span>
  </button>
);
