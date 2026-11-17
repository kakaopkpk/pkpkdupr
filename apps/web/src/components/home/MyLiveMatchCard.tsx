import React from "react";
import type { MatchInfo } from "@/types/match";
import { PkButton } from "@/components/ui/Button";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { formatElapsed } from "@/lib/format";
import { TeamsVersus } from "./TeamBlock";

/** "방금 시작"·"N분째"에 세션 밖 경기면 " · 세션 없음"을 붙인다 */
const getStatusLabel = (match: MatchInfo, now: Date) => {
  const elapsedLabel = formatElapsed(match.matchStartsAt, now);
  return match.session ? elapsedLabel : `${elapsedLabel} · 세션 없음`;
};

/** 진행 중인 내 경기. 2px 연한 블루 테두리와 "점수 입력" 버튼. 버튼 위 본문을 누르면 경기 상세를 연다 */
const MyLiveMatchCard: React.FC<{
  match: MatchInfo;
  now: Date;
  onOpenDetail: () => void;
  onEnterScore: () => void;
}> = ({ match, now, onOpenDetail, onEnterScore }) => (
  <article className="flex flex-col gap-3 rounded-pk-lg border-2 border-pk-primary-line bg-white p-3.5">
    <button
      type="button"
      onClick={onOpenDetail}
      className="flex flex-col gap-3 text-left active:opacity-80"
    >
      <span className="flex w-full items-center gap-2">
        <span className="rounded-full bg-pk-primary px-[9px] py-[3px] text-pk-12 font-extrabold text-white">
          내 경기
        </span>
        <span className="text-pk-13 text-pk-sub tabular-nums">
          {getStatusLabel(match, now)}
        </span>
        <ChevronRightIcon className="ml-auto shrink-0 text-pk-quiet" />
      </span>
      <TeamsVersus
        teams={[match.teams[0].players, match.teams[1].players]}
        size={28}
      />
    </button>
    <PkButton size="md" fullWidth className="h-12" onClick={onEnterScore}>
      점수 입력
    </PkButton>
  </article>
);

export default MyLiveMatchCard;
