import React, { useEffect, useRef, useState } from "react";
import type { MatchInfo } from "@/types/match";
import type { TabKey } from "@/context/TabNavigationContext";

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const HomeIcon = () => (
  <svg width="22" height="22" strokeWidth={2} {...svgProps}>
    <path d="M4 10.5l8-6.5 8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </svg>
);

const RecordsIcon = () => (
  <svg width="22" height="22" strokeWidth={2} {...svgProps}>
    <path d="M9 7h11M9 12h11M9 17h11" />
    <circle cx="4.5" cy="7" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="17" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

const RankingIcon = () => (
  <svg width="22" height="22" strokeWidth={2} {...svgProps}>
    <path d="M6 20v-8M12 20V5M18 20v-5" />
  </svg>
);

const MeIcon = () => (
  <svg width="22" height="22" strokeWidth={2} {...svgProps}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);

export const PlusIcon = () => (
  <svg width="28" height="28" strokeWidth={2.4} {...svgProps}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ScoreIcon = () => (
  <svg width="20" height="20" strokeWidth={2} {...svgProps}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M9 9v6M15 9v6M12 11v.01M12 14v.01" />
  </svg>
);

const SessionIcon = () => (
  <svg width="20" height="20" strokeWidth={2} {...svgProps}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3v4M15 3v4M12 13v4M10 15h4" />
  </svg>
);

export const TAB_ITEMS: {
  key: TabKey;
  label: string;
  Icon: React.FC;
}[] = [
  { key: "home", label: "홈", Icon: HomeIcon },
  { key: "records", label: "기록", Icon: RecordsIcon },
  { key: "ranking", label: "랭킹", Icon: RankingIcon },
  { key: "me", label: "나", Icon: MeIcon },
];

export const getTabId = (tabKey: TabKey) => `app-tab-${tabKey}`;
export const getTabPanelId = (tabKey: TabKey) => `app-tab-panel-${tabKey}`;

/** 유리 알약 4탭. 높이 66px. 선택 배경 하나가 탭 사이를 미끄러져 이동한다 */
export const NavPill: React.FC<{
  selectedTab: TabKey;
  onPressTab: (tabKey: TabKey) => void;
}> = ({ selectedTab, onPressTab }) => {
  // 누른 탭 아이콘만 튕긴다. count를 key로 써서 같은 탭을 다시 눌러도 애니메이션을 처음부터 돌린다
  const [pressedIcon, setPressedIcon] = useState<{
    tabKey: TabKey;
    count: number;
  } | null>(null);
  const selectedIndex = TAB_ITEMS.findIndex(
    (item) => item.key === selectedTab,
  );

  return (
    <div
      role="tablist"
      aria-label="주 메뉴"
      className="app-glass grid h-[66px] min-w-0 flex-1 grid-cols-4 overflow-hidden rounded-full p-[5px]"
    >
      <span
        aria-hidden="true"
        style={{ transform: `translateX(${selectedIndex * 100}%)` }}
        className="absolute inset-y-[5px] left-[5px] w-[calc((100%-10px)/4)] rounded-full bg-pk-primary-soft transition-transform duration-[460ms] ease-pk-spring motion-reduce:transition-none"
      />
      {TAB_ITEMS.map(({ key, label, Icon }) => {
        const isSelected = key === selectedTab;
        const isIconPopping = pressedIcon?.tabKey === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            id={getTabId(key)}
            aria-selected={isSelected}
            aria-controls={getTabPanelId(key)}
            onClick={() => {
              setPressedIcon((prev) => ({
                tabKey: key,
                count: (prev?.count ?? 0) + 1,
              }));
              onPressTab(key);
            }}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-full text-pk-12 transition-colors duration-200 touch-manipulation motion-reduce:transition-none ${
              isSelected
                ? "font-extrabold text-pk-primary"
                : "font-bold text-pk-sub"
            }`}
          >
            <span
              key={isIconPopping ? pressedIcon.count : 0}
              className={`flex ${isIconPopping ? "animate-nav-icon-pop motion-reduce:animate-none" : ""}`}
            >
              <Icon />
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
};

/** + 버튼과 그 위에 뜨는 "새로 만들기" 메뉴 */
export const PlusMenu: React.FC<{
  isOpen: boolean;
  isDisabled: boolean;
  onToggle: () => void;
  onRecordMatch: () => void;
  onCreateSession: () => void;
}> = ({ isOpen, isDisabled, onToggle, onRecordMatch, onCreateSession }) => {
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen) firstItemRef.current?.focus();
  }, [isOpen]);

  const itemClassName =
    "flex min-h-14 w-full items-center gap-3 px-4 text-left text-pk-15 font-bold text-pk-ink disabled:text-pk-muted";
  const itemIconClassName =
    "inline-flex size-9 shrink-0 items-center justify-center rounded-pk-sm bg-pk-primary-soft text-pk-primary";

  return (
    <div className="relative">
      {/* 메뉴는 + 버튼(66px) 위 14px에 뜨고, 버튼 가운데(오른쪽 33px, 아래 14+33px)에서 커지며 나온다 */}
      {isOpen ? (
        <div
          role="menu"
          aria-label="새로 만들기"
          className="absolute right-0 bottom-[calc(66px+14px)] w-[220px] origin-[calc(100%-33px)_calc(100%+47px)] animate-plus-menu-pop motion-reduce:animate-none rounded-pk-lg bg-white py-1.5 shadow-[0_12px_32px] shadow-pk-ink/20"
        >
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            disabled={isDisabled}
            onClick={onRecordMatch}
            className={itemClassName}
          >
            <span className={itemIconClassName}>
              <ScoreIcon />
            </span>
            경기 기록
          </button>
          <div className="mx-4 h-px bg-pk-divider" />
          <button
            type="button"
            role="menuitem"
            disabled={isDisabled}
            onClick={onCreateSession}
            className={itemClassName}
          >
            <span className={itemIconClassName}>
              <SessionIcon />
            </span>
            세션 만들기
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={isOpen ? "닫기" : "경기 기록·세션 만들기"}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex size-[66px] shrink-0 items-center justify-center rounded-full bg-pk-primary text-white shadow-[0_8px_18px] shadow-pk-ink/18 transition-transform duration-200 touch-manipulation active:scale-[0.92] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        {/* 열리면 +를 돌려 ×로 만든다 */}
        <span
          className={`flex transition-transform duration-[380ms] ease-pk-spring motion-reduce:transition-none ${isOpen ? "rotate-[135deg]" : ""}`}
        >
          <PlusIcon />
        </span>
      </button>
    </div>
  );
};

/** 하단 바 위 알림 알약(높이 60). 하이라이트 점, 두 줄 문구, 블루 버튼 */
const DockBar: React.FC<{
  title: string;
  description: string;
  actionLabel: string;
  isActionDisabled?: boolean;
  onAction: () => void;
  role?: string;
}> = ({ title, description, actionLabel, isActionDisabled, onAction, role }) => (
  <div
    role={role}
    className="app-glass flex h-[60px] items-center gap-2.5 rounded-full pr-[7px] pl-4"
  >
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full bg-pk-hl"
    />
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-pk-15 font-bold text-pk-ink">{title}</span>
      <span className="truncate text-pk-12 text-pk-sub">{description}</span>
    </div>
    <button
      type="button"
      disabled={isActionDisabled}
      onClick={onAction}
      className="ml-auto flex h-[46px] shrink-0 items-center rounded-full bg-pk-primary px-[18px] text-pk-15 font-extrabold text-white disabled:bg-pk-neutral disabled:text-pk-muted"
    >
      {actionLabel}
    </button>
  </div>
);

const MINUTE_MS = 60_000;

/** 1분마다 바뀌는 현재 시각 */
const useMinuteClock = () => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return now;
};

const joinNames = (players: { username: string }[]) =>
  players.map((teamPlayer) => teamPlayer.username).join(" · ");

/** 진행 중인 내 경기 미니바 */
export const MyMatchBar: React.FC<{
  match: MatchInfo;
  playerId: string;
  isActionDisabled: boolean;
  onEnterScore: () => void;
}> = ({ match, playerId, isActionDisabled, onEnterScore }) => {
  const now = useMinuteClock();
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - new Date(match.matchStartsAt).getTime()) / MINUTE_MS),
  );
  const myTeamIndex = match.teams[1].players.some(
    (teamPlayer) => teamPlayer.id === playerId,
  )
    ? 1
    : 0;
  const myTeam = match.teams[myTeamIndex].players;
  const opponents = match.teams[myTeamIndex === 0 ? 1 : 0].players;
  const teammates = myTeam.filter((teamPlayer) => teamPlayer.id !== playerId);
  // 아이디가 영문이라 조사는 "와"로 고정한다
  const description =
    teammates.length > 0
      ? `${joinNames(teammates)}와 함께`
      : `${joinNames(opponents)}와 경기`;

  return (
    <DockBar
      title={`내 경기 · ${elapsedMinutes}분째`}
      description={description}
      actionLabel="점수 입력"
      isActionDisabled={isActionDisabled}
      onAction={onEnterScore}
    />
  );
};

/** 진행 중 세션에 아직 참여하지 않은 회원에게 보이는 참여 알림 바 */
export const JoinSessionBar: React.FC<{
  sessionName: string;
  isPending: boolean;
  hasError: boolean;
  isActionDisabled: boolean;
  onJoin: () => void;
}> = ({ sessionName, isPending, hasError, isActionDisabled, onJoin }) => (
  <DockBar
    role="status"
    title={`${sessionName} 진행 중`}
    description={
      hasError ? "참여하지 못했어요. 다시 시도해 주세요" : "아직 참여하지 않았어요"
    }
    actionLabel={isPending ? "참여 중…" : "참여하기"}
    isActionDisabled={isActionDisabled || isPending}
    onAction={onJoin}
  />
);
