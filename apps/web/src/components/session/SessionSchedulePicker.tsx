import React, { useLayoutEffect, useRef } from "react";
import {
  kstDateKeyToDate,
  minutesToSessionTime,
  REGULAR_SESSION_WEEKDAYS,
  sessionTimeToMinutes,
  toKstDateKey,
} from "@pkpkdupr/shared/session";
import { cx } from "@/components/ui/cx";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
/** 오늘부터 고를 수 있는 날 수(3주) */
const DATE_OPTION_COUNT = 21;
export const SESSION_TIME_STEP_MINUTES = 30;
/** 시작 시각 06:00~23:00, 종료 시각은 시작 30분 뒤~23:30 */
export const SESSION_FIRST_START_MINUTES = 6 * 60;
export const SESSION_LAST_START_MINUTES = 23 * 60;
export const SESSION_LAST_END_MINUTES = 23 * 60 + 30;
/** 선택한 칩 앞에 보일 여백. 앞 칩이 조금 보여 가로로 넘길 수 있음을 알린다 */
const SCROLL_LEAD_PX = 24;
/** 칩 줄 오른쪽 끝을 흐리는 폭. 이 안에 걸친 칩은 가려진 것으로 본다 */
const STRIP_FADE_PX = 40;

// 시트 좌우 여백(시트 16px + 폼 4px)까지 스크롤하고, 오른쪽 끝을 흐려 더 있다는 것을 보인다
const STRIP_CLASS_NAME =
  "-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent_100%)] [&::-webkit-scrollbar]:hidden";

/** 날짜 키의 월·일·요일(0=일). 날짜 키는 이미 KST 날짜라 UTC로 읽는다 */
const getDateParts = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return {
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
};

/** "11월 17일 월요일" */
export const formatSessionDateLong = (dateKey: string) => {
  const { month, day, weekday } = getDateParts(dateKey);
  return `${month}월 ${day}일 ${WEEKDAY_LABELS[weekday]}요일`;
};

const buildDateKeys = (todayKey: string) => {
  const todayStart = kstDateKeyToDate(todayKey).getTime();
  return Array.from({ length: DATE_OPTION_COUNT }, (_, index) =>
    toKstDateKey(new Date(todayStart + index * DAY_MS)),
  );
};

const buildTimes = (fromMinutes: number, toMinutes: number) => {
  const times: string[] = [];
  for (
    let minutes = fromMinutes;
    minutes <= toMinutes;
    minutes += SESSION_TIME_STEP_MINUTES
  ) {
    times.push(minutesToSessionTime(minutes));
  }
  return times;
};

const START_TIMES = buildTimes(
  SESSION_FIRST_START_MINUTES,
  SESSION_LAST_START_MINUTES,
);

/** value가 바뀔 때마다 선택한 칩이 보이도록 가로 스크롤을 맞춘다 */
const useScrollSelectedIntoView = (value: string) => {
  const stripRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!strip || !chip) return;
    const stripRect = strip.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    // 이미 다 보이는 칩이면 사용자가 둔 스크롤을 건드리지 않는다
    if (
      chipRect.left >= stripRect.left &&
      chipRect.right <= stripRect.right - STRIP_FADE_PX
    ) {
      return;
    }
    strip.scrollLeft +=
      chipRect.left - stripRect.left - SCROLL_LEAD_PX;
  }, [value]);

  return stripRef;
};

const FieldLabel: React.FC<{
  id: string;
  label: string;
  detail?: React.ReactNode;
}> = ({ id, label, detail }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span id={id} className="text-pk-13 font-bold text-pk-sub">
      {label}
    </span>
    {detail ? (
      <span className="truncate text-pk-13 font-bold text-pk-ink tabular-nums">
        {detail}
      </span>
    ) : null}
  </div>
);

/** 오늘부터 3주 날짜 칩. 월이 바뀌는 자리에 월 표시를 둔다. 정기 운동 요일은 점으로 표시한다 */
export const SessionDatePicker: React.FC<{
  todayKey: string;
  value: string;
  onChange: (dateKey: string) => void;
}> = ({ todayKey, value, onChange }) => {
  const stripRef = useScrollSelectedIntoView(value);
  const dateKeys = buildDateKeys(todayKey);

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel
        id="session-date-label"
        label="날짜"
        detail={formatSessionDateLong(value)}
      />
      <div
        ref={stripRef}
        role="radiogroup"
        aria-labelledby="session-date-label"
        className={STRIP_CLASS_NAME}
      >
        {dateKeys.map((dateKey, index) => {
          const { month, day, weekday } = getDateParts(dateKey);
          const isSelected = dateKey === value;
          const isRegular = REGULAR_SESSION_WEEKDAYS.includes(weekday);
          const topLabel =
            index === 0 ? "오늘" : index === 1 ? "내일" : WEEKDAY_LABELS[weekday];
          return (
            <React.Fragment key={dateKey}>
              {index === 0 || day === 1 ? (
                <span
                  aria-hidden="true"
                  className="flex w-5 shrink-0 items-center justify-center text-pk-12 font-bold text-pk-muted [writing-mode:vertical-rl]"
                >
                  {month}월
                </span>
              ) : null}
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${formatSessionDateLong(dateKey)}${index < 2 ? `(${topLabel})` : ""}${isRegular ? ", 정기 운동일" : ""}`}
                onClick={() => onChange(dateKey)}
                className={cx(
                  "flex h-[72px] w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-pk-sm transition-colors",
                  isSelected ? "bg-pk-primary text-white" : "bg-pk-bg text-pk-ink",
                )}
              >
                <span
                  className={cx(
                    "text-pk-12 font-bold",
                    isSelected
                      ? "text-white/85"
                      : weekday === 0
                        ? "text-pk-down"
                        : "text-pk-sub",
                  )}
                >
                  {topLabel}
                </span>
                <span className="text-pk-17 font-extrabold tabular-nums">
                  {day}
                </span>
                <span
                  aria-hidden="true"
                  className={cx(
                    "size-1 rounded-full",
                    !isRegular
                      ? "bg-transparent"
                      : isSelected
                        ? "bg-white"
                        : "bg-pk-primary",
                  )}
                />
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <p className="flex items-center gap-1.5 text-pk-12 text-pk-muted">
        <span aria-hidden="true" className="size-1 rounded-full bg-pk-primary" />
        정기 운동일(월·목)
      </p>
    </div>
  );
};

const TimeStrip: React.FC<{
  labelId: string;
  label: string;
  times: string[];
  value: string;
  onChange: (time: string) => void;
}> = ({ labelId, label, times, value, onChange }) => {
  const stripRef = useScrollSelectedIntoView(value);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-pk-12 font-bold text-pk-muted">
        {label}
      </span>
      <div
        ref={stripRef}
        role="radiogroup"
        aria-labelledby={labelId}
        className={STRIP_CLASS_NAME}
      >
        {times.map((time) => {
          const isSelected = time === value;
          return (
            <button
              key={time}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(time)}
              className={cx(
                "h-11 w-[66px] shrink-0 rounded-pk-sm text-pk-15 tabular-nums transition-colors",
                isSelected
                  ? "bg-pk-primary font-extrabold text-white"
                  : "bg-pk-bg font-bold text-pk-sub",
              )}
            >
              {time}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** "2시간" | "1시간 30분" | "30분" */
const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
};

/**
 * 시작·종료 시각 칩(30분 단위). 시작을 바꾸면 마지막으로 고른 진행 시간을 유지한 채 종료를 옮기고,
 * 하루를 넘기면 고를 수 있는 마지막 종료 시각에 맞춘다
 */
export const SessionTimePicker: React.FC<{
  startTime: string;
  endTime: string;
  onChange: (range: { startTime: string; endTime: string }) => void;
}> = ({ startTime, endTime, onChange }) => {
  const startMinutes = sessionTimeToMinutes(startTime);
  const endMinutes = sessionTimeToMinutes(endTime);
  // 늦은 시작 때문에 종료가 잘려도 원래 진행 시간을 기억해, 시작을 되돌리면 복원한다
  const preferredDurationRef = useRef(endMinutes - startMinutes);
  const endTimes = buildTimes(
    startMinutes + SESSION_TIME_STEP_MINUTES,
    SESSION_LAST_END_MINUTES,
  );

  const changeStart = (nextStart: string) => {
    const nextStartMinutes = sessionTimeToMinutes(nextStart);
    const nextEndMinutes = Math.min(
      nextStartMinutes + preferredDurationRef.current,
      SESSION_LAST_END_MINUTES,
    );
    onChange({
      startTime: nextStart,
      endTime: minutesToSessionTime(nextEndMinutes),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel
        id="session-time-label"
        label="시간"
        detail={`${startTime}~${endTime} · ${formatDuration(endMinutes - startMinutes)}`}
      />
      <div
        role="group"
        aria-labelledby="session-time-label"
        className="flex flex-col gap-3"
      >
        <TimeStrip
          labelId="session-start-time-label"
          label="시작"
          times={START_TIMES}
          value={startTime}
          onChange={changeStart}
        />
        <TimeStrip
          labelId="session-end-time-label"
          label="종료"
          times={endTimes}
          value={endTime}
          onChange={(nextEnd) => {
            preferredDurationRef.current =
              sessionTimeToMinutes(nextEnd) - startMinutes;
            onChange({ startTime, endTime: nextEnd });
          }}
        />
      </div>
    </div>
  );
};
