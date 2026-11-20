import { useCallback, useEffect, useRef, useState } from "react";
import type { ParticipationAction } from "@/components/session/SessionBlueCard";
import { getErrorMessage } from "@/components/session/saveError";
import { useInvalidateData } from "@/context/DataSyncContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import { isNetworkError } from "@/lib/errors";
import {
  addMatchSessionParticipant,
  removeMatchSessionParticipant,
} from "@/lib/matchSessions";

interface PendingParticipation {
  sessionId: string;
  action: ParticipationAction;
  /** 성공 뒤 이 dataVersion 이상으로 새로 받은 데이터가 와야 버튼을 푼다. 요청 중이면 null */
  awaitVersion: number | null;
}

/**
 * 세션 카드의 내 참여하기·참여 취소. 한 번에 하나만 보내고, 성공하면 세션을 무효화해 다시 받게 한 뒤
 * 화면이 그 버전 이상의 데이터를 받을 때(loadedVersion)까지 버튼을 막는다.
 * 네트워크 오류는 저장 실패 토스트(다시 시도), 서버 오류는 그 세션 카드 아래 문구로 알린다.
 */
export const useSessionParticipation = ({
  playerId,
  dataVersion,
  loadedVersion,
}: {
  playerId: string | undefined;
  /** 카드 데이터를 받는 쪽의 useDataVersion 값. 세션 종류를 포함해야 한다 */
  dataVersion: number;
  /** 마지막으로 끝난 로드가 시작될 때의 dataVersion */
  loadedVersion: number;
}) => {
  const invalidateData = useInvalidateData();
  const { showSaveFailure } = useSystemNotice();
  // 비동기 요청이 끝난 시점에 최신 dataVersion을 읽기 위한 ref
  const dataVersionRef = useRef(dataVersion);
  dataVersionRef.current = dataVersion;

  const [pending, setPending] = useState<PendingParticipation | null>(null);
  const [error, setError] = useState<{ sessionId: string; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (pending?.awaitVersion != null && loadedVersion >= pending.awaitVersion) {
      setPending(null);
    }
  }, [loadedVersion, pending]);

  const change = async (sessionId: string, action: ParticipationAction) => {
    if (!playerId || pending) return;

    const run = async () => {
      if (action === "join") {
        await addMatchSessionParticipant(sessionId, playerId);
      } else {
        await removeMatchSessionParticipant(sessionId, playerId);
      }
      // 세션 무효화로 보이는 화면의 dataVersion이 1 오르고 그 값으로 다시 받는다(숨은 화면은 보일 때).
      // 요청 중 다른 곳에서 올린 버전도 반영하도록 호출 직전의 최신 값을 기준으로 삼는다
      const awaitVersion = dataVersionRef.current + 1;
      invalidateData(["sessions"]);
      return awaitVersion;
    };

    setPending({ sessionId, action, awaitVersion: null });
    setError(null);
    try {
      const awaitVersion = await run();
      setPending({ sessionId, action, awaitVersion });
    } catch (err) {
      setPending(null);
      if (isNetworkError(err)) {
        showSaveFailure({
          onRetry: async () => {
            await run();
          },
        });
      } else {
        setError({
          sessionId,
          message: getErrorMessage(
            err,
            action === "join" ? "참여하지 못했어요." : "참여를 취소하지 못했어요.",
          ),
        });
      }
    }
  };

  /** 화면이 바뀌어 기다릴 카드가 없어지면 막힌 버튼을 푼다 */
  const reset = useCallback(() => setPending(null), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    change,
    reset,
    clearError,
    getPendingAction: (sessionId: string) =>
      pending?.sessionId === sessionId ? pending.action : null,
    getError: (sessionId: string) =>
      error?.sessionId === sessionId ? error.message : null,
  };
};
