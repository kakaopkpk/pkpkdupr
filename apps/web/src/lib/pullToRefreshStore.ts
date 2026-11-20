export type PullToRefreshStatus =
  | "idle"
  | "pulling"
  | "armed"
  | "refreshing"
  | "error";

export interface PullToRefreshState {
  distance: number;
  status: PullToRefreshStatus;
}

/**
 * 당겨서 새로고침 표시 상태 저장소. 거리는 touchmove마다 바뀌므로 제스처를 가진
 * 컴포넌트(탭 셸·푸시 화면)의 state에 두지 않고, 구독한 인디케이터만 다시 렌더링되게 한다.
 */
export interface PullToRefreshStore {
  get: () => PullToRefreshState;
  set: (next: Partial<PullToRefreshState>) => void;
  subscribe: (listener: () => void) => () => void;
}

export const createPullToRefreshStore = (): PullToRefreshStore => {
  let state: PullToRefreshState = { distance: 0, status: "idle" };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      const distance = next.distance ?? state.distance;
      const status = next.status ?? state.status;
      if (distance === state.distance && status === state.status) return;
      state = { distance, status };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
