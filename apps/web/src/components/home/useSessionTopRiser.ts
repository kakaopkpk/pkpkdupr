import { useEffect, useRef, useState } from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import { fetchSessionReport } from "@/lib/rankings";

/**
 * 진행 중 세션에서 지금까지 평점이 가장 많이 오른 회원(세션 리포트의 topRiser).
 * sessionId가 없으면 받지 않고, dataVersion이 바뀌면(경기 완료 등) 보이는 카드를 둔 채 다시 받는다.
 * 보조 카드라 실패해도 오류를 띄우지 않고 이전 결과를 둔다(처음부터 실패하면 카드 없음).
 */
export const useSessionTopRiser = (
  sessionId: string | null,
  dataVersion: number,
): SessionPlayerReport | null => {
  const [topRiser, setTopRiser] = useState<{
    sessionId: string;
    report: SessionPlayerReport | null;
  } | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!sessionId) return;
    const requestId = ++requestIdRef.current;
    fetchSessionReport(sessionId).then(
      (report) => {
        if (requestIdRef.current !== requestId) return;
        setTopRiser({ sessionId, report: report.topRiser });
      },
      () => {},
    );
  }, [sessionId, dataVersion]);

  // 다른 세션의 이전 결과는 보이지 않는다
  return topRiser && topRiser.sessionId === sessionId ? topRiser.report : null;
};
