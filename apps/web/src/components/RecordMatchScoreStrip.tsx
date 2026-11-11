import React, { useLayoutEffect, useRef, useState } from "react";

// 듀스 연장·대회 룰로 점수가 11점을 넘을 수 있어 넉넉히 보여 주고, 더 높은 점수는 직접 입력한다
const SCORE_OPTION_MAX = 30;
const SCORE_OPTIONS = Array.from(
  { length: SCORE_OPTION_MAX + 1 },
  (_, n) => n,
);
const SCORE_CHIP_WIDTH = 44;
const DIRECT_SCORE_MAX_LENGTH = 2;
const INITIAL_CENTER_SCORE = 9;

interface RecordMatchScoreStripProps {
  teamIndex: 0 | 1;
  names: string;
  value: number | null;
  isWinner: boolean;
  onChange: (value: number) => void;
}

/**
 * 한 팀의 점수 줄. 마운트할 때만 선택 점수(없으면 9)를 가로 가운데로 맞추고,
 * 이후에는 사용자의 스크롤 위치를 유지한다. 다시 가운데로 맞추려면 부모가 key로 리마운트한다.
 */
const RecordMatchScoreStrip: React.FC<RecordMatchScoreStripProps> = ({
  teamIndex,
  names,
  value,
  isWinner,
  onChange,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef(value);
  const [isDirectInputOpen, setIsDirectInputOpen] = useState(false);
  const [directInput, setDirectInput] = useState("");
  const isDirectValue = value !== null && value > SCORE_OPTION_MAX;
  const directInputId = `record-score-direct-${teamIndex}`;
  const teamLabel = `Team ${teamIndex === 0 ? "A" : "B"}`;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const centerValue = initialValueRef.current;
    const target =
      centerValue !== null && centerValue > SCORE_OPTION_MAX
        ? el.querySelector<HTMLElement>("[data-score-direct]")
        : el.querySelector<HTMLElement>(
            `[data-score="${centerValue ?? INITIAL_CENTER_SCORE}"]`,
          );

    if (target) {
      // 점수 줄이 relative라서 offsetLeft는 줄 기준 위치다
      el.scrollLeft =
        target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
    }
  }, []);

  const openDirectInput = () => {
    setDirectInput(value === null ? "" : String(value));
    setIsDirectInputOpen(true);
  };

  const commitDirectInput = () => {
    if (!directInput) {
      return;
    }

    onChange(Number(directInput));
    setIsDirectInputOpen(false);
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border px-3 py-3 transition-colors ${
        isWinner ? "border-[#409eff] bg-[#409eff]/10" : "border-border bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="bs-text-caption font-semibold uppercase tracking-wide text-pkpk-sub-font">
            {teamLabel}
            {isWinner ? (
              <span className="ml-1.5 rounded-full bg-pkpk-accent-bg px-1.5 text-[0.65rem] text-pkpk-dark">
                WIN
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-pkpk-detail-font">{names}</p>
        </div>
        <span
          className={`shrink-0 font-bold tabular-nums leading-none ${
            value === null ? "text-sm text-pkpk-detail-font" : "text-[2rem]"
          } ${isWinner ? "text-pkpk-primary-bg" : "text-pkpk-main-font"}`}
        >
          {value ?? "—"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="relative flex snap-x gap-1.5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SCORE_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            data-score={n}
            aria-pressed={value === n}
            aria-label={`${teamLabel} ${n}점`}
            onClick={() => {
              setIsDirectInputOpen(false);
              onChange(n);
            }}
            style={{ width: SCORE_CHIP_WIDTH }}
            className={`shrink-0 snap-center rounded-xl border py-1.5 text-base font-semibold tabular-nums ${
              value === n
                ? "border-pkpk-main-font bg-pkpk-main-font text-white"
                : "border-border bg-white text-pkpk-main-font"
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          data-score-direct
          aria-pressed={isDirectValue}
          onClick={openDirectInput}
          className={`shrink-0 snap-center rounded-xl border px-3 py-2 text-xs font-medium ${
            isDirectValue
              ? "border-pkpk-main-font bg-pkpk-main-font text-base font-semibold tabular-nums text-white"
              : "border-dashed border-border text-pkpk-sub-font"
          }`}
        >
          {isDirectValue ? value : "직접"}
        </button>
      </div>
      {isDirectInputOpen ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            commitDirectInput();
          }}
        >
          <label htmlFor={directInputId} className="sr-only">
            {teamLabel} 점수 직접 입력
          </label>
          <input
            id={directInputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            maxLength={DIRECT_SCORE_MAX_LENGTH}
            value={directInput}
            onChange={(event) =>
              setDirectInput(
                event.target.value
                  .replace(/\D/g, "")
                  .slice(0, DIRECT_SCORE_MAX_LENGTH),
              )
            }
            placeholder="0~99"
            className="app-mobile-input min-w-0 flex-1 rounded-2xl border border-border bg-white px-4 py-2 text-base tabular-nums text-pkpk-sub-font outline-none"
          />
          <button
            type="submit"
            disabled={!directInput}
            className="shrink-0 rounded-2xl bg-pkpk-main-font px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            확인
          </button>
          <button
            type="button"
            onClick={() => setIsDirectInputOpen(false)}
            className="shrink-0 px-1 py-2 text-sm font-medium text-pkpk-detail-font"
          >
            취소
          </button>
        </form>
      ) : null}
    </div>
  );
};

export default RecordMatchScoreStrip;
