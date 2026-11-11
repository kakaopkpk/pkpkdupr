import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Separator } from "@heroui/react";
import type { MatchScore } from "@pkpkdupr/shared/match";
import {
  getMatchTopLevelType,
  MATCH_RESULT_MAX_SCORE_COUNT,
  validateMatchScoresForMode,
} from "@pkpkdupr/shared/match";
import type { PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import BottomSheet from "@/components/BottomSheet";
import Match, { type MatchInfo } from "@/components/Match";
import CopyableId from "@/components/CopyableId";
import DetailPageHeader from "@/components/DetailPageHeader";
import RatingDeltaChip from "@/components/RatingDeltaChip";
import SkeletonBlock from "@/components/SkeletonBlock";
import UserChip from "@/components/UserChip";
import { type TabKey, useTabNavigation } from "@/context/TabNavigationContext";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { formatRating } from "@/utils/dupr";

interface MatchDetailProps {
  match: MatchInfo;
  tabKey?: TabKey;
  currentPlayerId?: string;
  onSubmitResult?: (matchId: string, scores: MatchScore[]) => Promise<void>;
  isOnline?: boolean;
  isSubmittingResult?: boolean;
  isLoading?: boolean;
}

const subTextClassName = "text-pkpk-sub-font";

const createEmptyScoreRow = () => ({ scoreA: "", scoreB: "" });
const SCORE_TABLE_SET_COUNT = 3;
const resultTeamChipWidthClass = "w-[clamp(6.6rem,35.2cqw,11rem)]";

type ScoreRow = ReturnType<typeof createEmptyScoreRow>;

const createScoreRows = (
  mode: MatchInfo["mode"],
  scores?: MatchScore[],
): ScoreRow[] => {
  if (mode === "best-of-3") {
    return Array.from({ length: MATCH_RESULT_MAX_SCORE_COUNT }, (_, index) => {
      const score = scores?.[index];
      return score
        ? { scoreA: String(score.scoreA), scoreB: String(score.scoreB) }
        : createEmptyScoreRow();
    });
  }

  return scores?.length
    ? scores.map((score) => ({
        scoreA: String(score.scoreA),
        scoreB: String(score.scoreB),
      }))
    : [createEmptyScoreRow()];
};

const getScoreRowWinner = (row: ScoreRow): 0 | 1 | null => {
  const scoreA = Number(row.scoreA);
  const scoreB = Number(row.scoreB);

  if (
    row.scoreA.trim() === "" ||
    row.scoreB.trim() === "" ||
    !Number.isInteger(scoreA) ||
    !Number.isInteger(scoreB) ||
    scoreA < 0 ||
    scoreB < 0 ||
    scoreA === scoreB
  ) {
    return null;
  }

  return scoreA > scoreB ? 0 : 1;
};

export const MatchDetailSkeleton: React.FC = () => (
  <div
    className="min-h-full"
    role="status"
    aria-label="매치 상세 로딩 중"
  >
    <DetailPageHeader title="Match Detail" tabKey="match" />
    <div className="p-2">
      <div className="mx-auto flex w-full flex-col gap-3">
        <Card className="rounded-3xl bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <SkeletonBlock className="size-10 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-3 w-48 max-w-full" />
              </div>
            </div>
            <SkeletonBlock className="h-5 w-10" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
          </div>
        </Card>

        <section>
          <p
            className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-sub-title"
          >
            Score
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-pkpk-sub-bg/30 bg-pkpk-primary-bg/5 p-3">
            <SkeletonBlock className="h-4 w-full" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="flex gap-2">
                  <SkeletonBlock className="h-7 w-2/5" />
                  <SkeletonBlock className="h-7 flex-1" />
                  <SkeletonBlock className="h-7 flex-1" />
                  <SkeletonBlock className="h-7 flex-1" />
                  <SkeletonBlock className="h-7 flex-1" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <p
            className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-sub-title"
          >
            Rating Change
          </p>
          <Card className="mt-3 rounded-xl border border-pkpk-sub-bg/30 bg-white/95 p-3">
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-4 w-24" />
                  <SkeletonBlock className="h-5 w-28" />
                </div>
              ))}
            </div>
          </Card>
        </section>

      </div>
    </div>
  </div>
);

const MatchDetailSectionsSkeleton: React.FC = () => (
  <div className="contents">
    <span className="sr-only" role="status">
      매치 상세 정보 로딩 중
    </span>
    <section>
      <p
        className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-sub-title"
      >
        Score
      </p>
      <div className="mt-1.5 overflow-hidden rounded-xl border border-pkpk-sub-bg/30 bg-pkpk-primary-bg/5 p-3">
        <SkeletonBlock className="h-4 w-full" />
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="flex gap-2">
              <SkeletonBlock className="h-7 w-2/5" />
              <SkeletonBlock className="h-7 flex-1" />
              <SkeletonBlock className="h-7 flex-1" />
              <SkeletonBlock className="h-7 flex-1" />
              <SkeletonBlock className="h-7 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </section>

    <section>
      <p
        className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-sub-title"
      >
        Rating Change
      </p>
      <Card className="mt-1.5 rounded-xl border border-pkpk-sub-bg/30 bg-white/95 p-3">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-5 w-28" />
            </div>
          ))}
        </div>
      </Card>
    </section>

  </div>
);

const MatchDetail: React.FC<MatchDetailProps> = ({
  match,
  tabKey = "match",
  currentPlayerId,
  onSubmitResult,
  isOnline = true,
  isSubmittingResult = false,
  isLoading = false,
}) => {
  const [scoreRows, setScoreRows] = useState(() =>
    createScoreRows(match.mode, match.scores),
  );
  const [resultError, setResultError] = useState<string | null>(null);
  const isSectionsLoading = useMinimumLoading(isLoading);
  const [isResultSheetOpen, setIsResultSheetOpen] = useState(false);
  const { closeDepth, pushDepth, selectedTab } = useTabNavigation();
  const isCreator = match.creatorPlayerId === currentPlayerId;
  const hasResultScores = !!match.scores?.length;
  const canSubmitResult =
    match.status === "created" &&
    !match.session &&
    isCreator &&
    isOnline &&
    !!onSubmitResult;
  const resultActionLabel = hasResultScores ? "결과 수정" : "결과 입력";
  const resultSheetDepthId = `match-result-sheet:${match.id}`;
  const isBestOfThree = match.mode === "best-of-3";
  const firstTwoSetWinners = scoreRows.slice(0, 2).map(getScoreRowWinner);
  const isThirdSetEnabled =
    isBestOfThree &&
    firstTwoSetWinners.length === 2 &&
    firstTwoSetWinners[0] !== null &&
    firstTwoSetWinners[1] !== null &&
    firstTwoSetWinners[0] !== firstTwoSetWinners[1];
  const submittedScoreRows =
    isBestOfThree && !isThirdSetEnabled ? scoreRows.slice(0, 2) : scoreRows;
  const isResultScoreValid = (() => {
    const scores = submittedScoreRows.map((row) => ({
      scoreA: Number(row.scoreA),
      scoreB: Number(row.scoreB),
    }));

    if (
      scores.length > MATCH_RESULT_MAX_SCORE_COUNT ||
      submittedScoreRows.some((row) => getScoreRowWinner(row) === null)
    ) {
      return false;
    }

    try {
      validateMatchScoresForMode(match.mode, scores);
      return true;
    } catch {
      return false;
    }
  })();
  const totalPoints = useMemo(
    () =>
      (match.scores ?? []).reduce<[number, number]>(
        ([totalA, totalB], score) => [
          totalA + score.scoreA,
          totalB + score.scoreB,
        ],
        [0, 0],
      ),
    [match.scores],
  );
  const ratingChangeByPlayerId = useMemo(
    () =>
      new Map<string, PlayerRatingChangeLog>(
        (match.ratingChanges ?? []).map((change) => [change.playerId, change]),
      ),
    [match.ratingChanges],
  );
  const ratingCategory = useMemo(
    () =>
      getMatchTopLevelType(match.type) === "singles"
        ? ("singles" as const)
        : ("doubles" as const),
    [match.type],
  );
  const hasRatingChanges =
    match.status === "completed" && (match.ratingChanges?.length ?? 0) > 0;

  useEffect(() => {
    setScoreRows(createScoreRows(match.mode, match.scores));
    setResultError(null);
    setIsResultSheetOpen(false);
  }, [match.id, match.mode, match.scores]);

  const updateScoreRow = (
    index: number,
    field: keyof ReturnType<typeof createEmptyScoreRow>,
    value: string,
  ) => {
    setScoreRows((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  const openResultSheet = () => {
    if (!canSubmitResult) return;

    pushDepth(tabKey, {
      id: resultSheetDepthId,
      kind: "bottom-sheet",
      onClose: () => setIsResultSheetOpen(false),
    });
    setResultError(null);
    setIsResultSheetOpen(true);
  };

  const closeResultSheet = () => {
    if (!closeDepth(tabKey, resultSheetDepthId)) {
      setIsResultSheetOpen(false);
    }
  };

  const handleResultSheetOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      openResultSheet();
      return;
    }

    closeResultSheet();
  };

  const handleSubmitResult = async () => {
    if (!onSubmitResult) return;

    try {
      if (submittedScoreRows.length > MATCH_RESULT_MAX_SCORE_COUNT) {
        throw new Error(
          `스코어는 최대 ${MATCH_RESULT_MAX_SCORE_COUNT}개까지 입력할 수 있어요.`,
        );
      }

      const scores = submittedScoreRows.map((row, index) => {
        const scoreA = Number(row.scoreA);
        const scoreB = Number(row.scoreB);

        if (
          row.scoreA.trim() === "" ||
          row.scoreB.trim() === "" ||
          !Number.isInteger(scoreA) ||
          !Number.isInteger(scoreB) ||
          scoreA < 0 ||
          scoreB < 0 ||
          scoreA === scoreB
        ) {
          throw new Error(`${index + 1}번째 스코어를 확인해주세요.`);
        }

        return { scoreA, scoreB };
      });

      validateMatchScoresForMode(match.mode, scores);
      setResultError(null);
      await onSubmitResult(match.id, scores);
      closeResultSheet();
    } catch (err) {
      setResultError(
        err instanceof Error ? err.message : "결과를 입력하지 못했어요.",
      );
    }
  };

  return (
    <div className="min-h-full">
      <DetailPageHeader title="Match Detail" tabKey={tabKey} />
      <div className="p-2">
        <div className="mx-auto flex w-full flex-col gap-3">
          <Match
            match={match}
            currentPlayerId={currentPlayerId}
            headerRightContent={
              <div className="flex max-w-24 items-center gap-1.5">
                <span
                  className={`shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide ${subTextClassName}`}
                >
                  ID
                </span>
                <CopyableId
                  label="Match ID"
                  value={match.id}
                  showLabel={false}
                />
              </div>
            }
            showChevron={false}
          />

          {isSectionsLoading ? <MatchDetailSectionsSkeleton /> : null}
          <div
            className={
              isSectionsLoading
                ? "hidden"
                : "flex flex-col gap-3"
            }
          >
            <section>
            <p
              className="px-1 text-[clamp(1rem,4.5cqw,1.25rem)] font-semibold tracking-wide text-pkpk-sub-title"
            >
              스코어
            </p>
            <div className="mt-1.5 overflow-hidden rounded-xl border border-pkpk-sub-bg/30 bg-pkpk-primary-bg/5">
              <table className="w-full table-fixed border-collapse text-sm text-pkpk-sub-font">
                <colgroup>
                  <col className="w-[40%]" />
                  {Array.from({ length: SCORE_TABLE_SET_COUNT }, (_, index) => (
                    <col key={index} />
                  ))}
                  <col />
                </colgroup>
                <thead className="bg-pkpk-primary-bg/15 text-xs font-semibold text-pkpk-primary-bg">
                  <tr>
                    <th
                      scope="col"
                      className="border-r border-pkpk-primary-bg/20 px-2 py-2 text-left"
                    >
                      Sets
                    </th>
                    {Array.from(
                      { length: SCORE_TABLE_SET_COUNT },
                      (_, index) => (
                        <th
                          key={index}
                          scope="col"
                          className="border-r border-pkpk-primary-bg/20 px-1 py-2 text-center"
                        >
                          {index + 1}
                        </th>
                      ),
                    )}
                    <th scope="col" className="px-1 py-2 text-center">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {match.teams.map((team, teamIndex) => (
                    <tr key={team.id} className="border-t border-pkpk-primary-bg/20">
                      <th
                        scope="row"
                        className="border-r border-pkpk-primary-bg/20 px-2 py-1.5 text-left font-semibold"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          {team.players.map((player) => (
                            <span key={player.id} className="truncate">
                              {player.username}
                            </span>
                          ))}
                        </div>
                      </th>
                      {Array.from(
                        { length: SCORE_TABLE_SET_COUNT },
                        (_, scoreIndex) => {
                          const score = match.scores?.[scoreIndex];
                          const value = score
                            ? teamIndex === 0
                              ? score.scoreA
                              : score.scoreB
                            : "-";

                          return (
                            <td
                              key={scoreIndex}
                              className="border-r border-pkpk-primary-bg/20 bg-white/80 px-1 py-1.5 text-center font-medium tabular-nums"
                            >
                              {value}
                            </td>
                          );
                        },
                      )}
                      <td className="bg-white/80 px-1 py-1.5 text-center text-base font-bold tabular-nums">
                        {hasResultScores ? totalPoints[teamIndex] : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canSubmitResult ? (
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-2xl text-[#409eff]"
                  onPress={openResultSheet}
                >
                  {hasResultScores ? "수정" : "결과 입력"}
                </Button>
              </div>
            ) : null}
            </section>

            <section>
            <p
              className="px-1 text-[clamp(1rem,4.5cqw,1.25rem)] font-semibold tracking-wide text-pkpk-sub-title"
            >
              평점 변동
            </p>
            <Card className="mt-1.5 rounded-xl border border-pkpk-sub-bg/30 bg-white/95 p-3">
              {hasRatingChanges ? (
                (() => {
                  const entries = match.teams
                    .flatMap((team) => team.players)
                    .flatMap((player) => {
                      const change = ratingChangeByPlayerId.get(player.id);
                      return change ? [{ player, change }] : [];
                    });

                  return entries.map(({ player, change }, index) => {
                    const previous = change.previousRating[ratingCategory];
                    const next = change.nextRating[ratingCategory];
                    const delta = change.delta[ratingCategory];

                    return (
                      <React.Fragment key={player.id}>
                        <div className="flex items-center justify-between gap-3 py-0">
                          <p
                            className={`min-w-0 truncate text-sm ${
                              player.id === currentPlayerId
                                ? "font-bold text-slate-900"
                                : "font-medium text-slate-900"
                            }`}
                          >
                            {player.username}
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 text-right text-xs font-medium tabular-nums text-slate-900">
                              {formatRating(previous)}
                              <span className="mx-1 text-slate-400">→</span>
                              <span className="font-semibold text-pkpk-dupr-font">
                                {formatRating(next)}
                              </span>
                            </div>
                            <RatingDeltaChip delta={delta} />
                          </div>
                        </div>
                        {index < entries.length - 1 ? (
                          <Separator className="-mx-3 w-[calc(100%+1.5rem)]" />
                        ) : null}
                      </React.Fragment>
                    );
                  });
                })()
              ) : (
                <p className="text-sm text-pkpk-sub-font">
                  결과를 기록하면 평점 변동이 표시돼요.
                </p>
              )}
            </Card>
            </section>

            {!isResultSheetOpen && resultError ? (
            <p className="text-xs font-medium text-red-500">{resultError}</p>
            ) : null}

          </div>
        </div>
      </div>
      <BottomSheet
        isOpen={isResultSheetOpen}
        isActive={selectedTab === tabKey}
        onOpenChange={handleResultSheetOpenChange}
        ariaLabel={hasResultScores ? "경기 결과 수정" : "경기 결과 입력"}
        className="[container-type:inline-size]"
        layer={80}
      >
        <BottomSheet.Header>
          <h2 className="bs-text-head text-pkpk-main-font">
            {hasResultScores ? "경기 결과 수정" : "경기 결과 입력"}
          </h2>
        </BottomSheet.Header>
        <BottomSheet.Body>
          <div className="flex flex-col">
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_1rem_minmax(0,1fr)] items-end gap-2">
              <span aria-hidden="true" />
              {match.teams.map((team, teamIndex) => (
                <React.Fragment key={team.id}>
                  {teamIndex === 1 ? <span aria-hidden="true" /> : null}
                  <div className="flex min-w-0 flex-col items-center gap-1">
                    <p className="w-full text-center bs-text-caption font-semibold text-pkpk-sub-font">
                      {teamIndex === 0 ? "A팀" : "B팀"}
                    </p>
                    <div className="flex w-full flex-col items-center gap-1">
                      {team.players.map((player) => (
                        <UserChip
                          key={player.id}
                          player={player}
                          isMe={player.id === currentPlayerId}
                          size="match"
                          chipWidthClass={resultTeamChipWidthClass}
                          isMirrored={teamIndex === 1}
                        />
                      ))}
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
            <div className="mt-[1.2rem] flex flex-col gap-[0.84rem]">
              {scoreRows.map((row, index) => {
                const isThirdSet = isBestOfThree && index === 2;
                const isSetDisabled = isThirdSet && !isThirdSetEnabled;

                return (
                  <div
                    key={index}
                    aria-disabled={isSetDisabled}
                    className="grid grid-cols-[2.5rem_minmax(0,1fr)_1rem_minmax(0,1fr)] items-center gap-2"
                  >
                    <span
                      className={`text-xs font-semibold ${
                        isSetDisabled
                          ? "text-pkpk-detail-font"
                          : "text-[#888]"
                      }`}
                    >
                      Set {index + 1}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={row.scoreA}
                      onChange={(event) =>
                        updateScoreRow(index, "scoreA", event.target.value)
                      }
                      disabled={isSetDisabled}
                      className="app-mobile-input min-w-0 w-full rounded-xl border border-border px-3 py-2 text-center text-base font-semibold text-pkpk-sub-font outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-pkpk-detail-font"
                      placeholder="점수"
                      aria-label={`G${index + 1} A팀 점수`}
                    />
                    <span
                      className={`text-center text-sm font-semibold ${
                        isSetDisabled
                          ? "text-pkpk-detail-font"
                          : "text-[#888]"
                      }`}
                    >
                      :
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={row.scoreB}
                      onChange={(event) =>
                        updateScoreRow(index, "scoreB", event.target.value)
                      }
                      disabled={isSetDisabled}
                      className="app-mobile-input min-w-0 w-full rounded-xl border border-border px-3 py-2 text-center text-base font-semibold text-pkpk-sub-font outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-pkpk-detail-font"
                      placeholder="점수"
                      aria-label={`G${index + 1} B팀 점수`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {resultError ? (
            <p className="text-xs font-medium text-red-500">{resultError}</p>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              className="app-action-button w-full rounded-2xl bg-slate-100 font-semibold text-pkpk-sub-font"
              onPress={closeResultSheet}
              isDisabled={isSubmittingResult}
            >
              취소
            </Button>
            <Button
              className="app-action-button w-full rounded-2xl bg-[#409eff] font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
              onPress={() => void handleSubmitResult()}
              isDisabled={isSubmittingResult || !isResultScoreValid}
            >
              {isSubmittingResult ? "입력 중..." : resultActionLabel}
            </Button>
          </div>
        </BottomSheet.Body>
      </BottomSheet>
    </div>
  );
};

export default MatchDetail;
