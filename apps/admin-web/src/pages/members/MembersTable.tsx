import React from "react";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { cx } from "../../components/ui/cx";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { SortHeader } from "../../components/ui/SortHeader";
import { formatRating, formatRelativeDay } from "../../lib/format";
import {
  KIND_LABEL,
  getLastSignInLabel,
  getMemberKind,
  type SortKey,
  type SortState,
} from "./memberModel";

const headerCellClassName = "whitespace-nowrap px-2.5 py-3 text-pk-12 font-semibold text-pk-sub";
const cellClassName = "px-2.5 py-3";

const SortableHeader: React.FC<{
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}> = ({ label, sortKey, sort, onSort, className }) => (
  <th
    scope="col"
    aria-sort={
      sort.key === sortKey ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
    }
    className={cx(headerCellClassName, "text-right", className)}
  >
    <SortHeader
      label={label}
      active={sort.key === sortKey}
      direction={sort.direction}
      onClick={() => onSort(sortKey)}
    />
  </th>
);

export const MembersTable: React.FC<{
  players: AdminPlayer[];
  selectedPlayerId: string | undefined;
  sort: SortState;
  onSort: (key: SortKey) => void;
  onSelect: (playerId: string) => void;
}> = ({ players, selectedPlayerId, sort, onSort, onSelect }) => (
  <div className="overflow-hidden rounded-pk-lg bg-white">
    <table className="w-full table-fixed text-pk-13">
      {/* 1280px 화면에서 상세 패널(400px)이 열려도 가로 스크롤이 없도록 아이디 외 열 폭을 고정한다 */}
      <colgroup>
        <col />
        <col className="w-[60px]" />
        <col className="w-[88px]" />
        <col className="w-[76px]" />
        <col className="w-[88px]" />
        <col className="w-[108px]" />
      </colgroup>
      <thead className="border-b border-pk-divider">
        <tr>
          <th scope="col" className={cx(headerCellClassName, "pl-5 text-left")}>
            아이디
          </th>
          <th scope="col" className={cx(headerCellClassName, "text-left")}>
            구분
          </th>
          <SortableHeader label="복식 평점" sortKey="rating" sort={sort} onSort={onSort} />
          <SortableHeader label="경기" sortKey="matches" sort={sort} onSort={onSort} />
          <SortableHeader label="최근 경기" sortKey="lastMatch" sort={sort} onSort={onSort} />
          <SortableHeader
            label="최근 로그인"
            sortKey="lastSignIn"
            sort={sort}
            onSort={onSort}
            className="pr-5"
          />
        </tr>
      </thead>
      <tbody>
        {players.length === 0 && (
          <tr>
            <td colSpan={6} className="px-5 py-10 text-center text-pk-15 text-pk-muted">
              조건에 맞는 회원이 없어요.
            </td>
          </tr>
        )}
        {players.map((player) => {
          const kind = getMemberKind(player);
          const selected = player.id === selectedPlayerId;
          const inactive = player.status === "inactive";
          return (
            <tr
              key={player.id}
              tabIndex={0}
              aria-selected={selected}
              onClick={() => onSelect(player.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(player.id);
                }
              }}
              className={cx(
                "cursor-pointer border-b border-pk-divider last:border-b-0 outline-none",
                "focus-visible:bg-pk-primary-soft",
                selected ? "bg-pk-primary-soft" : "hover:bg-pk-bg",
                inactive ? "text-pk-muted" : "text-pk-ink",
              )}
            >
              <td className={cx(cellClassName, "pl-5")}>
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerAvatar player={player} size={24} className={cx(inactive && "opacity-50")} />
                  <span className="truncate font-semibold">{player.username}</span>
                </div>
              </td>
              <td className={cx(cellClassName, !inactive && "text-pk-sub")}>
                {KIND_LABEL[kind]}
              </td>
              <td className={cx(cellClassName, "text-right tabular-nums")}>
                {formatRating(player.duprRating?.doubles)}
              </td>
              <td className={cx(cellClassName, "whitespace-nowrap text-right tabular-nums")}>
                {player.matchCount}
                {player.isGuest && (
                  <span className="ml-1 text-pk-12 text-pk-muted">미반영</span>
                )}
              </td>
              <td className={cx(cellClassName, "text-right tabular-nums")}>
                {player.lastMatchStartsAt ? formatRelativeDay(player.lastMatchStartsAt) : "–"}
              </td>
              <td
                className={cx(
                  cellClassName,
                  "whitespace-nowrap pr-5 text-right tabular-nums",
                  !inactive && !player.lastSignInAt && "text-pk-sub",
                )}
              >
                {getLastSignInLabel(player)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
