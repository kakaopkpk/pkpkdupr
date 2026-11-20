import {
  DATA_SYNC_CHANGED_EVENT,
  DATA_SYNC_CHANNEL_TOPIC,
  type DataKind,
  type DataSyncChangedPayload,
} from "@pkpkdupr/shared/dataSync";
import { getRuntimeWaitUntil } from "../runtime";

/**
 * 쓰기 뒤 "어떤 데이터 종류가 바뀌었다"는 신호를 Supabase Realtime REST broadcast로 보낸다.
 * 서비스 키로 보내므로 private 채널 `data-sync`의 읽기 정책(realtime.messages)만 있으면 되고,
 * 회원은 이 채널에 보낼 수 없다.
 */

/** 한 번 보내기 시도의 상한. 응답과 분리돼 있어도 Edge 함수가 오래 붙잡히지 않게 한다 */
const SEND_TIMEOUT_MS = 5_000;

export interface DataChangeSignalConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/** SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 모두 있을 때만 보낸다(테스트 등에서는 없음) */
export const readDataChangeSignalConfig = (
  env: Record<string, string | undefined>,
): DataChangeSignalConfig | null => {
  const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return supabaseUrl && serviceRoleKey ? { supabaseUrl, serviceRoleKey } : null;
};

export interface DataChangeSignalDeps {
  /** 호출마다 불러 설정 변경을 따라간다. null이면 보내지 않는다 */
  getConfig: () => DataChangeSignalConfig | null;
  /** 함수 실행이 끝나기 전에 작업을 마치게 하는 런타임 훅(Edge의 EdgeRuntime.waitUntil) */
  waitUntil?: (task: Promise<unknown>) => void;
  fetch?: typeof fetch;
}

export interface DataChangeSignal {
  /** 신호를 백그라운드로 보낸다. 호출자는 기다리지 않고, 실패하면 한 번 다시 보낸 뒤 로그만 남긴다 */
  send(kinds: readonly DataKind[]): void;
  /** 보내는 중인 신호가 모두 끝날 때까지 기다린다(테스트용) */
  whenIdle(): Promise<void>;
}

export const createDataChangeSignal = (
  deps: DataChangeSignalDeps,
): DataChangeSignal => {
  const pending = new Set<Promise<void>>();

  const postOnce = async (
    config: DataChangeSignalConfig,
    payload: DataSyncChangedPayload,
  ) => {
    const fetchImpl = deps.fetch ?? fetch;
    const response = await fetchImpl(
      `${config.supabaseUrl}/realtime/v1/api/broadcast`,
      {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              topic: DATA_SYNC_CHANNEL_TOPIC,
              event: DATA_SYNC_CHANGED_EVENT,
              payload,
              private: true,
            },
          ],
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  };

  const sendWithRetry = async (
    config: DataChangeSignalConfig,
    payload: DataSyncChangedPayload,
  ) => {
    try {
      await postOnce(config, payload);
    } catch {
      try {
        await postOnce(config, payload);
      } catch (error) {
        console.error("[DATA_SYNC] 변경 신호 전송 실패", payload.kinds, error);
      }
    }
  };

  return {
    send(kinds) {
      if (kinds.length === 0) return;
      const config = deps.getConfig();
      if (!config) return;

      const task = sendWithRetry(config, { kinds: [...new Set(kinds)] });
      pending.add(task);
      void task.finally(() => pending.delete(task));
      try {
        deps.waitUntil?.(task);
      } catch (error) {
        console.error("[DATA_SYNC] waitUntil 등록 실패", error);
      }
    },
    async whenIdle() {
      while (pending.size > 0) {
        await Promise.all([...pending]);
      }
    },
  };
};

/** api 전체가 쓰는 신호 전송기. 미들웨어(`middleware/dataChangeSignal.ts`)가 부른다 */
export const dataChangeSignal = createDataChangeSignal({
  getConfig: () => readDataChangeSignalConfig(process.env),
  waitUntil: getRuntimeWaitUntil(),
});
