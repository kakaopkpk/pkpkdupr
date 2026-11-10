import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import BottomSheet from "./BottomSheet";

const ProfileSettingsSheetBody: React.FC = () => {
  const { email, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  return (
    <>
      <BottomSheet.Header>
        <h2 className="bs-text-head text-left text-pkpk-main-font">설정</h2>
      </BottomSheet.Header>
      <BottomSheet.Body>
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">로그인 계정</p>
            <p className="mt-1 break-all text-sm font-semibold text-pkpk-main-font">
              {email ?? "-"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="app-action-button w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-error disabled:opacity-60"
          >
            {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      </BottomSheet.Body>
    </>
  );
};

export default ProfileSettingsSheetBody;
