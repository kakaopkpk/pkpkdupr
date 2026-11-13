import React from "react";
import { PkButton } from "./Button";
import { cx } from "./cx";

type StateMessageSize = "panel" | "inline";

type StateMessageProps =
  | {
      kind: "empty";
      message: string;
      /** panel=탭·화면 전체(py-12), inline=카드·목록·시트 안(py-6). 기본 inline */
      size?: StateMessageSize;
      className?: string;
    }
  | {
      kind: "error";
      message: string;
      onRetry: () => void;
      size?: StateMessageSize;
      className?: string;
    };

const sizeClassName: Record<StateMessageSize, string> = {
  panel: "py-12",
  inline: "py-6",
};

/** 빈 상태와 불러오기 실패 표시. 불러오기 실패는 항상 "다시 시도" 버튼을 함께 보인다 */
export const StateMessage: React.FC<StateMessageProps> = (props) => {
  const { kind, message, size = "inline", className } = props;

  if (kind === "empty") {
    return (
      <p
        className={cx(
          "text-center text-pk-13 text-pk-muted",
          sizeClassName[size],
          className,
        )}
      >
        {message}
      </p>
    );
  }

  return (
    <div
      className={cx(
        "flex flex-col items-center gap-3 text-center",
        sizeClassName[size],
        className,
      )}
    >
      <p role="alert" className="text-pk-13 text-pk-sub">
        {message}
      </p>
      <PkButton variant="soft" size="sm" onClick={props.onRetry}>
        다시 시도
      </PkButton>
    </div>
  );
};
