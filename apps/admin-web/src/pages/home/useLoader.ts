import { useCallback, useEffect, useRef, useState } from "react";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: T };

/** 마운트 때 한 번 불러오고, reload로 다시 부른다. 늦게 도착한 이전 응답은 버린다. */
export const useLoader = <T>(load: () => Promise<T>) => {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const requestId = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setState({ status: "loading" });
    loadRef.current().then(
      (data) => {
        if (id === requestId.current) setState({ status: "success", data });
      },
      () => {
        if (id === requestId.current) setState({ status: "error" });
      },
    );
  }, []);

  useEffect(() => {
    reload();
    return () => {
      // 언마운트 뒤 도착한 응답이 setState하지 않게 한다
      requestId.current += 1;
    };
  }, [reload]);

  return { state, reload };
};
