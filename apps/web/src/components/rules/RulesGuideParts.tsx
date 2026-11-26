import React, { useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";

/** 그림은 이 크기(폭 390 화면의 카드 안 그림 칸) 고정 좌표로 그렸다 */
const STAGE_WIDTH = 298;
const STAGE_HEIGHT = 220;

/**
 * 카드 위 그림 칸(연한 파랑 바탕). 고정 좌표 그림을 칸 폭에 맞춰 같은 비율로 늘이거나 줄이고,
 * 칸 높이도 그 비율을 따른다(390 화면에서 298×220).
 * label을 주면 칸 전체를 그림 하나로 읽힌다(안의 SVG가 스스로 설명을 가지면 생략).
 * className은 고정 좌표 그림 판에 붙는다(옆에서 본 그림의 움직임 범위 .g3)
 */
export const RuleFigure: React.FC<{
  label?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, className, children }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const update = () => {
      const width = frame.clientWidth;
      // 숨은 화면(폭 0)에서는 마지막 비율을 둔다
      if (width > 0) setScale(width / STAGE_WIDTH);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      role={label ? "img" : undefined}
      aria-label={label}
      className="relative shrink-0 overflow-hidden rounded-pk-sm bg-pk-primary-soft"
      style={{ height: STAGE_HEIGHT * scale }}
    >
      <div
        className={cx("absolute top-0 left-0 origin-top-left", className)}
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: scale === 1 ? undefined : `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** 작은 머리 글자("규칙 n/12"·"부록 n/3") + 제목 22 */
export const RuleHeading: React.FC<{ eyebrow: string; title: string }> = ({
  eyebrow,
  title,
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-pk-13 font-bold text-pk-primary">{eyebrow}</span>
    <h2 className="text-pk-22 font-extrabold text-pk-ink">{title}</h2>
  </div>
);

/**
 * 점 목록. 장면마다 한 줄씩 강조하는 장면 방식 카드(scene)는 줄에 강조 바탕 여백(.g2 .row)이 있어 줄 간격이 좁다
 */
export const RuleList: React.FC<{
  scene?: boolean;
  children: React.ReactNode;
}> = ({ scene = false, children }) => (
  <ul className={cx("flex flex-col", scene ? "gap-0.5" : "gap-2.5")}>
    {children}
  </ul>
);

/**
 * 점 목록 한 줄. 폴트처럼 하면 안 되는 줄은 빨간 점(tone "fault")이다.
 * row를 주면 그 장면 동안 줄이 연한 파랑 바탕이 된다(rulesGuide.css의 .g2 .row .r{n})
 */
export const RuleItem: React.FC<{
  tone?: "default" | "fault";
  row?: string;
  children: React.ReactNode;
}> = ({ tone = "default", row, children }) => (
  <li
    className={cx(
      "flex gap-2.5 text-pk-15 leading-[1.5] text-pk-ink",
      row && `row ${row}`,
    )}
  >
    <span
      aria-hidden="true"
      className={cx(
        "mt-[9px] size-1.5 shrink-0 rounded-full",
        tone === "fault" ? "bg-pk-down" : "bg-pk-primary",
      )}
    />
    <span>{children}</span>
  </li>
);

/** 점 없는 본문 문단 */
export const RuleParagraph: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <p className="text-pk-15 leading-[1.5] text-pk-ink">{children}</p>;

/** 왼쪽 64px 이름 칸 + 오른쪽 설명(에티켓·피카피카 방식 표) */
export const RuleTableRow: React.FC<{
  label: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ label, className, style, children }) => (
  <div className={cx("flex items-center gap-3", className)} style={style}>
    <span className="w-16 shrink-0 text-pk-13 font-bold text-pk-sub">
      {label}
    </span>
    <span className="min-w-0 flex-1 text-pk-15 text-pk-ink">{children}</span>
  </div>
);
