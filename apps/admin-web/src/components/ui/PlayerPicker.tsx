import React, { useId, useMemo, useState } from "react";
import { getCompositeDoublesRating, type Player } from "@pkpkdupr/shared/player";
import { formatRating } from "../../lib/format";
import { Chip } from "./Chip";
import { cx } from "./cx";
import { PlayerAvatar } from "./PlayerAvatar";
import { textInputClassName } from "./TextInput";

export interface PlayerPickerOption {
  id: string;
  username: string;
  isGuest?: boolean;
  duprRating?: Player["duprRating"];
  avatarUrl?: string;
}

const MAX_VISIBLE_OPTIONS = 8;

/** 아이디 검색 콤보박스. 고르면 onSelect를 부르고 검색어를 비운다. */
export const PlayerPicker: React.FC<{
  players: PlayerPickerOption[];
  onSelect: (playerId: string) => void;
  excludeIds?: string[];
  placeholder?: string;
  autoFocus?: boolean;
}> = ({ players, onSelect, excludeIds, placeholder = "아이디 검색", autoFocus }) => {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const candidates = useMemo(() => {
    const excluded = new Set(excludeIds);
    const keyword = query.trim().toLowerCase();
    return players
      .filter((player) => !excluded.has(player.id))
      .filter((player) => !keyword || player.username.toLowerCase().includes(keyword))
      .sort((a, b) => {
        // 검색어로 시작하는 아이디를 먼저 보인다
        if (keyword) {
          const aStarts = a.username.toLowerCase().startsWith(keyword);
          const bStarts = b.username.toLowerCase().startsWith(keyword);
          if (aStarts !== bStarts) return aStarts ? -1 : 1;
        }
        return a.username.localeCompare(b.username);
      })
      .slice(0, MAX_VISIBLE_OPTIONS);
  }, [players, excludeIds, query]);

  const showList = open && candidates.length > 0;
  const safeIndex = Math.min(activeIndex, Math.max(candidates.length - 1, 0));

  const select = (playerId: string) => {
    onSelect(playerId);
    setQuery("");
    setActiveIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        setActiveIndex(candidates.length ? (safeIndex + 1) % candidates.length : 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        setOpen(true);
        setActiveIndex(
          candidates.length ? (safeIndex - 1 + candidates.length) % candidates.length : 0,
        );
        break;
      case "Enter":
        if (showList) {
          event.preventDefault();
          select(candidates[safeIndex].id);
        }
        break;
      case "Escape":
        if (showList) {
          // 대화상자 안이면 대화상자를 닫지 않고 목록만 닫는다
          event.stopPropagation();
          setOpen(false);
        }
        break;
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listboxId}-${safeIndex}` : undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        className={textInputClassName}
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-pk-sm border border-pk-divider bg-white py-1"
        >
          {candidates.map((player, index) => (
            <li
              key={player.id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === safeIndex}
              // blur보다 먼저 골라야 목록이 닫히기 전에 선택된다
              onMouseDown={(event) => {
                event.preventDefault();
                select(player.id);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={cx(
                "flex h-11 cursor-pointer items-center gap-2.5 px-3 text-pk-15",
                index === safeIndex && "bg-pk-primary-soft",
              )}
            >
              <PlayerAvatar player={player} />
              <span className="min-w-0 flex-1 truncate font-semibold text-pk-ink">
                {player.username}
              </span>
              {player.isGuest && <Chip>게스트</Chip>}
              <span className="w-12 text-right tabular-nums text-pk-sub">
                {formatRating(getCompositeDoublesRating(player.duprRating))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
