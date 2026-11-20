import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  type MatchFilter,
  MatchFilterControl,
} from "@/components/ui/MatchFilterControl";
import { Section } from "@/components/ui/Section";
import { SegmentSwitchFade } from "@/components/ui/SegmentedControl";
import { StateMessage } from "@/components/ui/StateMessage";
import { useAppNavigation } from "@/context/AppNavigationContext";
import {
  formatBracketRoundLabel,
  groupBracketRounds,
} from "@/lib/tournament";
import { getMatchPlayerIds, type MatchInfo } from "@/types/match";
import { BracketMatchRow } from "./BracketMatchRow";

/** 대회 세션의 "대진" 섹션. 라운드마다 흰 카드 하나이고 라운드 이름은 카드 안 첫 줄이다 */
export const TournamentBracketSection: React.FC<{
  /** 그 세션의 경기 전부(GET /api/match-sessions/:sessionId/matches) */
  matches: MatchInfo[];
  currentPlayerId?: string;
  /** 제목 줄 오른쪽 전체/내 경기 전환. 기본 true */
  showFilter?: boolean;
}> = ({ matches, currentPlayerId, showFilter = true }) => {
  const { openMatchDetail } = useAppNavigation();
  const [filter, setFilter] = useState<MatchFilter>("all");
  const [isListFading, setIsListFading] = useState(false);
  const isMineOnly = showFilter && filter === "mine";

  const allGroups = useMemo(() => groupBracketRounds(matches), [matches]);
  const myGroups = useMemo(
    () =>
      allGroups
        .map((group) => ({
          ...group,
          matches: group.matches.filter(
            (match) =>
              !!currentPlayerId &&
              getMatchPlayerIds(match).includes(currentPlayerId),
          ),
        }))
        .filter((group) => group.matches.length > 0),
    [allGroups, currentPlayerId],
  );
  const groups = isMineOnly ? myGroups : allGroups;
  // 전환 라벨 개수는 대진에 보이는 줄 수(예정·진행 중·끝난 경기)다
  const countMatches = (list: typeof allGroups) =>
    list.reduce((sum, group) => sum + group.matches.length, 0);

  const changeFilter = (nextFilter: MatchFilter) => {
    setFilter(nextFilter);
    setIsListFading(true);
  };

  return (
    <Section
      title="대진"
      right={
        showFilter ? (
          <MatchFilterControl
            value={filter}
            onChange={changeFilter}
            allCount={countMatches(allGroups)}
            mineCount={countMatches(myGroups)}
            ariaLabel="대진 보기"
          />
        ) : null
      }
    >
      <SegmentSwitchFade
        isPlaying={isListFading}
        onFinish={() => setIsListFading(false)}
      >
        {groups.length > 0 ? (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <Card key={group.round ?? "none"} className="pt-3">
                <h3 className="text-pk-13 font-extrabold text-pk-ink">
                  {formatBracketRoundLabel(group.round)}
                </h3>
                {group.matches.map((match) => (
                  <BracketMatchRow
                    key={match.id}
                    match={match}
                    currentPlayerId={currentPlayerId}
                    onPress={() => openMatchDetail(match.id)}
                  />
                ))}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <StateMessage
              kind="empty"
              message={
                allGroups.length > 0 ? "내 경기가 없어요" : "아직 대진이 없어요"
              }
            />
          </Card>
        )}
      </SegmentSwitchFade>
    </Section>
  );
};
