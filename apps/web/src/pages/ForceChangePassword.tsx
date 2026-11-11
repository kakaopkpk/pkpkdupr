import React, { useState } from "react";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import { useAuth } from "@/context/AuthContext";

/** 첫 로그인·관리자 초기화 직후. 변경이 끝나면 AuthContext가 authenticated로 바뀌어 메인으로 간다. */
const ForceChangePassword: React.FC = () => {
  const { completeForcedPasswordChange, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-gradient-to-br from-pkpk-secondary-bg to-pkpk-primary-bg px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(var(--safe-bottom)+var(--app-keyboard-offset)+1.5rem)]">
      <div className="w-full max-w-sm self-center py-4">
        <header className="mb-8 text-center text-white">
          <h1 className="text-[1.2rem] font-extrabold tracking-tight">
            비밀번호 변경
          </h1>
          <p className="mt-2 text-sm font-medium leading-6 text-white/85">
            처음 받은 비밀번호예요. 앱을 쓰려면 새 비밀번호로 바꿔 주세요.
          </p>
        </header>

        <PasswordChangeForm
          submitLabel="변경하고 시작하기"
          onSubmit={completeForcedPasswordChange}
          tone="dark"
        />

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className="mt-4 w-full py-2 text-sm text-white/80 underline-offset-2 hover:underline disabled:opacity-60"
        >
          {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
        </button>
      </div>
    </div>
  );
};

export default ForceChangePassword;
