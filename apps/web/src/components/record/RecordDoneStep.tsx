import React, { useMemo } from "react";
import { getMatchTopLevelType } from "@pkpkdupr/shared/match";
import type { PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import BottomSheet from "@/components/BottomSheet";
import type { MatchInfo } from "@/types/match";
import { PkButton } from "@/components/ui/Button";
import { RatingDelta } from "@/components/ui/Delta";
import { PlayerAvatar, TeamAvatars } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import { formatRating } from "@/utils/dupr";
import { CheckIcon, FooterError } from "./RecordMatchParts";

export interface RecordDoneStepProps {
  match: MatchInfo;
  /** 진행 중 세션이 있으면 "같은 멤버로 바로 시작"·"세션으로 돌아가기" */
  hasLiveSession: boolean;
  isBusy: boolean;
  error: string | null;
  /** 세션: 같은 팀으로 진행 중 경기 시작. 세션 없음: 같은 선수로 점수 입력 다시 열기 */
  onPlayAgain: () => void;
  /** 세션: 홈으로 돌아가기. 세션 없음: 닫기 */
  onDone: () => void;
}

export default function RecordDoneStep({
  match,
  hasLiveSession,
  isBusy,
  error,
  onPlayAgain,
  onDone,
}: RecordDoneStepProps): React.ReactElement {
  const score = match.scores?.[0];
  const ratingCategory = getMatchTopLevelType(match.type);
  const ratingRows = useMemo(() => {
    const changeByPlayerId = new Map<string, PlayerRatingChangeLog>(
      (match.ratingChanges ?? []).map((change) => [change.playerId, change]),
    );

    return match.teams
      .flatMap((team) => team.players)
      .flatMap((teamPlayer) => {
        const change = changeByPlayerId.get(teamPlayer.id);
        return change ? [{ player: teamPlayer, change }] : [];
      });
  }, [match]);

  return (
    <>
      <BottomSheet.Header>
        <div className="flex flex-col gap-0.5 px-1 pt-0.5">
          <h2 className="flex items-center gap-1.5 text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink">
            <CheckIcon size={22} className="text-pk-up" />
            기록했어요
          </h2>
          {match.session?.name ? (
            <p className="text-pk-13 text-pk-sub">{match.session.name}</p>
          ) : null}
        </div>
      </BottomSheet.Header>
      <BottomSheet.Body className="pb-2">
        {score ? (
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <ScoreSide
              players={match.teams[0].players}
              isWinner={score.scoreA > score.scoreB}
            />
            <div className="font-num text-[64px] leading-none font-bold tabular-nums">
              <span
                className={
                  score.scoreA > score.scoreB ? "text-pk-primary" : "text-pk-muted"
                }
              >
                {score.scoreA}
              </span>
              <span className="px-2 text-[#c5ccda]">:</span>
              <span
                className={
                  score.scoreB > score.scoreA ? "text-pk-primary" : "text-pk-muted"
                }
              >
                {score.scoreB}
              </span>
            </div>
            <ScoreSide
              players={match.teams[1].players}
              isWinner={score.scoreB > score.scoreA}
            />
          </div>
        ) : null}
        {ratingRows.length > 0 ? (
          <div className="shrink-0 rounded-pk-lg bg-pk-bg px-4 py-1">
            <h3 className="mt-3 mb-0.5 text-pk-13 font-bold text-pk-sub">
              평점 변화
            </h3>
            {ratingRows.map(({ player, change }) => (
              <div
                key={player.id}
                className="grid grid-cols-[24px_minmax(0,1fr)_auto_60px] items-center gap-2.5 py-[11px] not-last:border-b not-last:border-[#e6e9f0]"
              >
                <PlayerAvatar player={player} size={24} />
                <span className="truncate text-pk-15 font-bold">
                  {player.username}
                </span>
                <span className="text-pk-13 tabular-nums text-pk-sub">
                  {formatRating(change.previousRating[ratingCategory])} →{" "}
                  {formatRating(change.nextRating[ratingCategory])}
                </span>
                <RatingDelta
                  value={change.delta[ratingCategory]}
                  className="text-right"
                />
              </div>
            ))}
          </div>
        ) : null}
      </BottomSheet.Body>
      <BottomSheet.Footer className="-mx-4 border-t border-pk-divider px-4">
        <FooterError message={error} />
        <div className="grid grid-cols-2 gap-2">
          <PkButton
            variant="soft"
            size="lg"
            fullWidth
            disabled={isBusy}
            onClick={onPlayAgain}
          >
            {hasLiveSession ? "같은 멤버로 바로 시작" : "같은 멤버로 한 판 더"}
          </PkButton>
          <PkButton size="lg" fullWidth disabled={isBusy} onClick={onDone}>
            {hasLiveSession ? "세션으로 돌아가기" : "닫기"}
          </PkButton>
        </div>
      </BottomSheet.Footer>
    </>
  );
}

const ScoreSide: React.FC<{
  players: MatchInfo["teams"][number]["players"];
  isWinner: boolean;
}> = ({ players, isWinner }) => (
  <div className="flex min-w-0 flex-col items-center gap-1.5">
    <TeamAvatars players={players} size={32} />
    <span
      className={cx(
        "flex max-w-full flex-col items-center text-pk-13 leading-[1.35]",
        isWinner ? "font-bold text-pk-ink" : "font-medium text-pk-sub",
      )}
    >
      {players.map((player) => (
        <span key={player.id} className="max-w-full truncate">
          {player.username}
        </span>
      ))}
    </span>
  </div>
);
