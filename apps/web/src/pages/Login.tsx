import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { PkButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Form";
import { INVALID_CREDENTIALS_MESSAGE } from "@/lib/authMessages";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { signInWithUsername } from "@/lib/supabase";

const OFFLINE_LOGIN_MESSAGE =
  "오프라인에서는 로그인할 수 없습니다. 온라인 연결이 필요합니다.";

const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { notice, clearNotice } = useAuth();
  const isOnline = useOnlineStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearNotice();
    setError(null);
    if (!isOnline) {
      setError(OFFLINE_LOGIN_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    try {
      // 성공하면 AuthContext가 세션 변화를 받아 /api/me로 다음 화면을 정한다.
      await signInWithUsername(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류입니다.");
      setIsSubmitting(false);
    }
  };

  const isInvalidCredentials = error === INVALID_CREDENTIALS_MESSAGE;
  const message = error ?? (!isOnline ? OFFLINE_LOGIN_MESSAGE : notice);
  const isMessageError = !!error || !isOnline;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-pk-bg px-4 pt-[calc(env(safe-area-inset-top)+4rem)] pb-[calc(var(--safe-bottom)+var(--app-keyboard-offset)+1.5rem)] text-pk-ink">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-10">
        <header className="flex flex-col items-start gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-pk-primary"
          >
            <span className="h-[22px] w-[22px] rounded-full bg-pk-hl" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">
              pkpkdupr
            </h1>
            <p className="text-pk-15 text-pk-sub">피클볼 경기 기록과 평점</p>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3.5 [&_input]:bg-white!"
        >
          <TextField
            label="아이디"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <TextField
            label="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            error={isInvalidCredentials}
          />

          {message ? (
            <p
              role={isMessageError ? "alert" : "status"}
              className={
                isMessageError
                  ? "-mt-1 text-pk-13 font-bold text-pk-down"
                  : "-mt-1 text-pk-13 font-bold text-pk-sub"
              }
            >
              {message}
            </p>
          ) : null}

          <PkButton
            type="submit"
            size="lg"
            fullWidth
            className="mt-2"
            disabled={isSubmitting || !isOnline || !username.trim() || !password}
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </PkButton>
        </form>

        <p className="mt-auto text-center text-pk-13 text-pk-muted">
          계정은 운영진이 만들어 드려요
        </p>
      </div>
    </div>
  );
};

export default Login;
