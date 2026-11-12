import React from "react";
import {
  MATCHMAKING_PLAYERS_PER_COURT,
  type RecommendedCourt,
} from "@pkpkdupr/shared/matchmaking";
import SkeletonBlock from "@/components/SkeletonBlock";
import { Card } from "@/components/ui/Card";
import { SectionLabel, TextLink } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import { TeamsVersus } from "./TeamBlock";
import type { SessionRecommendationsState } from "./useSessionRecommendations";

const rowDividerClassName =
  "not-last:shadow-[inset_0_-1px_0_var(--color-pk-divider)]";

export const getCourtKey = (court: RecommendedCourt) =>
  court.teams
    .flatMap((team) => team.players.map((player) => player.id))
    .join(":");

const RecommendationRow: React.FC<{
  court: RecommendedCourt;
  isStarting: boolean;
  isStartDisabled: boolean;
  error: string | null;
  onStart: () => void;
}> = ({ court, isStarting, isStartDisabled, error, onStart }) => (
  <div className={cx("flex flex-col gap-2.5 py-3.5", rowDividerClassName)}>
    <TeamsVersus teams={[court.teams[0].players, court.teams[1].players]} />
    <div className="flex items-center justify-between gap-2">
      <span className="text-pk-12 text-pk-muted tabular-nums">
        팀 평균 {court.teams[0].averageRating.toFixed(2)} :{" "}
        {court.teams[1].averageRating.toFixed(2)}
      </span>
      {/* 연한 파랑 36px·둥글기 12px·13/800. PkButton sm(알약·700)과 모양이 달라 직접 그린다 */}
      <button
        type="button"
        disabled={isStartDisabled}
        onClick={onStart}
        className="inline-flex h-9 shrink-0 select-none items-center justify-center whitespace-nowrap rounded-pk-sm bg-pk-primary-soft px-4 text-pk-13 font-extrabold text-pk-primary transition-opacity touch-manipulation active:opacity-80 disabled:cursor-not-allowed disabled:bg-pk-neutral disabled:text-pk-muted disabled:active:opacity-100"
      >
        {isStarting ? "시작하는 중…" : "시작"}
      </button>
    </div>
    {error ? (
      <p role="alert" className="text-pk-13 font-medium text-pk-down">
        {error}
      </p>
    ) : null}
  </div>
);

const RecommendationSkeleton: React.FC = () => (
  <Card className="flex flex-col gap-3 py-4">
    <SkeletonBlock className="h-10 w-full rounded-pk-sm" />
    <SkeletonBlock className="h-10 w-full rounded-pk-sm" />
  </Card>
);

/** "추천 매칭 · 대기 N명" 섹션. 코트 번호는 보이지 않는다 */
const RecommendationSection: React.FC<{
  state: SessionRecommendationsState;
  waitingCount: number;
  /** 시작 요청 중인 추천 행 키 */
  startingKey: string | null;
  /** 시작에 실패한 행 키와 서버 문구 */
  startError: { key: string; message: string } | null;
  onStart: (court: RecommendedCourt) => void;
}> = ({ state, waitingCount, startingKey, startError, onStart }) => {
  const { recommendation, status, error, recommendAgain } = state;

  const renderBody = () => {
    if (status === "loading" || (status === "idle" && !recommendation)) {
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
      <Card>
        {recommendation.courts.map((court) => {
          const key = getCourtKey(court);
          return (
            <RecommendationRow
              key={key}
              court={court}
              isStarting={startingKey === key}
              // 시작 요청 중에는 다른 추천도 막아 같은 선수가 두 경기에 들어가지 않게 한다
              isStartDisabled={startingKey !== null}
              error={startError?.key === key ? startError.message : null}
              onStart={() => onStart(court)}
            />
          );
        })}
      </Card>
    );
  };

  return (
    <>
      <SectionLabel
        right={
          startingKey === null ? (
            <TextLink onPress={recommendAgain}>다시 추천</TextLink>
          ) : null
        }
      >
        추천 매칭 · 대기 {waitingCount}명
      </SectionLabel>
      {renderBody()}
    </>
  );
};

export default RecommendationSection;
