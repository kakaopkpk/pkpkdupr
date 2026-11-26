import React, { useEffect, useRef, useState } from "react";
import type { MatchInfo } from "@/types/match";
import type { TabKey } from "@/context/TabNavigationContext";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { buttonPressClassName, rowPressClassName } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Icons";
import { formatElapsed, MINUTE_MS } from "@/lib/format";
import {
  PRESENCE_ENTER_CLASS,
  PRESENCE_EXIT_CLASS,
} from "@/hooks/usePresence";

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

const ScheduleIcon = () => (
  <svg width="22" height="22" strokeWidth={2} {...svgProps}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3v4M15 3v4" />
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
  { key: "schedule", label: "일정", Icon: ScheduleIcon },
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

/** + 버튼과 그 위에 뜨는 "새로 만들기" 메뉴. isLocked(게스트)면 + 버튼이 회색 비활성이고 메뉴를 열지 않는다 */
export const PlusMenu: React.FC<{
  isOpen: boolean;
  isDisabled: boolean;
  isLocked?: boolean;
  onToggle: () => void;
  onRecordMatch: () => void;
  onCreateSession: () => void;
}> = ({
  isOpen,
  isDisabled,
  isLocked = false,
  onToggle,
  onRecordMatch,
  onCreateSession,
}) => {
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen) firstItemRef.current?.focus();
  }, [isOpen]);

  const itemClassName =
    `flex min-h-14 w-full items-center gap-3 px-4 text-left text-pk-15 font-bold text-pk-ink disabled:text-pk-muted ${rowPressClassName}`;
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
        disabled={isLocked}
        onClick={onToggle}
        className={`flex size-[66px] shrink-0 items-center justify-center rounded-full touch-manipulation ${
          isLocked
            ? "bg-pk-neutral text-pk-muted"
            : "bg-pk-primary text-white shadow-[0_8px_18px] shadow-pk-ink/18"
        } ${buttonPressClassName}`}
      >
        {/* 열리면 +를 돌려 ×로 만든다 */}
        <span
          className={`flex transition-transform duration-[380ms] ease-pk-spring motion-reduce:transition-none ${isOpen ? "rotate-[135deg]" : ""}`}
        >
          <PlusIcon size={28} strokeWidth={2.4} />
        </span>
      </button>
    </div>
  );
};

/**
 * 하단 바 위 알림 알약(높이 60). 점(진행 중 알림은 깜빡이는 하이라이트, 세션 완료는 블루), 두 줄 문구, 블루 버튼.
 * 마운트되면 하단 바 뒤에서 올라오고, isExiting이면 가라앉으며 사라진다. 유리 재질이 흐림을 유지하도록 애니메이션은 이 루트에 건다
 */
const DockBar: React.FC<{
  title: string;
  description: string;
  actionLabel: string;
  isActionDisabled?: boolean;
  isExiting?: boolean;
  /** 없으면 버튼을 두지 않는다 */
  onAction?: () => void;
  /** 주면 점·제목·설명 부분을 눌러 연다 */
  onPressContent?: () => void;
  role?: string;
  dotTone?: "highlight" | "primary";
}> = ({
  title,
  description,
  actionLabel,
  isActionDisabled,
  isExiting = false,
  onAction,
  onPressContent,
  role,
  dotTone = "highlight",
}) => {
  const content = (
    <>
      <span aria-hidden="true" className="relative size-2.5 shrink-0">
        {dotTone === "highlight" ? (
          <>
            <span className="absolute inset-0 animate-pk-ping rounded-full bg-pk-hl motion-reduce:hidden" />
            <span className="absolute inset-0 rounded-full bg-pk-hl" />
          </>
        ) : (
          <span className="absolute inset-0 rounded-full bg-pk-primary" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-pk-15 font-bold text-pk-ink">{title}</span>
        <span className="truncate text-pk-12 text-pk-sub">{description}</span>
      </span>
    </>
  );

  return (
    <div
      role={role}
      inert={isExiting}
      className={`app-glass flex h-[60px] items-center gap-2.5 rounded-full pr-[7px] pl-4 ${
        isExiting
          ? `pointer-events-none ${PRESENCE_EXIT_CLASS}`
          : PRESENCE_ENTER_CLASS
      }`}
    >
      {onPressContent ? (
        <button
          type="button"
          onClick={onPressContent}
          className={`flex h-full min-w-0 flex-1 items-center gap-2.5 text-left ${rowPressClassName}`}
        >
          {content}
        </button>
      ) : (
        content
      )}
      {onAction ? (
        <button
          type="button"
          disabled={isActionDisabled}
          onClick={onAction}
          className={`ml-auto flex h-[46px] shrink-0 items-center rounded-full bg-pk-primary px-[18px] text-pk-15 font-extrabold text-white disabled:bg-pk-neutral disabled:text-pk-muted ${buttonPressClassName}`}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
};

const joinNames = (players: { username: string }[]) =>
  players.map((teamPlayer) => teamPlayer.username).join(" · ");

/** 진행 중인 내 경기 미니바 */
export const MyMatchBar: React.FC<{
  match: MatchInfo;
  playerId: string;
  isActionDisabled: boolean;
  isExiting?: boolean;
  /** 없으면(게스트) 점수 입력 버튼이 없다 */
  onEnterScore?: (matchId: string) => void;
  onOpenDetail: (matchId: string) => void;
}> = ({
  match,
  playerId,
  isActionDisabled,
  isExiting,
  onEnterScore,
  onOpenDetail,
}) => {
  const now = useMinuteClock();
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
      title={`내 경기 · ${formatElapsed(match.matchStartsAt, now)}`}
      description={description}
      actionLabel="점수 입력"
      isActionDisabled={isActionDisabled}
      isExiting={isExiting}
      onAction={onEnterScore ? () => onEnterScore(match.id) : undefined}
      onPressContent={() => onOpenDetail(match.id)}
    />
  );
};

/** 진행 중 세션에 아직 참여하지 않은 회원에게 보이는 참여 알림 바 */
export const JoinSessionBar: React.FC<{
  sessionName: string;
  isPending: boolean;
  hasError: boolean;
  isActionDisabled: boolean;
  isExiting?: boolean;
  onJoin: () => void;
}> = ({
  sessionName,
  isPending,
  hasError,
  isActionDisabled,
  isExiting,
  onJoin,
}) => (
  <DockBar
    role="status"
    title={`${sessionName} 진행 중`}
    description={
      hasError ? "참여하지 못했어요. 다시 시도해 주세요" : "아직 참여하지 않았어요"
    }
    actionLabel={isPending ? "참여 중…" : "참여하기"}
    isActionDisabled={isActionDisabled || isPending}
    isExiting={isExiting}
    onAction={onJoin}
  />
);

/**
 * 세션 종료 10분 전부터 자동 완료(정기 22:00, 회원·대회는 종료 시각) 전까지 어느 탭에서나 보이는 세션 완료 바.
 * "세션 완료"를 누르면 호출부가 확인 창을 띄운다
 */
export const CompleteSessionBar: React.FC<{
  /** 세션 종료 시각(정기 21:00). 이 전이면 종료 전 문구를 보인다 */
  endAt: Date;
  /** 자동 완료 시각 */
  autoCompleteAt: Date;
  isPending: boolean;
  hasError: boolean;
  isActionDisabled: boolean;
  isExiting?: boolean;
  onComplete: () => void;
}> = ({
  endAt,
  autoCompleteAt,
  isPending,
  hasError,
  isActionDisabled,
  isExiting,
  onComplete,
}) => {
  const now = useMinuteClock();
  // 남은 분은 올려 센다(21:59:30이면 "1분 뒤")
  const minutesLeft = Math.max(
    1,
    Math.ceil((autoCompleteAt.getTime() - now.getTime()) / MINUTE_MS),
  );

  return (
    <DockBar
      role="status"
      dotTone="primary"
      title={
        now.getTime() < endAt.getTime()
          ? "곧 세션 종료 시간이에요"
          : "세션 종료 시간이에요"
      }
      description={
        hasError
          ? "완료하지 못했어요. 다시 시도해 주세요"
          : `${minutesLeft}분 뒤 자동 완료`
      }
      actionLabel={isPending ? "완료 중…" : "세션 완료"}
      isActionDisabled={isActionDisabled || isPending}
      isExiting={isExiting}
      onAction={onComplete}
    />
  );
};
