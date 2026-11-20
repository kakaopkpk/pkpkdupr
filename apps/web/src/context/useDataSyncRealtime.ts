import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  DATA_KINDS,
  DATA_SYNC_CHANGED_EVENT,
  DATA_SYNC_CHANNEL_TOPIC,
  type DataKind,
} from "@pkpkdupr/shared/dataSync";
import { useInvalidateData } from "@/context/DataSyncContext";
import {
  createRemoteInvalidationBatcher,
  parseDataSyncKinds,
} from "@/lib/dataSyncSignal";
import { supabase } from "@/lib/supabase";

/** 신호를 놓쳤을 수 있을 때(끊김·앱 숨김) 다시 받는 종류. 회원 정보는 TTL로 충분해 뺀다 */
const CATCH_UP_KINDS: readonly DataKind[] = DATA_KINDS.filter(
  (kind) => kind !== "players",
);

const subscribeDocumentVisibility = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
const getIsDocumentVisible = () => document.visibilityState === "visible";

/**
 * 채널을 지우는 중이면 같은 topic의 channel()이 지우는 중인 채널을 돌려주므로,
 * 다음 구독은 이전 채널을 다 지운 뒤 만든다
 */
let channelRemoval: Promise<unknown> = Promise.resolve();

/**
 * 셸에서 한 번 쓴다. 로그인 상태이고 문서가 보이는 동안만 api의 데이터 변경 신호(private 채널 data-sync)를 구독하고,
 * 받은 종류를 무작위 지연 뒤 남의 변경 무효화(remote)로 넘긴다.
 * - 보이는 동안 다시 연결되면(SUBSCRIBED 재수신) 끊긴 동안 놓친 변경을 위해 CATCH_UP_KINDS를 무효화한다
 * - 숨으면 구독을 끊고 CATCH_UP_KINDS를 바로 무효화한다. 숨은 동안의 무효화는 보이게 될 때 한 번 적용되므로
 *   앱 복귀 때 TTL·경계 시각 재조회와 합쳐 한 번만 다시 받는다
 */
export const useDataSyncRealtime = (enabled: boolean): void => {
  const invalidate = useInvalidateData();
  const isDocumentVisible = useSyncExternalStore(
    subscribeDocumentVisibility,
    getIsDocumentVisible,
  );

  useEffect(() => {
    if (!enabled || !isDocumentVisible) return;

    let isDisposed = false;
    let channel: RealtimeChannel | null = null;
    let hasSubscribed = false;
    const batcher = createRemoteInvalidationBatcher((kinds) =>
      invalidate(kinds, { remote: true }),
    );

    const subscribe = async () => {
      await channelRemoval;
      if (isDisposed) return;
      try {
        // private 채널 권한은 구독 때 보낸 access token으로 확인한다
        await supabase.realtime.setAuth();
      } catch (error) {
        console.warn("[DATA_SYNC] Realtime 인증 토큰을 넣지 못했어요.", error);
      }
      if (isDisposed) return;

      channel = supabase
        .channel(DATA_SYNC_CHANNEL_TOPIC, { config: { private: true } })
        .on("broadcast", { event: DATA_SYNC_CHANGED_EVENT }, ({ payload }) => {
          batcher.schedule(parseDataSyncKinds(payload));
        })
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            if (hasSubscribed) batcher.schedule(CATCH_UP_KINDS);
            hasSubscribed = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`[DATA_SYNC] Realtime 채널 ${status}`, error);
          }
        });
    };
    void subscribe();

    return () => {
      isDisposed = true;
      if (channel) {
        channelRemoval = supabase.removeChannel(channel).catch(() => undefined);
      }
      if (document.visibilityState === "visible") {
        // 로그아웃·언마운트는 걸린 무효화를 버린다
        batcher.cancel();
        return;
      }
      batcher.schedule(CATCH_UP_KINDS);
      batcher.flush();
    };
  }, [enabled, invalidate, isDocumentVisible]);
};
