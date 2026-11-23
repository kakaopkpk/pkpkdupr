import React from "react";
import type { MatchResultName } from "@/lib/matchResult";
import { SpecialMatchIcon } from "./SpecialMatchLabel";
import { cx } from "./cx";

/** 특수 매치 아이콘은 이름 글자(17)에 맞춘다 */
const RESULT_ICON_SIZE = 18;

/**
 * 기록 완료·경기 상세 점수 아래 결과 이름. 이름 17 굵게(특수 매치면 아이콘 18을 앞에), 이긴 쪽 블루·진 쪽 회색
 */
export const MatchResultLabel: React.FC<{
  result: MatchResultName;
  className?: string;
}> = ({ result, className }) => (
  <span
    className={cx(
      "flex items-center justify-center gap-1 text-pk-17 font-bold whitespace-nowrap",
      result.isWin ? "text-pk-primary" : "text-pk-sub",
      className,
    )}
  >
    {result.icon ? <SpecialMatchIcon kind={result.icon} size={RESULT_ICON_SIZE} /> : null}
    {result.label}
  </span>
);
