import React from "react";
import type { PartnerStat, StatPlayer } from "@pkpkdupr/shared/profileStats";
import { Card } from "@/components/ui/Card";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { SectionLabel, TextLink } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";

/** 나 탭 파트너 궁합·천적에 미리 보이는 줄 수. 넘으면 "전체 보기"로 전체 화면을 연다 */
export const STAT_PREVIEW_COUNT = 3;

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
  /** 주면 줄 앞에 순서 번호를 붙인다(전체 보기 화면) */
  order?: number;
}> = ({ player, percent, percentClassName, wins, losses, order }) => {
  const { openMemberProfile } = useAppNavigation();
  return (
    <li className="not-last:border-b not-last:border-pk-divider">
      <button
        type="button"
        onClick={() => openMemberProfile(player.id)}
        className="flex min-h-12 w-full items-center gap-2.5 text-left"
      >
        {order !== undefined ? (
          <span className="w-[18px] shrink-0 text-center text-pk-13 font-bold text-pk-muted tabular-nums">
            {order}
          </span>
        ) : null}
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

/** 회원별 승패·승률 줄을 담는 카드. 안쪽 여백은 Card 기본 패딩(상하 4px·좌우 16px)을 그대로 쓴다 */
export const StatCard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Card>
    <ul className="flex flex-col">{children}</ul>
  </Card>
);

/**
 * 나 탭 파트너 궁합·천적 섹션. 제목에 전체 인원을 붙이고 앞 STAT_PREVIEW_COUNT명만 보이며,
 * 더 있으면 제목 옆 "전체 보기"를 보인다. 빈 목록은 호출부가 그리지 않는다.
 */
export const StatPreviewSection = <T,>({
  title,
  items,
  renderCard,
  onViewAll,
}: {
  title: string;
  items: readonly T[];
  renderCard: (items: readonly T[]) => React.ReactNode;
  onViewAll: () => void;
}): React.ReactElement => (
  <section className="flex flex-col gap-2.5 pt-1">
    <SectionLabel
      right={
        items.length > STAT_PREVIEW_COUNT ? (
          <TextLink onPress={onViewAll} chevron>
            전체 보기
          </TextLink>
        ) : undefined
      }
    >
      {title} · {items.length}
    </SectionLabel>
    {renderCard(items.slice(0, STAT_PREVIEW_COUNT))}
  </section>
);

/** 같은 팀으로 뛴 파트너별 승률. 50% 이상이면 primary, 미만이면 ink */
const PartnerChemistryCard: React.FC<{
  partners: readonly PartnerStat[];
  /** true면 줄 앞에 순서 번호를 붙인다 */
  ordered?: boolean;
}> = ({ partners, ordered = false }) => (
  <StatCard>
    {partners.map(({ partner, matchCount, wins, losses }, index) => {
      const winRate = toPercent(wins, matchCount);
      return (
        <StatRow
          key={partner.id}
          player={partner}
          percent={winRate}
          percentClassName={winRate >= 50 ? "text-pk-primary" : "text-pk-ink"}
          wins={wins}
          losses={losses}
          order={ordered ? index + 1 : undefined}
        />
      );
    })}
  </StatCard>
);

export default PartnerChemistryCard;
