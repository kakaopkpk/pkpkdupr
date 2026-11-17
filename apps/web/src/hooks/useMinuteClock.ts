import { useEffect, useState } from "react";
import { MINUTE_MS } from "@/lib/format";

/** 1분마다, 그리고 백그라운드에서 돌아올 때 다시 그리는 현재 시각 */
export const useMinuteClock = (): Date => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") update();
    };
    const intervalId = window.setInterval(update, MINUTE_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return now;
};
