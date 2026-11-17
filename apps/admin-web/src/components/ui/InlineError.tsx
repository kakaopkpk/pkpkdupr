import React from "react";

/** 패널·대화상자 안에 보이는 입력 오류(4xx) 문구 */
export const InlineError: React.FC<{
  message: string | null;
  action?: React.ReactNode;
}> = ({ message, action }) => {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-center gap-2 text-pk-13 font-semibold text-pk-down">
      <span className="min-w-0 flex-1">{message}</span>
      {action}
    </div>
  );
};
