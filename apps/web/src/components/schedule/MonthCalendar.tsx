import React, { useRef, useState } from "react";
import { kstDateKeyToDate, WEEKDAY_LABELS } from "@pkpkdupr/shared/session";
import { addScheduleMonths, parseScheduleMonth } from "@pkpkdupr/shared/schedule";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { formatKstLongDate } from "@/lib/format";
import type { ScheduleDayMark } from "@/lib/schedule";
import { getMonthGridDateKeys, toMonthKey } from "./monthGrid";
import { useMonthSwipe } from "./useMonthSwipe";

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

/** 날짜 아래 점(+ 숫자). 내 것이면 속이 찬 점, 아니면 1.5px 테두리 원. 다른 달 날짜면 옅게 */
const DayMark: React.FC<{ mark: ScheduleDayMark; isDimmed: boolean }> = ({
  mark,
  isDimmed,
}) => {
  const isSession = mark.kind === "session";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex h-[18px] items-center gap-[3px] text-pk-12 font-bold tabular-nums",
        isSession ? "text-pk-primary" : "text-pk-sub",
        isDimmed && "opacity-45",
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

interface MonthPanelProps {
  monthKey: string;
  todayKey: string;
  selectedDateKey: string;
  marks: ReadonlyMap<string, ScheduleDayMark>;
  /** 가운데(보이는) 판이 아니면 트랙 옆에 숨어 있으므로 누를 수도 읽을 수도 없다 */
  isCurrent: boolean;
  onPressDate: (dateKey: string) => void;
}

/** 한 달 6주 판. 다른 달 날짜도 누를 수 있고, 숫자는 더 옅고 점은 반투명이다 */
const MonthPanel: React.FC<MonthPanelProps> = ({
  monthKey,
  todayKey,
  selectedDateKey,
  marks,
  isCurrent,
  onPressDate,
}) => (
  <div
    aria-hidden={isCurrent ? undefined : true}
    inert={!isCurrent}
    className="grid w-1/3 shrink-0 grid-cols-7 px-2"
  >
    {getMonthGridDateKeys(monthKey).map((dateKey) => {
      const isInMonth = toMonthKey(dateKey) === monthKey;
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
          onClick={() => onPressDate(dateKey)}
          className={cx(
            "flex h-[52px] min-w-0 flex-col items-center justify-start gap-[3px] px-px pt-0.5",
            !isInMonth
              ? "text-pk-quiet"
              : dateKey < todayKey
                ? "text-pk-muted"
                : "text-pk-ink",
          )}
        >
          <span
            className={cx(
              "flex size-7 items-center justify-center rounded-full text-pk-15 font-semibold",
              isSelected
                ? "bg-pk-primary font-extrabold text-white"
                : isToday && "bg-pk-hl font-extrabold text-pk-ink",
            )}
          >
            {Number(dateKey.slice(-2))}
          </span>
          {mark ? <DayMark mark={mark} isDimmed={!isInMonth} /> : null}
        </button>
      );
    })}
  </div>
);

/**
 * 일정 탭 월 달력. 머리는 이전 달 · "2026년 11월"(누르면 이번 달·오늘) · 다음 달.
 * 달마다 6주를 그려 높이가 같고, 이전·이번·다음 달 판을 가로로 이어 붙여 밀면 옆 달이 따라 들어온다. 제목은 판이 멈춘 뒤 바뀐다.
 * 오늘은 하이라이트 바탕, 고른 날은 블루 원(오늘을 고르면 고른 날 표시만), 지난 날은 muted, 다른 달 날짜는 더 옅다.
 * 달을 옮겨도 고른 날은 그대로이고, 다른 달 날짜를 누르면 그 날을 고르며 그 달로 넘어간다
 */
const MonthCalendar: React.FC<{
  monthKey: string;
  todayKey: string;
  selectedDateKey: string;
  /** 보이는 달과 앞뒤 달의 날짜 표시 */
  marks: ReadonlyMap<string, ScheduleDayMark>;
  /** 날짜를 고른다. 다른 달 날짜면 부모가 그 달로 옮긴다 */
  onSelectDate: (dateKey: string) => void;
  /** 보는 달을 step(1 다음 달, -1 이전 달)만큼 옮긴다 */
  onChangeMonth: (step: 1 | -1) => void;
  onGoToday: () => void;
}> = ({
  monthKey,
  todayKey,
  selectedDateKey,
  marks,
  onSelectDate,
  onChangeMonth,
  onGoToday,
}) => {
  const areaRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const { slideIn, isSliding } = useMonthSwipe(areaRef, trackRef, onChangeMonth);
  // 머리 제목은 슬라이드가 멈출 때까지 옮기기 전 달에 둔다
  const [titleMonthKey, setTitleMonthKey] = useState(monthKey);
  if (!isSliding && titleMonthKey !== monthKey) setTitleMonthKey(monthKey);

  const moveMonth = (step: 1 | -1) => {
    slideIn(step);
    onChangeMonth(step);
  };

  const pressDate = (dateKey: string) => {
    const dateMonthKey = toMonthKey(dateKey);
    if (dateMonthKey !== monthKey) {
      slideIn(dateMonthKey > monthKey ? 1 : -1);
    }
    onSelectDate(dateKey);
  };

  const panelMonthKeys = [
    addScheduleMonths(monthKey, -1),
    monthKey,
    addScheduleMonths(monthKey, 1),
  ];

  return (
    <section
      ref={areaRef}
      aria-label="달력"
      className="touch-pan-y touch-pinch-zoom overflow-hidden rounded-pk-lg bg-white px-2 pt-1 pb-2"
    >
      <div className="flex items-center justify-between">
        <MonthNavButton
          label="이전 달"
          direction="prev"
          onPress={() => moveMonth(-1)}
        />
        <button
          type="button"
          onClick={onGoToday}
          aria-label={`${formatMonthTitle(titleMonthKey)}, 누르면 오늘로 이동`}
          className="flex min-h-11 items-center px-3 text-pk-15 font-extrabold text-pk-ink tabular-nums"
        >
          {formatMonthTitle(titleMonthKey)}
        </button>
        <MonthNavButton
          label="다음 달"
          direction="next"
          onPress={() => moveMonth(1)}
        />
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
      </div>
      {/* 판은 카드 안쪽 여백까지 차지해 옆 달이 카드 끝에서 잘린다. 트랙은 가운데 판을 기본 위치로 둔다 */}
      <div className="-mx-2 overflow-hidden">
        <div ref={trackRef} className="flex w-[300%] -translate-x-1/3">
          {panelMonthKeys.map((panelMonthKey) => (
            <MonthPanel
              key={panelMonthKey}
              monthKey={panelMonthKey}
              todayKey={todayKey}
              selectedDateKey={selectedDateKey}
              marks={marks}
              isCurrent={panelMonthKey === monthKey}
              onPressDate={pressDate}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MonthCalendar;
