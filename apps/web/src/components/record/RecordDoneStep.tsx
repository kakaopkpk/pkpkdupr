import React, { useMemo } from "react";
import { getMatchTopLevelType } from "@pkpkdupr/shared/match";
import type { PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import BottomSheet from "@/components/BottomSheet";
import { AchievementBadge } from "@/components/profile/AchievementBadge";
import type { MatchInfo } from "@/types/match";
import { PkButton } from "@/components/ui/Button";
import { RatingDelta } from "@/components/ui/Delta";
import { PlayerAvatar, TeamAvatars } from "@/components/ui/PlayerAvatar";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useCountUp } from "@/hooks/useCountUp";
import { usePlayOnce } from "@/hooks/usePlayOnce";
import { getAchievementDefinition } from "@/lib/achievements";
import { formatRating } from "@/utils/dupr";
import { CheckIcon, FooterError } from "./RecordMatchParts";

/*
 * 완료 화면 연출 시각(ms, 완료 단계 마운트 기준).
 * 체크 그리기 0 → 점수 세기 100(450) → 이긴 쪽 색 전환 → 평점 세기 650(500) → 업적 띠 1150
 */
const SCORE_COUNT_DELAY_MS = 100;
const SCORE_COUNT_DURATION_MS = 450;
const RATING_COUNT_DELAY_MS = 650;
const RATING_COUNT_DURATION_MS = 500;
const ACHIEVEMENT_DELAY_MS = 1150;

export interface RecordDoneStepProps {
  match: MatchInfo;
  isBusy: boolean;
  /** 버튼 위에 보일 서버 문구(같은 선수가 다른 경기 중이면 409 문구) */
  error: string | null;
  /** 같은 팀으로 진행 중 경기를 시작한다(세션과 상관없음) */
  onPlayAgain: () => void;
  /** 시트를 닫는다 */
  onDone: () => void;
}

export default function RecordDoneStep({
  match,
  isBusy,
  error,
  onPlayAgain,
  onDone,
}: RecordDoneStepProps): React.ReactElement {
  const { player: viewer } = useAuth();
  const { openAchievementDetail } = useAppNavigation();
  // 업적 상세 시트를 열었다 닫는 등으로 다시 보여도 CSS 연출이 재생되지 않게 한 번만 붙인다
  const { isPlaying, finish } = usePlayOnce();
  const score = match.scores?.[0];
  const scoreACount = useCountUp(score?.scoreA ?? 0, {
    durationMs: SCORE_COUNT_DURATION_MS,
    delayMs: SCORE_COUNT_DELAY_MS,
  });
  const scoreBCount = useCountUp(score?.scoreB ?? 0, {
    durationMs: SCORE_COUNT_DURATION_MS,
    delayMs: SCORE_COUNT_DELAY_MS,
  });
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
  // 참가자 전원이 받은 업적 중 내 것만 띠로 보인다
  const myNewAchievements = useMemo(
    () =>
      viewer
        ? (match.newAchievements ?? []).flatMap((item) => {
            const definition =
              item.playerId === viewer.id
                ? getAchievementDefinition(item.achievementId)
                : null;
            return definition ? [definition] : [];
          })
        : [],
    [match.newAchievements, viewer],
  );

  return (
    <>
      {/* 제목까지 본문에 넣어 그랩바 아래 전부가 함께 스크롤된다 */}
      <BottomSheet.Body className="pb-2">
        <div className="flex shrink-0 flex-col gap-0.5 px-1 pt-0.5">
          <h2
            className="flex items-center gap-1.5 text-pk-22 font-extrabold tracking-[-0.02em] text-pk-ink"
            onAnimationEnd={() => {
              // 업적 띠가 없으면 체크 그리기가 마지막 CSS 연출이다
              if (myNewAchievements.length === 0) finish();
            }}
          >
            <CheckIcon size={22} className="text-pk-up" draw={isPlaying} />
            기록했어요
          </h2>
          {match.session?.name ? (
            <p className="text-pk-13 text-pk-sub">{match.session.name}</p>
          ) : null}
        </div>
        {score ? (
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <ScoreSide
              players={match.teams[0].players}
              isWinner={score.scoreA > score.scoreB}
            />
            <div className="font-num text-[64px] leading-none font-bold tabular-nums">
              <CountedScore
                count={scoreACount}
                isWinner={score.scoreA > score.scoreB}
              />
              <span className="px-2 text-[#c5ccda]">:</span>
              <CountedScore
                count={scoreBCount}
                isWinner={score.scoreB > score.scoreA}
              />
            </div>
            <ScoreSide
              players={match.teams[1].players}
              isWinner={score.scoreB > score.scoreA}
            />
          </div>
        ) : null}
        {viewer && myNewAchievements.length > 0 ? (
          <div
            className="flex shrink-0 flex-col gap-2"
            onAnimationEnd={(event) => {
              // 흰 빛(1150+700ms)이 가장 늦게 끝난다
              if (event.animationName === "pk-sheen") finish();
            }}
          >
            {myNewAchievements.map((definition) => (
              <button
                key={definition.id}
                type="button"
                onClick={() =>
                  openAchievementDetail({
                    playerId: viewer.id,
                    achievementId: definition.id,
                  })
                }
                // 연출 전에도 자리는 차지한다(fill-mode both로 지연 동안 투명)
                style={isPlaying ? { animationDelay: `${ACHIEVEMENT_DELAY_MS}ms` } : undefined}
                className={cx(
                  "relative flex items-center gap-3 overflow-hidden rounded-pk-sm bg-pk-primary-soft px-3.5 py-3 text-left active:opacity-80",
                  isPlaying && "animate-pk-fade-up motion-reduce:animate-none",
                )}
              >
                <span
                  style={
                    isPlaying
                      ? {
                          animationDelay: `${ACHIEVEMENT_DELAY_MS}ms`,
                          animationDuration: "420ms",
                        }
                      : undefined
                  }
                  className={cx(
                    "flex shrink-0",
                    isPlaying && "animate-pk-pop motion-reduce:animate-none",
                  )}
                >
                  <AchievementBadge achievement={definition} earned size={40} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-pk-15 font-extrabold text-pk-ink">
                    새 업적 · {definition.name}
                  </span>
                  <span className="truncate text-pk-13 text-pk-sub">
                    {definition.condition}
                  </span>
                </span>
                {isPlaying ? (
                  // 띠 위로 한 번 지나가는 흰 빛. 띠의 overflow-hidden이 밖으로 넘치지 않게 자른다
                  <span
                    aria-hidden="true"
                    style={{ animationDelay: `${ACHIEVEMENT_DELAY_MS}ms` }}
                    className="pointer-events-none absolute inset-0 animate-pk-sheen bg-linear-to-r from-transparent via-white/70 to-transparent motion-reduce:hidden"
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {ratingRows.length > 0 ? (
          <div className="shrink-0 rounded-pk-lg bg-pk-bg px-4 py-1">
            <h3 className="mt-3 mb-0.5 text-pk-13 font-bold text-pk-sub">
              평점 변화
            </h3>
            {ratingRows.map(({ player, change }) => (
              <RatingRow
                key={player.id}
                player={player}
                change={change}
                ratingCategory={ratingCategory}
              />
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
            같은 멤버로 한 판 더
          </PkButton>
          <PkButton size="lg" fullWidth disabled={isBusy} onClick={onDone}>
            닫기
          </PkButton>
        </div>
      </BottomSheet.Footer>
    </>
  );
}

/** 0부터 센 큰 점수. 세는 동안은 회색이고 다 세면 이긴 쪽만 파랑으로 바뀐다 */
const CountedScore: React.FC<{
  count: { value: number; isDone: boolean };
  isWinner: boolean;
}> = ({ count, isWinner }) => (
  <span
    className={cx(
      "transition-colors duration-200 ease-pk-move motion-reduce:transition-none",
      isWinner && count.isDone ? "text-pk-primary" : "text-pk-muted",
    )}
  >
    {Math.round(count.value)}
  </span>
);

/**
 * 평점 변화 한 줄. '다음' 평점은 이전→새, 변화는 0→최종으로 센다.
 * 변화의 부호·색은 처음부터 최종값을 따른다. 이전 평점이 NR이면 세지 않고 최종값을 보인다
 */
const RatingRow: React.FC<{
  player: MatchInfo["teams"][number]["players"][number];
  change: PlayerRatingChangeLog;
  ratingCategory: ReturnType<typeof getMatchTopLevelType>;
}> = ({ player, change, ratingCategory }) => {
  const previousRating = change.previousRating[ratingCategory];
  const nextRating = change.nextRating[ratingCategory];
  const delta = change.delta[ratingCategory];
  const nextCount = useCountUp(nextRating ?? 0, {
    from: previousRating ?? 0,
    durationMs: RATING_COUNT_DURATION_MS,
    delayMs: RATING_COUNT_DELAY_MS,
  });
  const deltaCount = useCountUp(delta ?? 0, {
    durationMs: RATING_COUNT_DURATION_MS,
    delayMs: RATING_COUNT_DELAY_MS,
  });
  const isCounting =
    previousRating !== null && nextRating !== null && delta !== null;

  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto_60px] items-center gap-2.5 py-[11px] not-last:border-b not-last:border-[#e6e9f0]">
      <PlayerAvatar player={player} size={24} />
      <span className="truncate text-pk-15 font-bold">{player.username}</span>
      <span className="text-pk-13 tabular-nums text-pk-sub">
        {formatRating(previousRating)} →{" "}
        {formatRating(isCounting ? nextCount.value : nextRating)}
      </span>
      {isCounting ? (
        <RatingDelta
          value={deltaCount.value}
          signValue={delta}
          className="text-right"
        />
      ) : (
        <RatingDelta value={delta} className="text-right" />
      )}
    </div>
  );
};

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
