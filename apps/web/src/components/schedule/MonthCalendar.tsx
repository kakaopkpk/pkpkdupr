import React, { useState } from "react";
import { kstDateKeyToDate, WEEKDAY_LABELS } from "@pkpkdupr/shared/session";
import { addScheduleMonths } from "@pkpkdupr/shared/schedule";
import { buttonPressClassName } from "@/components/ui/Button";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { usePanelSwipe } from "@/hooks/usePanelSwipe";
import { formatKstLongDate } from "@/lib/format";
import type { ScheduleDayMark } from "@/lib/schedule";
import { formatMonthTitle, getMonthGridDateKeys, toMonthKey } from "./monthGrid";

const MonthNavButton: React.FC<{
  label: string;
  direction: "prev" | "next";
  disabled?: boolean;
  onPress: () => void;
}> = ({ label, direction, disabled, onPress }) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onPress}
    className={cx("flex size-11 items-center justify-center rounded-full text-pk-primary disabled:text-pk-quiet", buttonPressClassName)}
  >
    <ChevronRightIcon
      className={cx("size-5 shrink-0", direction === "prev" && "rotate-180")}
    />
  </button>
);

/** 날 표시 점 색: 내 것이면 채움(filled), 아니면 테두리(outlined) */
const dayMarkDotTones = {
  tournament: { filled: "bg-pk-hl", outlined: "border-pk-hl" },
  session: { filled: "bg-pk-primary", outlined: "border-pk-primary" },
  match: { filled: "bg-pk-sub", outlined: "border-pk-sub" },
} as const;

const LEGEND_ITEMS = [
  { label: "세션", dotClassName: dayMarkDotTones.session.filled },
  { label: "대회", dotClassName: dayMarkDotTones.tournament.filled },
  { label: "경기 기록", dotClassName: dayMarkDotTones.match.filled },
] as const;

/** 달력 위 오른쪽 점 범례 */
const DayMarkLegend: React.FC = () => (
  <ul
    aria-label="달력 표시"
    className="flex items-center justify-end gap-3 px-1 text-pk-12 font-bold text-pk-sub"
  >
    {LEGEND_ITEMS.map((item) => (
      <li key={item.label} className="flex items-center gap-1">
        <span
          aria-hidden="true"
          className={cx("size-2 shrink-0 rounded-full", item.dotClassName)}
        />
        {item.label}
      </li>
    ))}
  </ul>
);

/**
 * 날짜 아래 점(+ 숫자). 내 것이면 속이 찬 점, 아니면 1.5px 테두리 원. 다른 달 날짜면 옅게.
 * 대회 세션이 있는 날은 점 색만 하이라이트(pk-hl)이고 인원 글자색은 그대로다
 */
const DayMark: React.FC<{ mark: ScheduleDayMark; isDimmed: boolean }> = ({
  mark,
  isDimmed,
}) => {
  const isSession = mark.kind === "session";
  const dotTone =
    mark.kind === "session" && mark.isTournament
      ? dayMarkDotTones.tournament
      : isSession
        ? dayMarkDotTones.session
        : dayMarkDotTones.match;
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
          mark.isMine ? dotTone.filled : cx("border-[1.5px]", dotTone.outlined),
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
    mark?.kind === "session" &&
      `${mark.isTournament ? "대회" : "세션"} ${mark.participantCount}명 참여`,
    mark?.kind === "match" && "경기 기록",
    mark?.isMine && (mark.kind === "session" ? "참여 중" : "내 경기"),
  ]
    .filter(Boolean)
    .join(", ");

interface MonthPanelProps {
  monthKey: string;
  todayKey: string;
  selectedDateKey: string | null;
  marks: ReadonlyMap<string, ScheduleDayMark>;
  /** 이 날보다 앞은 누를 수 없다 */
  minDateKey?: string;
  /** 가운데(보이는) 판이 아니면 트랙 옆에 숨어 있으므로 누를 수도 읽을 수도 없다 */
  isCurrent: boolean;
  onPressDate: (dateKey: string) => void;
}

/**
 * 한 달 6주 판. 다른 달 날짜도 누를 수 있고, 숫자는 더 옅고 점은 반투명이다.
 * minDateKey보다 앞 날은 누를 수 없고 다른 달 날짜처럼 옅게 그린다
 */
const MonthPanel: React.FC<MonthPanelProps> = ({
  monthKey,
  todayKey,
  selectedDateKey,
  marks,
  minDateKey,
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
      const isDisabled = !!minDateKey && dateKey < minDateKey;
      const isDimmed = !isInMonth || isDisabled;
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
          disabled={isDisabled}
          onClick={() => onPressDate(dateKey)}
          className={cx(
            "flex h-[52px] min-w-0 flex-col items-center justify-start gap-[3px] px-px pt-0.5",
            isDimmed
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
          {mark ? <DayMark mark={mark} isDimmed={isDimmed} /> : null}
        </button>
      );
    })}
  </div>
);

/**
 * 일정 탭 월 달력. 머리는 이전 달 · "2026년 11월"(누르면 이번 달·오늘) · 다음 달.
 * 달마다 6주를 그려 높이가 같고, 이전·이번·다음 달 판을 가로로 이어 붙여 밀면 옆 달이 따라 들어온다. 제목은 판이 멈춘 뒤 바뀐다.
 * 오늘은 하이라이트 바탕, 고른 날은 블루 원(오늘을 고르면 고른 날 표시만), 지난 날은 muted, 다른 달 날짜는 더 옅다.
 * 달을 옮겨도 고른 날은 그대로이고, 다른 달 날짜를 누르면 그 날을 고르며 그 달로 넘어간다.
 * 카드 위 오른쪽에 점 범례를 둔다. minDateKey를 주면 그 앞 날은 누를 수 없고, 그 날이 든 달보다 앞으로는 버튼·밀기로 넘어가지 않는다
 */
const MonthCalendar: React.FC<{
  monthKey: string;
  todayKey: string;
  /** 아직 고르지 않았으면 null */
  selectedDateKey: string | null;
  /** 보이는 달과 앞뒤 달의 날짜 표시 */
  marks: ReadonlyMap<string, ScheduleDayMark>;
  /** 날짜를 고른다. 다른 달 날짜면 부모가 그 달로 옮긴다 */
  onSelectDate: (dateKey: string) => void;
  /** 보는 달을 step(1 다음 달, -1 이전 달)만큼 옮긴다 */
  onChangeMonth: (step: 1 | -1) => void;
  onGoToday: () => void;
  /** 고를 수 있는 첫날 */
  minDateKey?: string;
}> = ({
  monthKey,
  todayKey,
  selectedDateKey,
  marks,
  onSelectDate,
  onChangeMonth,
  onGoToday,
  minDateKey,
}) => {
  const [area, setArea] = useState<HTMLElement | null>(null);
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const canGoPrev = !minDateKey || monthKey > toMonthKey(minDateKey);
  const { slideIn, isSliding } = usePanelSwipe(
    area,
    track,
    onChangeMonth,
    (step) => step === 1 || canGoPrev,
  );
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
    <div className="flex flex-col gap-1.5">
      <DayMarkLegend />
        <section
        ref={setArea}
        aria-label="달력"
        className="touch-pan-y touch-pinch-zoom overflow-hidden rounded-pk-lg bg-white px-2 pt-1 pb-2"
      >
        <div className="flex items-center justify-between">
          <MonthNavButton
            label="이전 달"
            direction="prev"
            disabled={!canGoPrev}
            onPress={() => moveMonth(-1)}
          />
          <button
            type="button"
            onClick={onGoToday}
            aria-label={`${formatMonthTitle(titleMonthKey)}, 누르면 오늘로 이동`}
            className={cx("flex min-h-11 items-center px-3 text-pk-15 font-extrabold text-pk-ink tabular-nums", buttonPressClassName)}
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
          <div ref={setTrack} className="flex w-[300%] -translate-x-1/3">
            {panelMonthKeys.map((panelMonthKey) => (
              <MonthPanel
                key={panelMonthKey}
                monthKey={panelMonthKey}
                todayKey={todayKey}
                selectedDateKey={selectedDateKey}
                marks={marks}
                minDateKey={minDateKey}
                isCurrent={panelMonthKey === monthKey}
                onPressDate={pressDate}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default MonthCalendar;
