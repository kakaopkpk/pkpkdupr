import React from "react";
import { cx } from "./cx";

/** 흰 바탕·20px 둥글기·테두리 없음·패딩 20. 카드 제목은 text-pk-17 font-bold로 쓴다. */
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => <div className={cx("rounded-pk-lg bg-white p-5", className)} {...rest} />;
