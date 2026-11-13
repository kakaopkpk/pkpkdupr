import React from "react";
import { cx } from "./cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * #e3e7f0 알약 바탕, 선택 항목 흰 알약.
 * 흰 알약은 옵션과 분리된 인디케이터 하나이고 값이 바뀌면 translateX로만 미끄러진다.
 * 옵션 칸은 가장 긴 라벨 기준 같은 너비(auto-cols-fr)라 인디케이터 크기가 바뀌지 않는다.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "md" | "sm";
}): React.ReactElement {
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative grid shrink-0 auto-cols-fr grid-flow-col rounded-full bg-pk-neutral p-[3px]"
    >
      <span
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute inset-y-[3px] left-[3px] rounded-full bg-white shadow-[0_1px_2px] shadow-pk-ink/8",
          "transition-transform duration-[260ms] ease-pk-move motion-reduce:transition-none",
          selectedIndex < 0 && "opacity-0",
        )}
        style={{
          // 좌우 padding 3px씩을 뺀 너비를 칸 수로 나눈다
          width: `calc((100% - 6px) / ${Math.max(options.length, 1)})`,
          transform: `translateX(${Math.max(selectedIndex, 0) * 100}%)`,
        }}
      />
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => {
              if (!isSelected) onChange(option.value);
            }}
            className={cx(
              "relative whitespace-nowrap rounded-full text-pk-13 transition-colors duration-[120ms] ease-pk-move motion-reduce:transition-none",
              size === "sm" ? "h-[30px] px-3" : "h-[34px] px-3.5",
              isSelected
                ? "font-extrabold text-pk-ink"
                : "font-bold text-pk-sub",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 세그먼트로 바꾼 뒤 새로 보이는 목록을 200ms 페이드인한다.
 * 첫 마운트·dataVersion 재조회·keep-alive 탭 재표시에서 다시 재생하지 않도록
 * 쓰는 쪽이 세그먼트 onChange에서만 isPlaying을 켜고, 끝나면(onFinish) 끈다.
 */
export const SegmentSwitchFade: React.FC<{
  isPlaying: boolean;
  onFinish: () => void;
  className?: string;
  children: React.ReactNode;
}> = ({ isPlaying, onFinish, className, children }) => (
  <div
    className={cx(
      className,
      isPlaying && "animate-pk-fade-in motion-reduce:animate-none",
    )}
    onAnimationEnd={(event) => {
      // 자식 애니메이션 종료가 버블링돼 페이드를 일찍 끄지 않게 한다
      if (event.target === event.currentTarget) onFinish();
    }}
  >
    {children}
  </div>
);
