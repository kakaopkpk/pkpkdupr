import { isDataKind, type DataKind } from "@pkpkdupr/shared/dataSync";

/** 신호를 받은 뒤 무효화까지의 최대 무작위 지연. 모든 기기가 같은 순간 다시 받지 않게 흩는다 */
export const REMOTE_INVALIDATE_MAX_DELAY_MS = 1_500;

/** 변경 신호 payload에서 아는 종류만 고른다. 형식이 틀리면 빈 배열 */
export const parseDataSyncKinds = (payload: unknown): DataKind[] => {
  const kinds = (payload as { kinds?: unknown } | null | undefined)?.kinds;
  return Array.isArray(kinds) ? [...new Set(kinds.filter(isDataKind))] : [];
};

export interface RemoteInvalidationBatcher {
  /** 무작위 지연 뒤 무효화를 건다. 지연 중 온 종류는 합쳐 한 번에 무효화한다 */
  schedule: (kinds: readonly DataKind[]) => void;
  /** 걸린 무효화를 기다리지 않고 지금 한다 */
  flush: () => void;
  /** 걸린 무효화를 버린다 */
  cancel: () => void;
}

export const createRemoteInvalidationBatcher = (
  invalidate: (kinds: readonly DataKind[]) => void,
  {
    maxDelayMs = REMOTE_INVALIDATE_MAX_DELAY_MS,
    random = Math.random,
  }: { maxDelayMs?: number; random?: () => number } = {},
): RemoteInvalidationBatcher => {
  const pending = new Set<DataKind>();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timeoutId === null) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  };

  const flush = () => {
    clearTimer();
    if (pending.size === 0) return;
    const kinds = [...pending];
    pending.clear();
    invalidate(kinds);
  };

  return {
    schedule: (kinds) => {
      kinds.forEach((kind) => pending.add(kind));
      if (pending.size === 0 || timeoutId !== null) return;
      timeoutId = setTimeout(flush, random() * maxDelayMs);
    },
    flush,
    cancel: () => {
      clearTimer();
      pending.clear();
    },
  };
};
