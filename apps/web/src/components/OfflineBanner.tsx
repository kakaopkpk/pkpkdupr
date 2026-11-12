import React from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed left-1/2 top-[calc(8px+env(safe-area-inset-top))] z-[1000] app-shell-width -translate-x-1/2 px-4">
      <div
        role="status"
        className="flex h-9 items-center justify-center gap-2 rounded-full bg-pk-ink px-4 text-pk-13 font-bold text-white"
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-pk-down" />
        오프라인이에요
      </div>
    </div>
  );
};

export default OfflineBanner;
