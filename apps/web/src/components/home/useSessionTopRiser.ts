import { useEffect, useRef, useState } from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import {
  type DataVersionOptions,
  useDataVersion,
} from "@/context/DataSyncContext";
import { fetchSessionReport, RequestError } from "@/lib/rankings";

const TOP_RISER_DATA_KINDS = ["ratings"] as const;

/**
 * 진행 중 세션에서 지금까지 평점이 가장 많이 오른 회원(세션 리포트의 topRiser).
 * sessionId가 없으면 받지 않고, 평점 데이터 버전이 바뀌면(경기 완료·수정·삭제) 보이는 카드를 둔 채 다시 받는다.
 * 경기 시작 같은 matches 신호로는 받지 않는다(지배자는 평점이 바뀔 때만 바뀐다).
 * 리포트가 없으면(404, 완료 경기가 모두 삭제된 경우 등) 카드를 비운다.
 * 보조 카드라 그 밖의 실패는 오류를 띄우지 않고 이전 결과를 둔다(처음부터 실패하면 카드 없음).
 */
export const useSessionTopRiser = (
  sessionId: string | null,
  dataVersionOptions?: DataVersionOptions,
): SessionPlayerReport | null => {
  const dataVersion = useDataVersion(TOP_RISER_DATA_KINDS, dataVersionOptions);
  const [result, setResult] = useState<{
    sessionId: string;
    topRiser: SessionPlayerReport | null;
  } | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!sessionId) return;
    const requestId = ++requestIdRef.current;
    fetchSessionReport(sessionId).then(
      (report) => {
        if (requestIdRef.current !== requestId) return;
        setResult({ sessionId, topRiser: report.topRiser });
      },
      (error) => {
        if (requestIdRef.current !== requestId) return;
        if (error instanceof RequestError && error.status === 404) {
          setResult({ sessionId, topRiser: null });
        }
      },
    );
  }, [sessionId, dataVersion]);

  // 다른 세션의 이전 결과는 보이지 않는다
  return result && result.sessionId === sessionId ? result.topRiser : null;
};
