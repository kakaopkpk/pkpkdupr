import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  homePath,
  matchesPath,
  membersPath,
  ratingsPath,
  sessionsPath,
} from "../../lib/adminRoutes";
import { cx } from "../ui/cx";
import { HomeIcon, MatchesIcon, MembersIcon, RatingsIcon, SessionsIcon } from "./navIcons";

const MENU_ITEMS: Array<{ to: string; label: string; icon: React.FC; end?: boolean }> = [
  { to: homePath(), label: "홈", icon: HomeIcon, end: true },
  { to: membersPath(), label: "회원", icon: MembersIcon },
  { to: matchesPath(), label: "경기", icon: MatchesIcon },
  { to: sessionsPath(), label: "세션", icon: SessionsIcon },
  { to: ratingsPath(), label: "평점", icon: RatingsIcon },
];

export const AdminSideNav: React.FC = () => {
  const { player, logout } = useAuth();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-white px-4 py-6">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <span className="flex size-9 items-center justify-center rounded-pk-sm bg-pk-primary text-pk-13 font-bold text-white">
          PK
        </span>
        <div className="leading-tight">
          <div className="text-pk-15 font-bold text-pk-ink">pkpkdupr</div>
          <div className="text-pk-12 font-semibold text-pk-muted">관리자</div>
        </div>
      </div>

      <nav aria-label="관리자 메뉴" className="flex flex-col gap-1">
        {MENU_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-2.5 rounded-pk-sm px-3 py-2.5 text-pk-15 font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-pk-primary",
                isActive
                  ? "bg-pk-primary-soft text-pk-primary"
                  : "text-pk-sub hover:bg-pk-bg hover:text-pk-ink",
              )
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-1 px-2 text-pk-12 text-pk-muted">
        {player && (
          <div className="truncate text-pk-13 font-semibold text-pk-sub">{player.username}</div>
        )}
        <div>v{__APP_VERSION__.replace(/^v/, "")}</div>
        <button
          type="button"
          onClick={() => void logout()}
          className="font-semibold text-pk-sub underline-offset-2 hover:text-pk-ink hover:underline"
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
};
