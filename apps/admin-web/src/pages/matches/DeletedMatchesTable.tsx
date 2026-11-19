import React from "react";
import type { AdminMatchDeletionLog, Match } from "@pkpkdupr/shared/match";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { formatKstDateTime } from "../../lib/format";
import { DELETED_PLAYER_LABEL, formatScore, formatTeam } from "./matchView";

/** 지운 경기가 평점에 준 영향. 스냅샷에 ratingExcluded가 없으면 false로 본다 */
const describeRatingEffect = (match: Match) => {
  if (match.status !== "completed") return "해당 없음";
  return match.ratingExcluded ? "미반영 경기라 변화 없음" : "다시 계산됨";
};

const headerCellClassName = "px-3 pb-3 text-left text-pk-12 font-semibold text-pk-sub";
const cellClassName = "p-3 align-top";

/** 삭제된 경기 탭. 복원은 하지 않는다 */
export const DeletedMatchesTable: React.FC<{ logs: AdminMatchDeletionLog[] }> = ({
  logs,
}) => {
  if (logs.length === 0) {
    return <Card className="text-pk-15 text-pk-sub">지운 경기가 없어요</Card>;
  }

  return (
    <>
      <Card>
        <table className="w-full text-pk-15 text-pk-ink">
          <thead>
            <tr className="border-b border-pk-divider">
              <th className={headerCellClassName}>지운 시각</th>
              <th className={headerCellClassName}>지운 사람</th>
              <th className={headerCellClassName}>경기</th>
              <th className={headerCellClassName}>세션 · 경기 시각</th>
              <th className={headerCellClassName}>평점</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const { match } = log;
              return (
                <tr key={log.id} className="border-b border-pk-divider last:border-b-0">
                  <td className={`${cellClassName} whitespace-nowrap tabular-nums`}>
                    {formatKstDateTime(log.deletedAt)}
                  </td>
                  <td className={`${cellClassName} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1.5">
                      {log.deletedByUsername ?? DELETED_PLAYER_LABEL}
                      {log.deletedByAdmin && <Chip>관리자</Chip>}
                    </span>
                  </td>
                  <td className={cellClassName}>
                    {formatTeam(match.teams[0])}{" "}
                    <span className="font-bold tabular-nums">{formatScore(match)}</span>{" "}
                    {formatTeam(match.teams[1])}
                  </td>
                  <td className={`${cellClassName} whitespace-nowrap`}>
                    {match.session?.name || "세션 없음"} ·{" "}
                    <span className="tabular-nums">
                      {formatKstDateTime(match.matchStartsAt)}
                    </span>
                  </td>
                  <td className={`${cellClassName} whitespace-nowrap text-pk-sub`}>
                    {describeRatingEffect(match)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 px-1 text-pk-13 text-pk-sub">
        지운 경기는 되살리지 않아요. 잘못 지웠으면 '+ 경기 넣기'로 같은 내용을 다시 넣어요.
      </p>
    </>
  );
};
