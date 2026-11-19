import React from "react";
import { Link } from "react-router-dom";
import {
  getMatchEditFields,
  type AdminMatchEditLog,
  type Match,
  type MatchEditField,
} from "@pkpkdupr/shared/match";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { matchesPath } from "../../lib/adminRoutes";
import { formatKstDateTime } from "../../lib/format";
import {
  DELETED_PLAYER_LABEL,
  formatScore,
  formatTeam,
} from "./matchView";

const EDIT_FIELD_LABELS: Record<MatchEditField, string> = {
  scores: "점수",
  players: "선수",
  type: "종류",
  session: "세션",
  matchStartsAt: "경기 시각",
  location: "장소",
  name: "이름",
};

const MatchLine: React.FC<{ match: Match }> = ({ match }) => (
  <>
    {formatTeam(match.teams[0])}{" "}
    <span className="font-bold tabular-nums">{formatScore(match)}</span>{" "}
    {formatTeam(match.teams[1])}
  </>
);

const headerCellClassName = "px-3 pb-3 text-left text-pk-12 font-semibold text-pk-sub";
const cellClassName = "p-3 align-top";

/** 수정된 경기 탭. 완료 경기를 고친 기록이며 되돌리지는 않는다 */
export const EditedMatchesTable: React.FC<{
  logs: AdminMatchEditLog[];
  /** 지금 남아 있는 경기 id. 지워진 경기는 링크 대신 안내를 보인다 */
  existingMatchIds: ReadonlySet<string>;
}> = ({ logs, existingMatchIds }) => {
  if (logs.length === 0) {
    return <Card className="text-pk-15 text-pk-sub">고친 경기가 없어요</Card>;
  }

  return (
    <>
      <Card>
        <table className="w-full text-pk-15 text-pk-ink">
          <thead>
            <tr className="border-b border-pk-divider">
              <th className={headerCellClassName}>고친 시각</th>
              <th className={headerCellClassName}>고친 사람</th>
              <th className={headerCellClassName}>바뀐 것</th>
              <th className={headerCellClassName}>고치기 전 → 고친 뒤</th>
              <th className={headerCellClassName}>세션 · 경기 시각</th>
              <th className={headerCellClassName}>
                <span className="sr-only">경기 보기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const { before, after } = log;
              const changes = getMatchEditFields(before, after);
              return (
                <tr key={log.id} className="border-b border-pk-divider last:border-b-0">
                  <td className={`${cellClassName} whitespace-nowrap tabular-nums`}>
                    {formatKstDateTime(log.editedAt)}
                  </td>
                  <td className={`${cellClassName} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1.5">
                      {log.editedByUsername ?? DELETED_PLAYER_LABEL}
                      {log.editedByAdmin && <Chip>관리자</Chip>}
                    </span>
                  </td>
                  <td className={cellClassName}>
                    <span className="flex flex-wrap gap-1">
                      {changes.map((field) => (
                        <Chip key={field}>{EDIT_FIELD_LABELS[field]}</Chip>
                      ))}
                    </span>
                  </td>
                  <td className={cellClassName}>
                    <p className="text-pk-sub">
                      <MatchLine match={before} />
                    </p>
                    <p className="mt-1">
                      <MatchLine match={after} />
                    </p>
                  </td>
                  <td className={`${cellClassName} whitespace-nowrap`}>
                    {after.session?.name || "세션 없음"} ·{" "}
                    <span className="tabular-nums">
                      {formatKstDateTime(after.matchStartsAt)}
                    </span>
                  </td>
                  <td className={`${cellClassName} whitespace-nowrap text-right`}>
                    {existingMatchIds.has(log.matchId) ? (
                      <Link
                        to={matchesPath({ matchId: log.matchId })}
                        className="text-pk-13 font-bold text-pk-primary hover:text-pk-deep"
                      >
                        경기 보기 ›
                      </Link>
                    ) : (
                      <span className="text-pk-13 text-pk-sub">지운 경기</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 px-1 text-pk-13 text-pk-sub">
        고친 기록은 되돌리지 않아요. 잘못 고쳤으면 경기 목록에서 다시 고쳐요.
      </p>
    </>
  );
};
