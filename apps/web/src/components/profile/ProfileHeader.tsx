import React from "react";
import SkeletonBlock from "@/components/SkeletonBlock";
import { WinLossCount } from "@/components/profile/ProfileStatTile";
import { COUNT_UP, CountUpNumber } from "@/components/ui/CountUpNumber";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { StatusMessageChip } from "@/components/ui/StatusMessageChip";
import { cx } from "@/components/ui/cx";
import type { PlayerProfileSummaryInfo } from "@/lib/playerProfile";

/** 복식·단식을 합친 승패 */
export const getTotalMatchStats = (
  matchStats: PlayerProfileSummaryInfo["matchStats"],
): { wins: number; losses: number } =>
  Object.values(matchStats).reduce(
    (sum, stats) => ({
      wins: sum.wins + stats.matchWins,
      losses: sum.losses + stats.matchLosses,
    }),
    { wins: 0, losses: 0 },
  );

export interface ProfileHeaderProps {
  /** 아직 모르면 null(아바타 자리를 깜빡이는 원으로 둔다) */
  player: { id: string; username: string; avatarUrl?: string | null } | null;
  statusMessage?: string | null;
  statusMessageBackgroundColor?: string | null;
  /** 프로필 요약의 matchStats. 없으면 불러오는 중(스켈레톤)이거나 실패(statsError)다 */
  matchStats: PlayerProfileSummaryInfo["matchStats"] | null | undefined;
  /** 프로필 요약을 불러오지 못했으면 승패 줄을 숨긴다 */
  statsError?: boolean;
  /** 이름 제목 태그. 화면 머리에 다른 h1이 있으면 h2를 쓴다 */
  headingAs?: "h1" | "h2";
  /** 오른쪽 슬롯(예: 나 탭 설정 버튼) */
  right?: React.ReactNode;
  /** 바깥 여백은 화면마다 정한다 */
  className?: string;
}

/**
 * 나 탭·회원 프로필 공용 머리. 흰 카드 없이 바탕 위에 아바타 52 · 이름 22/800 · 상태메시지 칩 ·
 * "N경기 · N승 N패"(복식+단식 합) 줄과 오른쪽 슬롯.
 */
const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  player,
  statusMessage,
  statusMessageBackgroundColor,
  matchStats,
  statsError = false,
  headingAs: Heading = "h1",
  right,
  className,
}) => {
  const totalStats = matchStats ? getTotalMatchStats(matchStats) : null;

  return (
    <header className={cx("flex items-center gap-3", className)}>
      {player ? (
        <PlayerAvatar player={player} size={52} />
      ) : (
        <span className="size-[52px] shrink-0 animate-pulse rounded-full bg-pk-neutral" />
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <Heading className="max-w-full truncate text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
          {player?.username ?? ""}
        </Heading>
        {statusMessage ? (
          <StatusMessageChip
            message={statusMessage}
            color={statusMessageBackgroundColor}
          />
        ) : null}
        {totalStats ? (
          <span className="text-pk-13 text-pk-sub tabular-nums">
            <CountUpNumber
              value={totalStats.wins + totalStats.losses}
              {...COUNT_UP}
            />
            경기 ·{" "}
            <WinLossCount wins={totalStats.wins} losses={totalStats.losses} />
          </span>
        ) : statsError ? null : (
          <SkeletonBlock className="h-4 w-32" />
        )}
      </div>
      {right}
    </header>
  );
};

export default ProfileHeader;
