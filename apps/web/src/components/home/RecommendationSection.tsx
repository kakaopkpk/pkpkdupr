import React from "react";
import {
  MATCHMAKING_PLAYERS_PER_COURT,
  type RecommendedCourt,
} from "@pkpkdupr/shared/matchmaking";
import SkeletonBlock from "@/components/SkeletonBlock";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { Section, TextLink } from "@/components/ui/Section";
import type { SessionWinStreakByPlayer } from "@/components/ui/PlayerAvatar";
import RecommendationCard from "./RecommendationCard";
import type { SessionRecommendationsState } from "./useSessionRecommendations";

export const getCourtKey = (court: RecommendedCourt) =>
  court.teams
    .flatMap((team) => team.players.map((player) => player.id))
    .join(":");

const RecommendationSkeleton: React.FC = () => (
  <Card className="flex flex-col gap-3 py-4">
    <SkeletonBlock className="h-24 w-full rounded-pk-sm" />
    <SkeletonBlock className="h-10 w-full rounded-pk-sm" />
  </Card>
);

/** "추천 매칭 · 대기 N명" 섹션. 추천 코트마다 카드 한 장이고 코트 번호는 보이지 않는다 */
const RecommendationSection: React.FC<{
  state: SessionRecommendationsState;
  waitingCount: number;
  /** 시작 요청 중인 추천 행 키 */
  startingKey: string | null;
  /** 시작에 실패한 행 키와 서버 문구 */
  startError: { key: string; message: string } | null;
  /** 든 회원 아바타에 세션 연승 링을 두른다 */
  sessionWinStreaks?: SessionWinStreakByPlayer;
  onStart: (court: RecommendedCourt) => void;
}> = ({
  state,
  waitingCount,
  startingKey,
  startError,
  sessionWinStreaks,
  onStart,
}) => {
  const { recommendation, status, error, isRerolling, recommendAgain } = state;

  const renderBody = () => {
    if (
      status === "loading" ||
      (status === "idle" && !recommendation) ||
      (isRerolling && !recommendation)
    ) {
      return <RecommendationSkeleton />;
    }
    if (status === "error" && !recommendation) {
      return (
        <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
          {error ?? "추천 매칭을 불러오지 못했어요."}
        </p>
      );
    }
    if (!recommendation || recommendation.courts.length === 0) {
      return (
        <Card className="py-4">
          <p className="text-pk-13 text-pk-sub">
            {`추천하려면 대기 중인 참여자가 ${MATCHMAKING_PLAYERS_PER_COURT}명 이상 필요해요.`}
          </p>
        </Card>
      );
    }

    return (
      <div
        aria-busy={isRerolling}
        className={cx(
          "flex flex-col gap-3 transition-opacity duration-150",
          isRerolling && "opacity-50",
        )}
      >
        {recommendation.courts.map((court) => {
          const key = getCourtKey(court);
          return (
            <RecommendationCard
              key={key}
              court={court}
              isStarting={startingKey === key}
              // 시작 요청 중에는 다른 추천도 막아 같은 선수가 두 경기에 들어가지 않게 한다.
              // 다시 추천을 받는 중에는 곧 바뀔 카드라 시작하지 않는다
              isStartDisabled={startingKey !== null || isRerolling}
              error={startError?.key === key ? startError.message : null}
              sessionWinStreaks={sessionWinStreaks}
              onStart={() => onStart(court)}
            />
          );
        })}
        {/* 다시 받기에 실패하면 보던 추천을 두고 실패만 알린다 */}
        {status === "error" ? (
          <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
            {error ?? "추천 매칭을 불러오지 못했어요."}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <Section
      title={`추천 매칭 · 대기 ${waitingCount}명`}
      right={
        startingKey === null ? (
          <>
            {/* 감점순 몇 번째 후보인지. 후보가 하나뿐이면 다시 추천해도 같아 숨긴다 */}
            {status === "ready" && recommendation && recommendation.candidateCount > 1 ? (
              <span className="mr-2 text-pk-13 font-medium text-pk-sub tabular-nums">
                {`${recommendation.rank + 1}/${recommendation.candidateCount}`}
              </span>
            ) : null}
            <TextLink onPress={recommendAgain}>다시 추천</TextLink>
          </>
        ) : null
      }
    >
      {renderBody()}
    </Section>
  );
};

export default RecommendationSection;
