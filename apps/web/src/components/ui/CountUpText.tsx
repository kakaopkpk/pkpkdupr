import React from "react";
import { cx } from "./cx";

export interface CountUpTextProps {
  /** 지금 보일 내용(세는 중인 값) */
  children: React.ReactNode;
  /** 자리 폭을 정하는 최종 내용. 화면에 보이지 않고 스크린 리더도 읽지 않는다 */
  finalContent: React.ReactNode;
  /** 잡아 둔 폭 안에서 지금 내용을 붙일 쪽. 기본 "end" */
  align?: "start" | "center" | "end";
  className?: string;
}

const ALIGN_CLASS = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
} as const;

/**
 * 세는 동안 자릿수가 바뀌어도 주변이 흔들리지 않게, 최종 내용 폭으로 자리를 잡아 두는 글자.
 * 지금 내용은 절대 위치라 폭에 영향을 주지 않으며, 최종보다 넓으면 정렬 반대쪽으로 넘친다
 */
export const CountUpText: React.FC<CountUpTextProps> = ({
  children,
  finalContent,
  align = "end",
  className,
}) => (
  <span className={cx("relative inline-block whitespace-nowrap", className)}>
    <span aria-hidden="true" className="invisible">
      {finalContent}
    </span>
    <span className={cx("absolute inset-0 flex", ALIGN_CLASS[align])}>
      {/* 글자 크기가 다른 요소가 바로 flex 항목이 되면 바깥 글꼴의 줄 기준선을 잃어 위로 뜬다.
          바깥 글꼴을 물려받는 span으로 감싸 자리 잡기 글자와 같은 기준선에 놓는다 */}
      <span>{children}</span>
    </span>
  </span>
);

export default CountUpText;
