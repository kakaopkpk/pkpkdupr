import React, { useCallback, useState } from "react";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

export type MatchFilter = "all" | "mine";

/** 전체/내 경기 전환 옵션. 라벨 뒤에 그 보기에 나올 경기 수를 붙인다(0도 그대로 보인다) */
export const getMatchFilterOptions = (
  allCount: number,
  mineCount: number,
): readonly SegmentedOption<MatchFilter>[] => [
  { value: "all", label: `전체 ${allCount}` },
  { value: "mine", label: `내 경기 ${mineCount}` },
];

/** 전체/내 경기 전환 상태. 바꿀 때만 목록 페이드(SegmentSwitchFade)를 켠다 */
export const useMatchFilter = () => {
  const [filter, setFilter] = useState<MatchFilter>("all");
  const [isListFading, setIsListFading] = useState(false);
  const changeFilter = useCallback((nextFilter: MatchFilter) => {
    setFilter(nextFilter);
    setIsListFading(true);
  }, []);
  const finishListFade = useCallback(() => setIsListFading(false), []);
  return { filter, changeFilter, isListFading, finishListFade };
};

/** 섹션 제목 줄 오른쪽에 두는 작은 전체/내 경기 전환 */
export const MatchFilterControl: React.FC<{
  value: MatchFilter;
  onChange: (value: MatchFilter) => void;
  allCount: number;
  mineCount: number;
  ariaLabel: string;
}> = ({ value, onChange, allCount, mineCount, ariaLabel }) => (
  <SegmentedControl
    options={getMatchFilterOptions(allCount, mineCount)}
    value={value}
    onChange={onChange}
    ariaLabel={ariaLabel}
    size="sm"
  />
);
