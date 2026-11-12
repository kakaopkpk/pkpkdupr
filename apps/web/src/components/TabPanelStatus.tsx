import React from "react";
import { Spinner } from "@heroui/react";

interface TabPanelStatusProps {
  message?: string;
  ariaLabel?: string;
  isLoading?: boolean;
  tone?: "default" | "error";
}

const TabPanelStatus: React.FC<TabPanelStatusProps> = ({
  ariaLabel,
  message,
  isLoading = false,
  tone = "default",
}) => (
  <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-12 text-center">
    <div className="flex flex-col items-center gap-3">
      {isLoading ? (
        <Spinner
          aria-label={ariaLabel ?? message ?? "로딩 중"}
          className="text-pk-primary"
          color="current"
          size="md"
        />
      ) : null}
      {message ? (
        <p
          className={`text-sm font-medium ${
            tone === "error" ? "text-error" : "text-pk-sub"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  </div>
);

export default TabPanelStatus;
