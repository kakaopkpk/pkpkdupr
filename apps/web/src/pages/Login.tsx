import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { signInWithUsername } from "@/lib/supabase";

const isOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const OFFLINE_LOGIN_MESSAGE =
  "오프라인에서는 로그인할 수 없습니다. 온라인 연결이 필요합니다.";

const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { notice, clearNotice } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearNotice();
    setError(null);
    if (!isOnline()) {
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

  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-gradient-to-br from-pkpk-secondary-bg to-pkpk-primary-bg px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(var(--safe-bottom)+var(--app-keyboard-offset)+1.5rem)]">
      <div className="w-full max-w-sm self-center py-4">
        <header className="mb-8 text-center text-white">
          <h1 className="text-[1.2rem] font-extrabold tracking-tight">
            pkpkdupr
          </h1>
          <p className="mt-2 text-sm font-medium leading-6 text-white/85">
            기록하고, 교류하고, 성장하는 피클볼 라이프
          </p>
        </header>

        {notice && !error && (
          <div className="mb-4 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 w-full rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <input
            type="text"
            placeholder="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            spellCheck={false}
            required
            className="app-mobile-input w-full rounded-xl border bg-white px-4 py-3"
          />

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="app-mobile-input w-full rounded-xl border bg-white px-4 py-3"
          />

          <button
            type="submit"
            disabled={isSubmitting || !username.trim() || !password}
            className="app-action-button w-full rounded-xl bg-pkpk-accent-bg py-3 font-semibold text-pkpk-dark shadow-sm transition-colors hover:bg-[#d7dc17] disabled:opacity-60"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
