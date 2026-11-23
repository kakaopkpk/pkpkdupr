import React, { useMemo, useState } from "react";
import {
  getMatchTopLevelType,
  type MatchTopLevelType,
} from "@pkpkdupr/shared/match";
import type { Player, PlayerRatingChangeLog } from "@pkpkdupr/shared/player";
import BottomSheet from "@/components/BottomSheet";
import { MatchAchievementRow } from "@/components/match/MatchAchievementRow";
import { type MatchInfo, RATING_EXCLUDED_NOTICE } from "@/types/match";
import { PkButton } from "@/components/ui/Button";
import { MatchRatingChangeCount } from "@/components/match/MatchRatingChangeCount";
import {
  COUNT_UP,
  COUNT_UP_SECOND,
  getCountUpEndMs,
} from "@/components/ui/CountUpNumber";
import { CountUpText } from "@/components/ui/CountUpText";
import { PlayerAvatar, TeamAvatars } from "@/components/ui/PlayerAvatar";
import { MatchResultLabel } from "@/components/ui/MatchResultLabel";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import { useCountUp } from "@/hooks/useCountUp";
import { usePlayOnShow } from "@/hooks/usePlayOnShow";
import { prefersReducedMotion } from "@/hooks/useSheetDrag";
import {
  markAchievementsSeen,
  pickMatchEarnedAchievements,
} from "@/lib/achievements";
import { getMatchResultName } from "@/lib/matchResult";
import AchievementCelebration from "./AchievementCelebration";
import { FooterError } from "./RecordMatchParts";
import SpecialMatchCelebrationScreen from "./SpecialMatchCelebrationScreen";
import { isViewerOnWinningTeam } from "./specialMatchCelebration.utils";
import { CheckIcon } from "@/components/ui/Icons";

/*
 * 완료 화면 연출 시각(ms, 완료 단계가 보이게 된 시점 기준).
 * 체크 그리기 0 → 점수 세기(첫 박자) → 이긴 쪽 색 전환 → 평점 세기(둘째 박자)와 업적 띠 동시
 * → 특수 매치 큰 연출(내가 이긴 팀일 때) → 업적 축하 연출
 */
const SCORE_COUNT = COUNT_UP;
const RATING_COUNT = COUNT_UP_SECOND;
// 업적 띠는 평점이 오르기 시작할 때 함께 등장한다
const ACHIEVEMENT_DELAY_MS = RATING_COUNT.delayMs;
const ACHIEVEMENT_BADGE_POP_MS = 420;
// 평점을 다 센 뒤 화면 전체 축하 연출(특수 매치 큰 연출이 있으면 그것부터)을 띄운다
const CELEBRATION_DELAY_MS = getCountUpEndMs(RATING_COUNT);

export interface RecordDoneStepProps {
  match: MatchInfo;
  isBusy: boolean;
  /** 버튼 위에 보일 서버 문구(같은 선수가 다른 경기 중이면 409 문구) */
  error: string | null;
  /** 같은 팀으로 진행 중 경기를 시작한다(세션과 상관없음). 원래 경기로 서버가 리벤지 매치를 판정한다 */
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
  // 바텀시트 안이라 보임 제공자 밖이다. 업적 상세 시트를 열었다 닫아도 다시 재생되지 않는다
  const { isPlaying, finish } = usePlayOnShow();
  // 완료 단계가 마운트된 동안 한 번만 띄운다(업적 상세를 열었다 닫아도 다시 띄우지 않는다)
  const [isCelebrationOpen, setIsCelebrationOpen] = useState(true);
  const [isSpecialMatchCelebrationOpen, setIsSpecialMatchCelebrationOpen] = useState(true);
  const score = match.scores?.[0];
  const scoreACount = useCountUp(score?.scoreA ?? 0, SCORE_COUNT);
  const scoreBCount = useCountUp(score?.scoreB ?? 0, SCORE_COUNT);
  const ratingCategory = getMatchTopLevelType(match.type);
  // 점수 아래 내 기준 결과 이름. 경기하지 않은 기록자는 null
  const matchResult = useMemo(
    () => getMatchResultName(match, viewer?.id),
    [match, viewer],
  );
  // 내가 진 팀이면 한 판 더 버튼 문구만 "리벤지"다. 이긴 팀·경기하지 않은 기록자는 그대로다
  const isViewerOnLosingTeam = matchResult?.isWin === false;
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
  // 참가자 전원이 받은 업적을 띠로 보인다. 게스트가 낀 경기는 업적이 없으므로 띠·축하 연출도 없다
  const matchAchievements = useMemo(
    () => pickMatchEarnedAchievements(match.newAchievements ?? [], match),
    [match],
  );
  // 화면 전체 축하 연출과 확인 처리는 내 업적만
  const myNewAchievementItems = useMemo(
    () =>
      matchAchievements.filter(({ player }) => player.id === viewer?.id),
    [matchAchievements, viewer],
  );
  const myNewAchievements = useMemo(
    () => myNewAchievementItems.map(({ definition }) => definition),
    [myNewAchievementItems],
  );
  // 특수 매치 큰 연출은 기록한 내가 이긴 팀일 때만, 이 완료 화면에서만 띄운다(다른 화면에서 나중에 띄우지 않음)
  const specialMatchCelebration =
    viewer?.username && match.specialMatchCelebration && isViewerOnWinningTeam(match, viewer.id)
      ? match.specialMatchCelebration
      : null;
  const isSpecialMatchCelebrationShown =
    specialMatchCelebration != null && isSpecialMatchCelebrationOpen;
  // 움직임 줄이기면 평점 세기가 없으므로 바로 띄운다
  const reducedMotionDelayMs = prefersReducedMotion() ? 0 : CELEBRATION_DELAY_MS;
  // 업적 축하는 특수 매치 연출을 닫은 뒤에 뜨므로 기다리지 않고 바로 이어진다
  const celebrationDelayMs = specialMatchCelebration ? 0 : reducedMotionDelayMs;

  return (
    <>
      {/* 완료 줄까지 본문에 넣어 그랩바 아래 전부가 함께 스크롤된다 */}
      <BottomSheet.Body className="pb-2">
        {/* 경기 상세 맨 위 메타 줄과 같은 자리·모양의 한 줄 */}
        <h2
          className="flex shrink-0 items-center justify-center gap-1 text-pk-13 text-pk-sub"
          onAnimationEnd={() => {
            // 업적 띠가 없으면 체크 그리기가 마지막 CSS 연출이다
            if (matchAchievements.length === 0) finish();
          }}
        >
          <CheckIcon size={14} className="text-pk-up" draw={isPlaying} />
          <span className="font-bold text-pk-ink">기록했어요</span>
          {match.session?.name ? (
            <span className="min-w-0 truncate">· {match.session.name}</span>
          ) : null}
        </h2>
        {score ? (
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <ScoreSide
              players={match.teams[0].players}
              isWinner={score.scoreA > score.scoreB}
            />
            <div className="flex flex-col items-center">
              <div className="font-num text-[64px] leading-none font-bold tabular-nums">
                {/* 숫자를 콜론 쪽에 붙여 세는 동안 콜론이 제자리에 있게 한다 */}
                <CountedScore
                  count={scoreACount}
                  finalValue={score.scoreA}
                  align="end"
                  isWinner={score.scoreA > score.scoreB}
                />
                <span className="px-2 text-[#c5ccda]">:</span>
                <CountedScore
                  count={scoreBCount}
                  finalValue={score.scoreB}
                  align="start"
                  isWinner={score.scoreB > score.scoreA}
                />
              </div>
              {matchResult ? (
                <MatchResultLabel result={matchResult} className="mt-1.5" />
              ) : null}
            </div>
            <ScoreSide
              players={match.teams[1].players}
              isWinner={score.scoreB > score.scoreA}
            />
          </div>
        ) : null}
        {matchAchievements.length > 0 ? (
          <div
            className="flex shrink-0 flex-col gap-2"
            onAnimationEnd={(event) => {
              // 배지 튀어나옴(650+420ms)이 가장 늦게 끝나는 CSS 연출이다
              if (event.animationName === "pk-pop") finish();
            }}
          >
            {matchAchievements.map((achievement) => (
              <MatchAchievementRow
                key={`${achievement.player.id}:${achievement.definition.id}`}
                achievement={achievement}
                onPress={() =>
                  openAchievementDetail({
                    playerId: achievement.player.id,
                    achievementId: achievement.definition.id,
                    earned: true,
                  })
                }
                // 연출 전에도 자리는 차지한다(fill-mode both로 지연 동안 투명)
                style={isPlaying ? { animationDelay: `${ACHIEVEMENT_DELAY_MS}ms` } : undefined}
                className={cx(
                  "rounded-pk-sm bg-pk-primary-soft px-3.5 py-3",
                  isPlaying && "animate-pk-fade-up motion-reduce:animate-none",
                )}
                badgeStyle={
                  isPlaying
                    ? {
                        animationDelay: `${ACHIEVEMENT_DELAY_MS}ms`,
                        animationDuration: `${ACHIEVEMENT_BADGE_POP_MS}ms`,
                      }
                    : undefined
                }
                badgeClassName={cx(
                  isPlaying && "animate-pk-pop motion-reduce:animate-none",
                )}
              />
            ))}
          </div>
        ) : null}
        {match.ratingExcluded || ratingRows.length > 0 ? (
          <div className="shrink-0 rounded-pk-lg bg-pk-bg px-4 py-1">
            {match.ratingExcluded ? (
              <p className="py-[11px] text-pk-15 text-pk-sub">
                {RATING_EXCLUDED_NOTICE}
              </p>
            ) : (
              ratingRows.map(({ player, change }) => (
                <RatingRow
                  key={player.id}
                  player={player}
                  change={change}
                  ratingCategory={ratingCategory}
                />
              ))
            )}
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
            {isViewerOnLosingTeam ? "같은 멤버로 리벤지" : "같은 멤버로 한 판 더"}
          </PkButton>
          <PkButton size="lg" fullWidth disabled={isBusy} onClick={onDone}>
            닫기
          </PkButton>
        </div>
      </BottomSheet.Footer>
      {viewer?.username && specialMatchCelebration && isSpecialMatchCelebrationShown ? (
        <SpecialMatchCelebrationScreen
          celebration={specialMatchCelebration}
          match={match}
          username={viewer.username}
          delayMs={reducedMotionDelayMs}
          onClose={() => setIsSpecialMatchCelebrationOpen(false)}
        />
      ) : null}
      {/* 특수 매치 큰 연출과 겹치면 그 연출을 닫은 뒤에 띄운다 */}
      {viewer &&
      myNewAchievements.length > 0 &&
      isCelebrationOpen &&
      !isSpecialMatchCelebrationShown ? (
        <AchievementCelebration
          achievements={myNewAchievements}
          earnedAts={myNewAchievementItems.map(({ item }) => item.earnedAt)}
          totalPoints={viewer ? match.achievementPoints?.[viewer.id] : null}
          delayMs={celebrationDelayMs}
          onClose={() => {
            setIsCelebrationOpen(false);
            // 여기서 본 업적은 홈에서 다시 띄우지 않는다. 실패하면 다음 미확인 조회 때 다시 뜬다
            void markAchievementsSeen(
              myNewAchievementItems.map(({ item }) => item),
            ).catch(() => {});
          }}
        />
      ) : null}
    </>
  );
}

/**
 * 0부터 센 큰 점수. 세는 동안은 회색이고 다 세면 이긴 쪽만 파랑으로 바뀐다.
 * 자리 폭은 최종 점수로 고정해 자릿수가 바뀌어도 양옆이 흔들리지 않는다
 */
const CountedScore: React.FC<{
  count: { value: number; isDone: boolean };
  finalValue: number;
  align: "start" | "end";
  isWinner: boolean;
}> = ({ count, finalValue, align, isWinner }) => (
  <CountUpText
    finalContent={finalValue}
    align={align}
    className={cx(
      "transition-colors duration-200 ease-pk-move motion-reduce:transition-none",
      isWinner && count.isDone ? "text-pk-primary" : "text-pk-muted",
    )}
  >
    {Math.round(count.value)}
  </CountUpText>
);

/** 평점 변화 한 줄. 점수를 다 센 뒤 평점(이전 → 새)과 변화(0부터)를 센다 */
const RatingRow: React.FC<{
  player: Player;
  change: PlayerRatingChangeLog;
  ratingCategory: MatchTopLevelType;
}> = ({ player, change, ratingCategory }) => (
  <div className="grid grid-cols-[24px_minmax(0,1fr)_auto_60px] items-center gap-2.5 py-[11px] not-last:border-b not-last:border-[#e6e9f0]">
    <PlayerAvatar player={player} size={24} />
    <span className="truncate text-pk-15 font-bold">{player.username}</span>
    <MatchRatingChangeCount
      previousRating={change.previousRating[ratingCategory]}
      nextRating={change.nextRating[ratingCategory]}
      delta={change.delta[ratingCategory]}
    />
  </div>
);

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
