import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { DataKind } from "@pkpkdupr/shared/dataSync";
import { useIsScreenVisible } from "@/context/ScreenVisibilityContext";

/** 화면이 보이게 될 때 마지막 재조회에서 이만큼 지났으면 다시 받는다. 모든 데이터 공통 */
export const DATA_TTL_MS = 5 * 60 * 1000;

type InvalidateData = (
  kinds: readonly DataKind[],
  options?: { remote?: boolean },
) => void;

interface DataSyncStore {
  subscribe: (listener: () => void) => () => void;
  /** 종류별 무효화 횟수의 합. localOnly면 내 변경 무효화만 센다 */
  read: (kinds: readonly DataKind[], localOnly: boolean) => number;
  invalidate: InvalidateData;
}

const createDataSyncStore = (): DataSyncStore => {
  const allCounts = new Map<DataKind, number>();
  const localCounts = new Map<DataKind, number>();
  const listeners = new Set<() => void>();
  const bump = (counts: Map<DataKind, number>, kind: DataKind) =>
    counts.set(kind, (counts.get(kind) ?? 0) + 1);

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read: (kinds, localOnly) => {
      const counts = localOnly ? localCounts : allCounts;
      return kinds.reduce((sum, kind) => sum + (counts.get(kind) ?? 0), 0);
    },
    invalidate: (kinds, options) => {
      if (kinds.length === 0) return;
      for (const kind of kinds) {
        bump(allCounts, kind);
        if (!options?.remote) bump(localCounts, kind);
      }
      listeners.forEach((listener) => listener());
    },
  };
};

const DataSyncContext = createContext<DataSyncStore | null>(null);

/** 셸이 한 번 감싼다. 안쪽 화면은 useInvalidateData·useDataVersion으로 데이터 종류별 재조회를 맞춘다 */
export const DataSyncProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [store] = useState(createDataSyncStore);
  return (
    <DataSyncContext.Provider value={store}>{children}</DataSyncContext.Provider>
  );
};

const useDataSyncStore = (): DataSyncStore => {
  const store = useContext(DataSyncContext);
  if (!store) {
    throw new Error("DataSync hooks must be used within DataSyncProvider");
  }
  return store;
};

/**
 * 데이터를 바꾼 뒤 그 종류를 쓰는 화면이 다시 받게 한다. 실제로 바뀐 종류만 넘긴다.
 * remote는 남의 변경으로 무효화할 때 쓰고, localOnly 소비처는 여기에 반응하지 않는다
 */
export function useInvalidateData(): InvalidateData {
  return useDataSyncStore().invalidate;
}

const subscribeDocumentVisibility = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
const getIsDocumentVisible = () => document.visibilityState === "visible";

export interface DataVersionOptions {
  /** 내 변경 무효화에만 다시 받는다. TTL·남의 변경 무효화로는 받지 않는다 */
  localOnly?: boolean;
  /**
   * 화면 보임을 직접 준다. PushScreen을 그리는 래퍼처럼 자기 화면의 ScreenVisibilityProvider 바깥에서 쓸 때
   * PushScreen의 onVisibleChange 값을 넘긴다. 없으면 useIsScreenVisible()
   */
  isScreenVisible?: boolean;
}

/**
 * 재조회 effect의 의존성으로 쓰는 값. 처음은 0이고 다음 때 1씩 커진다.
 * - 화면이 보이는 동안(화면 보임 && 문서 visible) 그 종류가 무효화되면 바로
 * - 숨은 동안 무효화됐으면 보이게 될 때 한 번
 * - 보이게 될 때(탭 전환·덮인 화면 드러남·앱 복귀) 마지막으로 커진 뒤(처음은 마운트 뒤) DATA_TTL_MS가 지났으면
 * 커지는 것은 다시 받으라는 신호일 뿐이므로, 받는 동안 보이던 내용은 소비처가 그대로 둔다
 */
export function useDataVersion(
  kinds: readonly DataKind[],
  options?: DataVersionOptions,
): number {
  const store = useDataSyncStore();
  const localOnly = options?.localOnly ?? false;
  const target = useSyncExternalStore(store.subscribe, () =>
    store.read(kinds, localOnly),
  );
  const contextVisible = useIsScreenVisible();
  const isDocumentVisible = useSyncExternalStore(
    subscribeDocumentVisibility,
    getIsDocumentVisible,
  );
  const isVisible =
    (options?.isScreenVisible ?? contextVisible) && isDocumentVisible;

  const [version, setVersion] = useState(0);
  const appliedTargetRef = useRef(target);
  const wasVisibleRef = useRef(isVisible);
  // 마운트 때 소비처가 처음 받으므로 그때부터 잰다
  const lastRefreshAtRef = useRef(0);
  useEffect(() => {
    lastRefreshAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    const becameVisible = isVisible && !wasVisibleRef.current;
    wasVisibleRef.current = isVisible;
    if (!isVisible) return;

    const isInvalidated = target !== appliedTargetRef.current;
    const isExpired =
      becameVisible &&
      !localOnly &&
      Date.now() - lastRefreshAtRef.current >= DATA_TTL_MS;
    if (!isInvalidated && !isExpired) return;

    appliedTargetRef.current = target;
    lastRefreshAtRef.current = Date.now();
    setVersion((current) => current + 1);
  }, [isVisible, localOnly, target]);

  return version;
}
