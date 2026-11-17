import React from "react";

/** 하단 버튼 위 빨간 13px 문구. 서버 오류·같은 점수 안내에 쓴다 */
export const FooterError: React.FC<{ message: string | null }> = ({
  message,
}) =>
  message ? (
    <p role="alert" className="mx-1 mb-2 text-pk-13 font-bold text-pk-down">
      {message}
    </p>
  ) : null;
