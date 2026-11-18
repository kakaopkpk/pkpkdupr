import React from "react";
import {
  addKstDays,
  getKstWeekday,
  kstDateKeyToDate,
  WEEKDAY_LABELS,
} from "@pkpkdupr/shared/session";
import {
  getScheduleMonthDateKeyRange,
  parseScheduleMonth,
} from "@pkpkdupr/shared/schedule";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { formatKstLongDate } from "@/lib/format";
import type { ScheduleDayMark } from "@/lib/schedule";

const DAYS_PER_WEEK = 7;

/** 그 달 첫날이 든 주 일요일부터 마지막 날이 든 주 토요일까지의 날짜 키 */
const getMonthCellKeys = (monthKey: string): string[] => {
  const { fromDateKey, toDateKey } = getScheduleMonthDateKeyRange(monthKey);
  const lastKey = addKstDays(toDateKey, -1);
  const startKey = addKstDays(fromDateKey, -getKstWeekday(fromDateKey));
  const endKey = addKstDays(lastKey, DAYS_PER_WEEK - 1 - getKstWeekday(lastKey));
  const keys: string[] = [];
  // YYYY-MM-DD 문자열은 사전순이 날짜순이다
  for (let key = startKey; key <= endKey; key = addKstDays(key, 1)) {
    keys.push(key);
  }
  return keys;
};

/** "2026년 11월" */
const formatMonthTitle = (monthKey: string) => {
  const parsed = parseScheduleMonth(monthKey);
  return parsed ? `${parsed.year}년 ${parsed.month}월` : monthKey;
};

const MonthNavButton: React.FC<{
  label: string;
  direction: "prev" | "next";
  onPress: () => void;
}> = ({ label, direction, onPress }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onPress}
    className="flex size-11 items-center justify-center rounded-full text-pk-primary active:bg-pk-primary-soft"
  >
    <ChevronRightIcon
      className={cx("size-5 shrink-0", direction === "prev" && "rotate-180")}
    />
  </button>
);

/** 날짜 아래 점(+ 숫자). 내 것이면 속이 찬 점, 아니면 1.5px 테두리 원 */
const DayMark: React.FC<{ mark: ScheduleDayMark }> = ({ mark }) => {
  const isSession = mark.kind === "session";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex h-[18px] items-center gap-[3px] text-pk-12 font-bold tabular-nums",
        isSession ? "text-pk-primary" : "text-pk-sub",
      )}
    >
      <span
        className={cx(
          "size-2 shrink-0 rounded-full",
          mark.isMine
            ? isSession
              ? "bg-pk-primary"
              : "bg-pk-sub"
            : cx(
                "border-[1.5px]",
                isSession ? "border-pk-primary" : "border-pk-sub",
              ),
        )}
      />
      {isSession ? mark.participantCount : null}
    </span>
  );
};

/** 스크린 리더용 날짜 설명: "11월 19일 목요일, 오늘, 세션 9명 참여, 참여 중" */
const getDayLabel = (
  dateKey: string,
  isToday: boolean,
  mark: ScheduleDayMark | undefined,
) =>
  [
    formatKstLongDate(kstDateKeyToDate(dateKey)),
    isToday && "오늘",
    mark?.kind === "session" && `세션 ${mark.participantCount}명 참여`,
    mark?.kind === "match" && "경기 기록",
    mark?.isMine && (mark.kind === "session" ? "참여 중" : "내 경기"),
  ]
    .filter(Boolean)
    .join(", ");

/**
 * 일정 탭 월 달력. 머리는 이전 달 · "2026년 11월"(누르면 이번 달·오늘) · 다음 달.
 * 오늘은 하이라이트 바탕, 고른 날은 블루 원(오늘을 고르면 고른 날 표시만), 지난 날은 muted, 이번 달 밖 날은 더 옅고 누를 수 없다
 */
const MonthCalendar: React.FC<{
  monthKey: string;
  todayKey: string;
  selectedDateKey: string;
  marks: ReadonlyMap<string, ScheduleDayMark>;
  onSelectDate: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToday: () => void;
}> = ({
  monthKey,
  todayKey,
  selectedDateKey,
  marks,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onGoToday,
}) => {
  const cellKeys = getMonthCellKeys(monthKey);

  return (
    <section
      aria-label="달력"
      className="rounded-pk-lg bg-white px-2 pt-1 pb-2"
    >
      <div className="flex items-center justify-between">
        <MonthNavButton label="이전 달" direction="prev" onPress={onPrevMonth} />
        <button
          type="button"
          onClick={onGoToday}
          aria-label={`${formatMonthTitle(monthKey)}, 누르면 오늘로 이동`}
          className="flex min-h-11 items-center px-3 text-pk-15 font-extrabold text-pk-ink tabular-nums"
        >
          {formatMonthTitle(monthKey)}
        </button>
        <MonthNavButton label="다음 달" direction="next" onPress={onNextMonth} />
      </div>
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            aria-hidden="true"
            className="h-[22px] text-center text-pk-12 leading-[22px] font-bold text-pk-sub"
          >
            {label}
          </span>
        ))}
        {cellKeys.map((dateKey) => {
          const day = Number(dateKey.slice(-2));
          const isInMonth = dateKey.startsWith(monthKey);
          const cellClassName =
            "flex h-[52px] min-w-0 flex-col items-center justify-start gap-[3px] px-px pt-0.5";

          if (!isInMonth) {
            return (
              <span
                key={dateKey}
                aria-hidden="true"
                className={cx(cellClassName, "text-pk-quiet")}
              >
                <span className="flex size-7 items-center justify-center text-pk-15 font-semibold tabular-nums">
                  {day}
                </span>
              </span>
            );
          }

          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === todayKey;
          const mark = marks.get(dateKey);
          return (
            <button
              key={dateKey}
              type="button"
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={getDayLabel(dateKey, isToday, mark)}
              onClick={() => onSelectDate(dateKey)}
              className={cx(
                cellClassName,
                dateKey < todayKey ? "text-pk-muted" : "text-pk-ink",
              )}
            >
              <span
                className={cx(
                  "flex size-7 items-center justify-center rounded-full text-pk-15 font-semibold tabular-nums",
                  isSelected
                    ? "bg-pk-primary font-extrabold text-white"
                    : isToday &&
                        "bg-pk-hl font-extrabold text-pk-ink",
                )}
              >
                {day}
              </span>
              {mark ? <DayMark mark={mark} /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default MonthCalendar;
