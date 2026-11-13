import { useEffect, useState } from "react";
import { MINUTE_MS } from "@/lib/format";

/** 1분마다 다시 그리는 현재 시각 */
export const useMinuteClock = (): Date => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return now;
};
