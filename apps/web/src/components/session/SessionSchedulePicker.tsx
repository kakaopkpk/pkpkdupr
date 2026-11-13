import React, { useLayoutEffect, useRef, useState } from "react";
import {
  addKstDays,
  kstDateKeyToDate,
  minutesToSessionTime,
  REGULAR_SESSION_WEEKDAYS,
  sessionTimeToMinutes,
  WEEKDAY_LABELS,
} from "@pkpkdupr/shared/session";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx } from "@/components/ui/cx";
import { formatKstLongDate } from "@/lib/format";

/** 오늘부터 고를 수 있는 날 수(3주) */
const DATE_OPTION_COUNT = 21;
const SESSION_TIME_STEP_MINUTES = 30;
/** 길이 1~6시간 */
const SESSION_DURATION_OPTIONS_MINUTES = [60, 120, 180, 240, 300, 360];

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

/** 날짜 키의 일·요일(0=일). 날짜 키는 이미 KST 날짜라 UTC로 읽는다 */
const getDateParts = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return {
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
};

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

const RegularDot: React.FC<{ className?: string }> = ({ className }) => (
  <span
    aria-hidden="true"
    className={cx("size-1 shrink-0 rounded-full bg-pk-primary", className)}
  />
);

/**
 * 오늘부터 3주를 고르는 달력. 오늘이 든 주 일요일부터 마지막 날이 든 주 토요일까지 7열로 그리고,
 * 범위 밖 날은 누를 수 없다. 숫자 아래 줄에 정기 운동일 점과 '오늘'·달이 바뀌는 날의 'N월'을 쓴다
 */
export const SessionCalendar: React.FC<{
  todayKey: string;
  value: string | null;
  onChange: (dateKey: string) => void;
}> = ({ todayKey, value, onChange }) => {
  const lastKey = addKstDays(todayKey, DATE_OPTION_COUNT - 1);
  const firstCellKey = addKstDays(todayKey, -getDateParts(todayKey).weekday);
  const lastCellKey = addKstDays(lastKey, 6 - getDateParts(lastKey).weekday);
  const cellKeys: string[] = [];
  // YYYY-MM-DD 문자열은 사전순이 날짜순이다
  for (let key = firstCellKey; key <= lastCellKey; key = addKstDays(key, 1)) {
    cellKeys.push(key);
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel
        id="session-date-label"
        label="날짜"
        detail={
          <span className="flex items-center gap-1.5">
            <RegularDot />
            정기 운동일
          </span>
        }
      />
      <div
        role="radiogroup"
        aria-labelledby="session-date-label"
        className="grid grid-cols-7 gap-x-1 gap-y-0.5"
      >
        {WEEKDAY_LABELS.map((label, weekday) => (
          <span
            key={label}
            aria-hidden="true"
            className={cx(
              "pb-0.5 text-center text-pk-12 font-bold",
              weekday === 0 ? "text-pk-down" : "text-pk-muted",
            )}
          >
            {label}
          </span>
        ))}
        {cellKeys.map((dateKey) => {
          const { month, day, weekday } = getDateParts(dateKey);
          const isDisabled = dateKey < todayKey || dateKey > lastKey;
          const isSelected = dateKey === value;
          const isRegular = REGULAR_SESSION_WEEKDAYS.includes(weekday);
          const note =
            dateKey === todayKey ? "오늘" : day === 1 ? `${month}월` : null;
          return (
            <button
              key={dateKey}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={[
                formatKstLongDate(kstDateKeyToDate(dateKey)),
                dateKey === todayKey && "오늘",
                isRegular && "정기 운동일",
              ]
                .filter(Boolean)
                .join(", ")}
              disabled={isDisabled}
              onClick={() => onChange(dateKey)}
              className={cx(
                "flex h-[46px] flex-col items-center justify-center gap-0.5 rounded-pk-sm transition-colors duration-150 motion-reduce:transition-none",
                isSelected ? "bg-pk-primary text-white" : "text-pk-ink",
              )}
            >
              <span
                className={cx(
                  "text-pk-15 leading-tight font-bold tabular-nums",
                  isDisabled
                    ? "text-pk-quiet"
                    : !isSelected && weekday === 0 && "text-pk-down",
                )}
              >
                {day}
              </span>
              <span
                className={cx(
                  "flex h-3 items-center gap-[3px] text-pk-12 leading-none font-bold",
                  isSelected
                    ? "text-white"
                    : isDisabled
                      ? "text-pk-quiet"
                      : "text-pk-primary",
                )}
              >
                {isRegular ? (
                  <RegularDot
                    className={
                      isSelected ? "bg-white" : isDisabled ? "bg-pk-line" : ""
                    }
                  />
                ) : null}
                {note}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
