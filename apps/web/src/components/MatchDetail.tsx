import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Separator } from "@heroui/react";
import {
  getMatchTopLevelType,
  canEditMatchRecord,
  isWithinMatchEditWindow,
} from "@pkpkdupr/shared/match";
import type { PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import BottomSheet from "@/components/BottomSheet";
import Match, { type MatchInfo } from "@/components/Match";
import CopyableId from "@/components/CopyableId";
import DetailPageHeader from "@/components/DetailPageHeader";
import RatingDeltaChip from "@/components/RatingDeltaChip";
import RecordMatchDrawerBody from "@/components/RecordMatchDrawerBody";
import SkeletonBlock from "@/components/SkeletonBlock";
import { type TabKey, useTabNavigation } from "@/context/TabNavigationContext";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { formatRating } from "@/utils/dupr";

interface MatchDetailProps {
  match: MatchInfo;
  tabKey?: TabKey;
  currentPlayerId?: string;
  /** 기록 시트에서 저장할 때마다 호출한다. "한 판 더"로 만든 다른 경기도 넘어온다 */
  onMatchRecorded?: (match: MatchInfo) => void;
  isOnline?: boolean;
  isLoading?: boolean;
}

const subTextClassName = "text-pkpk-sub-font";
const SCORE_TABLE_SET_COUNT = 3;

export const MatchDetailSkeleton: React.FC = () => (
  <div className="min-h-full" role="status" aria-label="매치 상세 로딩 중">
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
          <p className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-sub-title">
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
          <p className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-sub-title">
            Rating Change
          </p>
          <Card className="mt-3 rounded-xl border border-pkpk-sub-bg/30 bg-white/95 p-3">
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3"
                >
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
      <p className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-sub-title">
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
      <p className="px-1 text-[clamp(1.1rem,5cqw,1.45rem)] font-semibold uppercase tracking-wide text-pkpk-sub-title">
        Rating Change
      </p>
      <Card className="mt-1.5 rounded-xl border border-pkpk-sub-bg/30 bg-white/95 p-3">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3"
            >
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
  onMatchRecorded,
  isOnline = true,
  isLoading = false,
}) => {
  const isSectionsLoading = useMinimumLoading(isLoading);
  const [isResultSheetOpen, setIsResultSheetOpen] = useState(false);
  // 시트를 열 때마다 RecordMatchDrawerBody를 리마운트해 최신 경기 값으로 채운다
  const [resultSheetKey, setResultSheetKey] = useState(0);
  const { closeDepth, pushDepth, selectedTab } = useTabNavigation();
  const isEditor =
    !!currentPlayerId && canEditMatchRecord(match, currentPlayerId);
  const hasResultScores = !!match.scores?.length;
  // 기한이 지나는 순간을 따로 감시하지 않는다. 열어 둔 채 지나면 서버가 거절한다
  const canEditRecord =
    isEditor &&
    match.status !== "cancelled" &&
    isWithinMatchEditWindow(new Date(match.matchStartsAt)) &&
    isOnline &&
    !!onMatchRecorded;
  const resultSheetDepthId = `match-result-sheet:${match.id}`;
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

  // 저장 후 같은 경기의 값만 바뀔 때는 완료 화면을 보여 주도록 시트를 유지한다
  useEffect(() => {
    setIsResultSheetOpen(false);
  }, [match.id]);

  const openResultSheet = () => {
    if (!canEditRecord) return;

    pushDepth(tabKey, {
      id: resultSheetDepthId,
      kind: "bottom-sheet",
      onClose: () => setIsResultSheetOpen(false),
    });
    setResultSheetKey((key) => key + 1);
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
          <div className={isSectionsLoading ? "hidden" : "flex flex-col gap-3"}>
            <section>
              <p className="px-1 text-[clamp(1rem,4.5cqw,1.25rem)] font-semibold tracking-wide text-pkpk-sub-title">
                스코어
              </p>
              <div className="mt-1.5 overflow-hidden rounded-xl border border-pkpk-sub-bg/30 bg-pkpk-primary-bg/5">
                <table className="w-full table-fixed border-collapse text-sm text-pkpk-sub-font">
                  <colgroup>
                    <col className="w-[40%]" />
                    {Array.from(
                      { length: SCORE_TABLE_SET_COUNT },
                      (_, index) => (
                        <col key={index} />
                      ),
                    )}
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
                      <tr
                        key={team.id}
                        className="border-t border-pkpk-primary-bg/20"
                      >
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
              {canEditRecord ? (
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
              <p className="px-1 text-[clamp(1rem,4.5cqw,1.25rem)] font-semibold tracking-wide text-pkpk-sub-title">
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
          </div>
        </div>
      </div>
      <BottomSheet
        isOpen={isResultSheetOpen}
        isActive={selectedTab === tabKey}
        onOpenChange={handleResultSheetOpenChange}
        ariaLabel="Record match"
        layer={80}
        isFixedHeight
      >
        <RecordMatchDrawerBody
          key={resultSheetKey}
          editMatch={match}
          isOnline={isOnline}
          onCancel={closeResultSheet}
          onRecorded={(recordedMatch) => onMatchRecorded?.(recordedMatch)}
          onDone={closeResultSheet}
        />
      </BottomSheet>
    </div>
  );
};

export default MatchDetail;
