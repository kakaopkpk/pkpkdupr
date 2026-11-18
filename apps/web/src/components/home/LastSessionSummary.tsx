import React, { useMemo } from "react";
import type { AchievementDefinition } from "@pkpkdupr/shared/achievements";
import AchievementBadge from "@/components/profile/AchievementBadge";
import { RecordSessionCard } from "@/components/records/RecordCards";
import { Card } from "@/components/ui/Card";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { Section } from "@/components/ui/Section";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { getAchievementDefinition } from "@/lib/achievements";
import { formatKstShortDate } from "@/lib/format";
import type { MatchSessionReportInfo } from "@/lib/rankings";

/** 세션 리포트 업적 중 그 회원이 받은 업적 정의 */
export const getPlayerSessionAchievements = (
  report: Pick<MatchSessionReportInfo, "achievements">,
  playerId: string | undefined,
): AchievementDefinition[] =>
  playerId
    ? report.achievements.flatMap((item) => {
        const definition =
          item.playerId === playerId
            ? getAchievementDefinition(item.achievementId)
            : null;
        return definition ? [definition] : [];
      })
    : [];

/**
 * 그 세션에서 받은 내 새 업적. 누르면 업적 상세 시트를 연다.
 * 제목 "내 새 업적"은 titlePlacement가 "card"(기본)면 카드 안, "section"이면 카드 밖 Section 제목에 둔다
 */
export const MyNewAchievementsCard: React.FC<{
  playerId: string;
  achievements: readonly AchievementDefinition[];
  titlePlacement?: "card" | "section";
}> = ({ playerId, achievements, titlePlacement = "card" }) => {
  const { openAchievementDetail } = useAppNavigation();

  const card = (
    <Card>
      {titlePlacement === "card" ? (
        <h3 className="mt-3 text-pk-13 font-bold text-pk-sub">
          내 새 업적
        </h3>
      ) : null}
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

  if (titlePlacement === "card") return card;
  return <Section title="내 새 업적">{card}</Section>;
};

/**
 * 진행 중 세션이 없을 때 홈의 지난 세션 요약: 일정 탭 끝난 세션 카드 모양의 내 기록 카드와 그 아래 내 새 업적.
 * 가장 최근 세션에 내가 경기하지 않았으면 아무것도 보이지 않는다. 카드를 누르면 세션 리포트를 연다
 */
const LastSessionSummary: React.FC<{
  report: MatchSessionReportInfo;
  playerId: string | undefined;
}> = ({ report, playerId }) => {
  const { openSessionReport } = useAppNavigation();
  const { session } = report;

  const myReport = playerId
    ? report.players.find(
        (entry) => entry.player.id === playerId && entry.matchCount > 0,
      )
    : undefined;
  const myAchievements = useMemo(
    () => getPlayerSessionAchievements(report, playerId),
    [playerId, report],
  );

  if (!playerId || !myReport) return null;

  return (
    <Section>
      <RecordSessionCard
        session={session}
        mine={myReport}
        label="지난 세션 요약"
        meta={`${formatKstShortDate(session.date)} · ${session.participantCount}명`}
        onPress={() => openSessionReport(session.id)}
      />
      {myAchievements.length > 0 ? (
        <MyNewAchievementsCard
          playerId={playerId}
          achievements={myAchievements}
          titlePlacement="section"
        />
      ) : null}
    </Section>
  );
};

export default LastSessionSummary;
