import React from "react";
import type { MatchInfo } from "@/types/match";
import { PkButton } from "@/components/ui/Button";
import { TeamsVersus } from "./TeamBlock";

const getElapsedMinutes = (startsAt: string, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(startsAt).getTime()) / 60_000));

/** "방금 시작"·"N분째"에 세션 밖 경기면 " · 세션 없음"을 붙인다 */
const getStatusLabel = (match: MatchInfo, now: Date) => {
  const elapsedMinutes = getElapsedMinutes(match.matchStartsAt, now);
  const elapsedLabel = elapsedMinutes === 0 ? "방금 시작" : `${elapsedMinutes}분째`;
  return match.session ? elapsedLabel : `${elapsedLabel} · 세션 없음`;
};

/** 진행 중인 내 경기. 2px 연한 블루 테두리와 "점수 입력" 버튼 */
const MyLiveMatchCard: React.FC<{
  match: MatchInfo;
  now: Date;
  onEnterScore: () => void;
}> = ({ match, now, onEnterScore }) => (
  <article className="flex flex-col gap-3 rounded-pk-lg border-2 border-pk-primary-line bg-white p-3.5">
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-pk-primary px-[9px] py-[3px] text-pk-12 font-extrabold text-white">
        내 경기
      </span>
      <span className="text-pk-13 text-pk-sub tabular-nums">
        {getStatusLabel(match, now)}
      </span>
    </div>
    <TeamsVersus
      teams={[match.teams[0].players, match.teams[1].players]}
      size={28}
    />
    <PkButton size="md" fullWidth className="h-12" onClick={onEnterScore}>
      점수 입력
    </PkButton>
  </article>
);

export default MyLiveMatchCard;
