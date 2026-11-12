import React, { useState } from "react";
import PasswordChangeForm from "@/components/PasswordChangeForm";
import { PkButton } from "@/components/ui/Button";
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
    <div className="flex h-full w-full flex-col overflow-y-auto bg-pk-bg px-4 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(var(--safe-bottom)+var(--app-keyboard-offset)+1.5rem)] text-pk-ink">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-7">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-extrabold leading-[1.3] tracking-[-0.02em]">
            새 비밀번호를
            <br />
            정해 주세요
          </h1>
          <p className="text-pk-15 text-pk-sub">
            처음 로그인했거나 비밀번호가 초기화됐어요
          </p>
        </header>

        {/* 페이지 바탕(#f3f5f9) 위에서는 입력칸을 흰색으로 둔다. */}
        <div className="flex flex-1 flex-col [&_input]:bg-white!">
          <PasswordChangeForm onSubmit={completeForcedPasswordChange} />
        </div>

        <PkButton
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
        </PkButton>
      </div>
    </div>
  );
};

export default ForceChangePassword;
