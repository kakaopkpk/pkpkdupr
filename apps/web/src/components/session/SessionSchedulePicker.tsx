import React, { useLayoutEffect, useRef, useState } from "react";
import { addScheduleMonths } from "@pkpkdupr/shared/schedule";
import {
  minutesToSessionTime,
  sessionTimeToMinutes,
} from "@pkpkdupr/shared/session";
import MonthCalendar from "@/components/schedule/MonthCalendar";
import { toMonthKey } from "@/components/schedule/monthGrid";
import { useScheduleMonthMarks } from "@/components/schedule/useScheduleMonthMarks";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx } from "@/components/ui/cx";

const SESSION_TIME_STEP_MINUTES = 30;
/** 길이 1~6시간 */
const SESSION_DURATION_OPTIONS_MINUTES = [60, 120, 180, 240, 300, 360];

/** 세션 만들기 달력에서 고를 수 있는 날짜인지(오늘 이후) */
export const isSessionDateSelectable = (dateKey: string, todayKey: string) =>
  dateKey >= todayKey;

/** "2시간" */
export const formatDurationHours = (minutes: number) => `${minutes / 60}시간`;

type StartTimeSegment = "dawn" | "morning" | "afternoon" | "evening";

/** 시간대마다 6시간(30분 칸 12개). 순서대로 0·6·12·18시에 시작한다 */
const SEGMENT_HOURS = 6;
const START_TIME_SEGMENTS: readonly { value: StartTimeSegment; label: string }[] =
  [
    { value: "dawn", label: "새벽" },
    { value: "morning", label: "오전" },
    { value: "afternoon", label: "오후" },
    { value: "evening", label: "저녁" },
  ];
const SEGMENT_SLOT_COUNT = (SEGMENT_HOURS * 60) / SESSION_TIME_STEP_MINUTES;

export const getStartTimeSegment = (startTime: string): StartTimeSegment =>
  START_TIME_SEGMENTS[
    Math.floor(sessionTimeToMinutes(startTime) / (SEGMENT_HOURS * 60))
  ].value;

const FieldLabel: React.FC<{
  id: string;
  label: string;
  detail?: React.ReactNode;
}> = ({ id, label, detail }) => (
  <div className="flex items-center justify-between gap-2">
    <span id={id} className="text-pk-13 font-bold text-pk-sub">
      {label}
    </span>
    {detail ? (
      <span className="truncate text-pk-13 font-bold text-pk-muted tabular-nums">
        {detail}
      </span>
    ) : null}
  </div>
);

/**
 * 세션 날짜를 고르는 달력. 일정 탭 달력(`MonthCalendar`)과 같은 모양·동작이다.
 * 처음에는 고른 날(없으면 오늘)이 든 달을 보이고, 지난 날만 누를 수 없으며 오늘이 든 달보다 앞으로는 넘기지 않는다
 */
export const SessionCalendar: React.FC<{
  todayKey: string;
  value: string | null;
  playerId: string | undefined;
  onChange: (dateKey: string) => void;
}> = ({ todayKey, value, playerId, onChange }) => {
  const [monthKey, setMonthKey] = useState(() =>
    toMonthKey(value ?? todayKey),
  );
  const marks = useScheduleMonthMarks(monthKey, playerId);

  return (
    <MonthCalendar
      monthKey={monthKey}
      todayKey={todayKey}
      selectedDateKey={value}
      marks={marks}
      onSelectDate={(dateKey) => {
        setMonthKey(toMonthKey(dateKey));
        onChange(dateKey);
      }}
      onChangeMonth={(step) => setMonthKey(addScheduleMonths(monthKey, step))}
      onGoToday={() => setMonthKey(toMonthKey(todayKey))}
      minDateKey={todayKey}
    />
  );
};

/** 6칸 그리드 라디오. 시작 시각과 길이가 같은 모양을 쓴다 */
function ChoiceGrid<T extends string | number>({
  labelId,
  options,
  value,
  format,
  isDisabled,
  onChange,
}: {
  labelId: string;
  options: readonly T[];
  value: T | null;
  format: (option: T) => string;
  isDisabled?: (option: T) => boolean;
  onChange: (option: T) => void;
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="grid grid-cols-6 gap-1.5"
    >
      {options.map((option) => {
        const isSelected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={isDisabled?.(option)}
            onClick={() => onChange(option)}
            className={cx(
              "h-10 rounded-pk-sm text-pk-13 tabular-nums transition-colors duration-150 motion-reduce:transition-none",
              isSelected
                ? "bg-pk-primary font-extrabold text-white"
                : "bg-pk-bg font-bold text-pk-sub disabled:text-pk-quiet",
            )}
          >
            {format(option)}
          </button>
        );
      })}
    </div>
  );
}

const formatTime = (time: string) => time;

/**
 * 시작 시각. 새벽·오전·오후·저녁 시간대를 고르면 그 시간대의 30분 칸 12개(6칸×2줄)를 보인다.
 * isDisabled가 true인 시각(오늘의 지난 시각)은 누를 수 없다
 */
export const SessionStartTimePicker: React.FC<{
  value: string | null;
  isDisabled: (startTime: string) => boolean;
  onChange: (startTime: string) => void;
}> = ({ value, isDisabled, onChange }) => {
  const [segment, setSegment] = useState<StartTimeSegment>(() =>
    value ? getStartTimeSegment(value) : "evening",
  );
  const fromMinutes =
    START_TIME_SEGMENTS.findIndex((option) => option.value === segment) *
    SEGMENT_HOURS *
    60;
  const times = Array.from({ length: SEGMENT_SLOT_COUNT }, (_, index) =>
    minutesToSessionTime(fromMinutes + index * SESSION_TIME_STEP_MINUTES),
  );

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel id="session-start-label" label="시작" />
      <SegmentedControl
        options={START_TIME_SEGMENTS}
        value={segment}
        onChange={setSegment}
        ariaLabel="시간대"
      />
      <ChoiceGrid
        labelId="session-start-label"
        options={times}
        value={value}
        format={formatTime}
        isDisabled={isDisabled}
        onChange={onChange}
      />
    </div>
  );
};

/** 길이 1~6시간 한 줄. 고르면 끝나는 시각을 오른쪽에 보인다 */
export const SessionDurationPicker: React.FC<{
  value: number | null;
  endLabel: string | null;
  onChange: (minutes: number) => void;
}> = ({ value, endLabel, onChange }) => (
  <div className="flex flex-col gap-2">
    <FieldLabel
      id="session-duration-label"
      label="길이"
      detail={endLabel ? `${endLabel} 종료` : undefined}
    />
    <ChoiceGrid
      labelId="session-duration-label"
      options={SESSION_DURATION_OPTIONS_MINUTES}
      value={value}
      format={formatDurationHours}
      onChange={onChange}
    />
  </div>
);

/** 고른 단계를 접은 한 줄. 누르면 그 단계를 다시 펼친다 */
export const StepSummaryRow: React.FC<{
  label: string;
  value: string;
  onPress: () => void;
  className?: string;
}> = ({ label, value, onPress, className }) => (
  <button
    type="button"
    aria-label={`${label} ${value}, 바꾸기`}
    onClick={onPress}
    className={cx(
      "flex h-12 w-full items-center gap-2.5 rounded-pk-sm bg-pk-bg pr-3 pl-3.5 text-left",
      className,
    )}
  >
    <span className="w-8 shrink-0 text-pk-13 font-bold text-pk-sub">
      {label}
    </span>
    <span className="min-w-0 flex-1 truncate text-pk-15 font-extrabold text-pk-ink tabular-nums">
      {value}
    </span>
    <ChevronRightIcon className="shrink-0 text-pk-muted" />
  </button>
);

/**
 * 안쪽 내용 높이를 재서 바깥 높이를 부드럽게 맞춘다. 단계가 펼쳐지고 접힐 때 시트 높이가 튀지 않게 한다.
 * 첫 측정 전에는 높이를 정하지 않아 처음 열 때는 애니메이션 없이 제 높이로 그린다
 */
export const AnimatedHeight: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const update = () => setHeight(inner.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={{ height }}
      className="overflow-hidden transition-[height] duration-[260ms] ease-pk-move motion-reduce:transition-none"
    >
      <div ref={innerRef} className={className}>
        {children}
      </div>
    </div>
  );
};
