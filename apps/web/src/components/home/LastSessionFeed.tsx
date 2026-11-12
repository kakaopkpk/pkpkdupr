import React, { useMemo } from "react";
import type { AchievementDefinition } from "@pkpkdupr/shared/achievements";
import LastSessionMeCard from "@/components/home/LastSessionMeCard";
import AchievementBadge from "@/components/profile/AchievementBadge";
import { TopRiserCard } from "@/components/records/SessionReportParts";
import { Card } from "@/components/ui/Card";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { SectionLabel, TextLink } from "@/components/ui/Section";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { getAchievementDefinition } from "@/lib/achievements";
import { formatKstShortDate } from "@/lib/format";
import type { MatchSessionReportInfo } from "@/lib/rankings";

/** 그 세션에서 받은 내 새 업적. 누르면 업적 상세 시트를 연다 */
const MyNewAchievementsCard: React.FC<{
  playerId: string;
  achievements: readonly AchievementDefinition[];
}> = ({ playerId, achievements }) => {
  const { openAchievementDetail } = useAppNavigation();

  return (
    <Card>
      <h3 className="mt-3 text-pk-13 font-bold text-pk-sub">
        내 새 업적 {achievements.length}개
      </h3>
      {achievements.map((definition) => (
        <button
          key={definition.id}
          type="button"
          onClick={() =>
            openAchievementDetail({ playerId, achievementId: definition.id })
          }
          className="flex min-h-14 w-full items-center gap-3 py-2 text-left not-last:border-b not-last:border-pk-divider active:opacity-80"
        >
          <AchievementBadge achievement={definition} earned size={36} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-pk-15 font-bold text-pk-ink">
              {definition.name}
            </span>
            <span className="truncate text-pk-13 text-pk-muted">
              {definition.condition}
            </span>
          </span>
          <ChevronRightIcon />
        </button>
      ))}
    </Card>
  );
};

/**
 * 진행 중 세션이 없을 때 홈의 지난 세션 피드.
 * 머리(이름·날짜·인원·경기 수) 아래 세션 지배자 → 내 복식 평점 변동 → 내 새 업적 순으로, 해당 데이터가 있는 카드만 보인다.
 */
const LastSessionFeed: React.FC<{
  report: MatchSessionReportInfo;
  playerId: string | undefined;
}> = ({ report, playerId }) => {
  const { openSessionReport } = useAppNavigation();
  const { session, topRiser } = report;

  const myReport = playerId
    ? report.players.find(
        (entry) => entry.player.id === playerId && entry.matchCount > 0,
      )
    : undefined;
  const myAchievements = useMemo(
    () =>
      playerId
        ? report.achievements.flatMap((item) => {
            const definition =
              item.playerId === playerId
                ? getAchievementDefinition(item.achievementId)
                : null;
            return definition ? [definition] : [];
          })
        : [],
    [playerId, report.achievements],
  );

  return (
    <>
      <div className="flex flex-col pb-1">
        <SectionLabel
          right={
            <TextLink onPress={() => openSessionReport(session.id)} chevron>
              리포트
            </TextLink>
          }
        >
          지난 세션
        </SectionLabel>
        <div className="flex flex-col gap-0.5 px-1">
          <h3 className="truncate text-pk-17 font-extrabold text-pk-ink">
            {session.name}
          </h3>
          <span className="text-pk-13 text-pk-sub tabular-nums">
            {[
              formatKstShortDate(session.date),
              `${session.participantCount}명`,
              `${session.matchCount}경기`,
            ].join(" · ")}
          </span>
        </div>
      </div>
      {topRiser ? <TopRiserCard report={topRiser} /> : null}
      {myReport ? <LastSessionMeCard report={myReport} /> : null}
      {playerId && myAchievements.length > 0 ? (
        <MyNewAchievementsCard
          playerId={playerId}
          achievements={myAchievements}
        />
      ) : null}
    </>
  );
};

export default LastSessionFeed;
