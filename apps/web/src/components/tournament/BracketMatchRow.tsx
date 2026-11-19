import React from "react";
import { TeamsVersusWithAverages } from "@/components/home/TeamBlock";
import { rowPressClassName } from "@/components/ui/Button";
import { MatchRow, rowDividerClassName } from "@/components/ui/MatchRow";
import { cx } from "@/components/ui/cx";
import { getBracketTeamAverageRating } from "@/lib/tournament";
import type { MatchInfo } from "@/types/match";

/** 진행 중 경기의 점수 자리 표시. 앰버 점은 대진 진행 중 경기에만 쓰는 pk-hl 예외다 */
const InProgressMark: React.FC = () => (
  <span className="inline-flex shrink-0 items-center gap-1.5 text-pk-13 font-bold text-pk-ink">
    <span aria-hidden="true" className="size-[7px] rounded-full bg-pk-hl" />
    진행 중
  </span>
);

/**
 * 대진 경기 한 줄.
 * 끝난 경기는 기존 경기 줄(MatchRow)을 그대로 쓰고, 예정·진행 중 경기는 추천 매칭 줄 모양(위 팀 평균, 아래 팀 vs 팀)이며 시각을 보이지 않는다.
 * 진행 중이면 오른쪽에 앰버 점 + "진행 중", 예정이면 오른쪽이 비어 있다.
 */
export const BracketMatchRow: React.FC<{
  match: MatchInfo;
  /** 끝난 경기 줄(MatchRow)의 " · 내 경기" 표시에 쓴다 */
  currentPlayerId?: string;
  onPress?: () => void;
}> = ({ match, currentPlayerId, onPress }) => {
  if (match.status === "completed") {
    return (
      <MatchRow
        match={match}
        currentPlayerId={currentPlayerId}
        timeLabel="time"
        onPress={onPress}
      />
    );
  }

  const content = (
    <>
      <TeamsVersusWithAverages
        teams={[match.teams[0].players, match.teams[1].players]}
        averages={[
          getBracketTeamAverageRating(match, 0),
          getBracketTeamAverageRating(match, 1),
        ]}
      />
      {match.status === "created" ? <InProgressMark /> : null}
    </>
  );
  const className = cx("flex items-center gap-3 py-3", rowDividerClassName);

  return onPress ? (
    <button
      type="button"
      onClick={onPress}
      className={cx(
        "w-full text-left active:bg-pk-primary-soft/60",
        rowPressClassName,
        className,
      )}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
};
