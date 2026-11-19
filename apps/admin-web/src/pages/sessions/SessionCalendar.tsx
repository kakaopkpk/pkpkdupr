import React, { useMemo } from "react";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import type { AdminRegularSessionSkip } from "@pkpkdupr/shared/session";
import { WEEKDAY_LABELS } from "@pkpkdupr/shared/session";
import { Card } from "../../components/ui/Card";
import { cx } from "../../components/ui/cx";
import {
  compareSessionsInDay,
  formatMonthTitle,
  getMonthGrid,
  getSessionDateKey,
} from "./sessionDates";
import { SKIP_LABELS } from "./regularSkipDay";
import { SESSION_KIND_PILL_CLASS } from "./sessionKind";

/** 우클릭 메뉴를 띄울 화면 좌표. 키보드(Shift+F10 등)로 열면 좌표가 0이라 그 칸 아래에 띄운다 */
const getMenuPosition = (event: React.MouseEvent<HTMLElement>) => {
  if (event.clientX !== 0 || event.clientY !== 0) {
    return { x: event.clientX, y: event.clientY };
  }
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + 8, y: rect.top + 32 };
};

const navButtonClassName =
  "flex size-8 items-center justify-center rounded-full text-pk-17 font-bold text-pk-sub hover:bg-pk-bg hover:text-pk-ink focus-visible:outline-2 focus-visible:outline-pk-primary";

const LegendSwatch: React.FC<{ className: string; label: string }> = ({
  className,
  label,
}) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden="true" className={cx("h-3 w-5 rounded-full", className)} />
    {label}
  </span>
);

export const SessionCalendar: React.FC<{
  monthKey: string;
  todayKey: string;
  sessions: ManagedMatchSession[];
  skips: AdminRegularSessionSkip[];
  selectedSessionId: string | undefined;
  /** 우클릭 메뉴가 열린 날짜(칸 테두리로 표시) */
  menuDateKey: string | null;
  onChangeMonth: (delta: number) => void;
  onSelectSession: (session: ManagedMatchSession) => void;
  onCreateOnDate: (dateKey: string) => void;
  onOpenDayMenu: (dateKey: string, position: { x: number; y: number }) => void;
}> = ({
  monthKey,
  todayKey,
  sessions,
  skips,
  selectedSessionId,
  menuDateKey,
  onChangeMonth,
  onSelectSession,
  onCreateOnDate,
  onOpenDayMenu,
}) => {
  const cells = useMemo(() => getMonthGrid(monthKey), [monthKey]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, ManagedMatchSession[]>();
    for (const session of sessions) {
      const dateKey = getSessionDateKey(session);
      const list = map.get(dateKey);
      if (list) list.push(session);
      else map.set(dateKey, [session]);
    }
    for (const list of map.values()) list.sort(compareSessionsInDay);
    return map;
  }, [sessions]);

  const skipByDate = useMemo(
    () => new Map(skips.map((skip) => [skip.dateKey, skip.reason])),
    [skips],
  );

  const selectedDateKey = useMemo(() => {
    const selected = sessions.find((session) => session.id === selectedSessionId);
    return selected ? getSessionDateKey(selected) : null;
  }, [sessions, selectedSessionId]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => onChangeMonth(-1)}
            className={navButtonClassName}
          >
            ‹
          </button>
          <h2 className="min-w-[120px] text-center text-pk-17 font-bold text-pk-ink tabular-nums">
            {formatMonthTitle(monthKey)}
          </h2>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => onChangeMonth(1)}
            className={navButtonClassName}
          >
            ›
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-pk-12 font-semibold text-pk-sub">
          <LegendSwatch className="bg-pk-primary" label="정기" />
          <LegendSwatch
            className="border border-pk-primary-line bg-white"
            label="회원 세션"
          />
          <LegendSwatch className="bg-pk-ink" label="대회" />
          <LegendSwatch className="bg-pk-divider" label="지난 세션" />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="pb-1 text-center text-pk-12 font-bold text-pk-muted"
          >
            {label}
          </div>
        ))}
        {cells.map((dateKey, index) => {
          if (!dateKey) return <div key={`blank-${index}`} aria-hidden="true" />;

          const daySessions = sessionsByDate.get(dateKey) ?? [];
          const skipReason = skipByDate.get(dateKey);
          const isPastDay = dateKey < todayKey;
          const isToday = dateKey === todayKey;
          const isSelectedDay = dateKey === selectedDateKey;
          const day = Number(dateKey.slice(8));
          const dayNumberClassName = cx(
            "inline-flex size-6 items-center justify-center rounded-full text-pk-13 font-bold tabular-nums",
            isToday
              ? "bg-pk-primary text-white"
              : isPastDay
                ? "text-pk-muted"
                : "text-pk-ink",
          );

          return (
            <div
              key={dateKey}
              // 오늘·미래 칸은 누르면 세션 만들기, 우클릭하면 날짜 메뉴다. 키보드는 날짜 숫자 버튼으로 같은 동작을 한다
              onClick={isPastDay ? undefined : () => onCreateOnDate(dateKey)}
              onContextMenu={
                isPastDay
                  ? undefined
                  : (event) => {
                      event.preventDefault();
                      onOpenDayMenu(dateKey, getMenuPosition(event));
                    }
              }
              className={cx(
                "flex min-h-[76px] flex-col items-start rounded-pk-sm p-2 text-left",
                isPastDay ? "bg-white" : "cursor-pointer bg-pk-bg",
                isSelectedDay && "bg-pk-primary-soft ring-2 ring-inset ring-pk-primary",
                !isSelectedDay &&
                  !isPastDay &&
                  (dateKey === menuDateKey
                    ? "ring-1 ring-inset ring-pk-primary-line"
                    : "hover:ring-1 hover:ring-inset hover:ring-pk-primary-line"),
              )}
            >
              {isPastDay ? (
                <span className={dayNumberClassName}>{day}</span>
              ) : (
                <button
                  type="button"
                  aria-label={`${dateKey} 세션 만들기`}
                  className={cx(
                    dayNumberClassName,
                    "focus-visible:outline-2 focus-visible:outline-pk-primary",
                  )}
                >
                  {day}
                </button>
              )}
              {skipReason && (
                <span className="mt-1 block text-pk-12 font-semibold text-pk-muted">
                  {SKIP_LABELS[skipReason]}
                </span>
              )}
              {daySessions.length > 0 && (
                <div className="mt-1 flex w-full flex-col gap-1">
                  {daySessions.map((session) => {
                    const label = isPastDay
                      ? `${session.matchCount}경기`
                      : `${session.participantIds.length}명`;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        title={session.name}
                        aria-label={`${session.name} ${label}`}
                        aria-pressed={session.id === selectedSessionId}
                        onClick={(event) => {
                          // 칸 누르기(세션 만들기)로 번지지 않게 한다
                          event.stopPropagation();
                          onSelectSession(session);
                        }}
                        className={cx(
                          "h-6 w-full truncate rounded-full px-2 text-pk-12 font-bold tabular-nums",
                          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pk-primary",
                          isPastDay
                            ? "bg-pk-divider text-pk-sub hover:bg-pk-neutral"
                            : SESSION_KIND_PILL_CLASS[session.kind],
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-pk-13 text-pk-muted">
        날짜를 누르면 그 날짜로 세션 만들기가 열리고, 오른쪽 클릭하면 정기 쉬는 날을
        지정·해제할 수 있어요. 정기 세션은 28일 앞까지 미리 만들어져 있어요.
      </p>
    </Card>
  );
};
