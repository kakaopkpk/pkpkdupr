import React, { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "../context/AuthContext";
import { signInWithGoogle, signInWithMagicLink } from "@/lib/supabase";

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "알 수 없는 오류입니다.";

const isOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const OFFLINE_LOGIN_MESSAGE =
  "오프라인에서는 로그인할 수 없습니다. 온라인 연결이 필요합니다.";

/** 로컬 개발 전용: 로컬 Supabase Mailpit으로 받는 매직링크 로그인 */
const DevMagicLinkForm: React.FC<{ onError: (message: string) => void }> = ({
  onError,
}) => {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      await signInWithMagicLink(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 w-full space-y-3 rounded-xl border border-white/30 bg-white/10 p-4"
    >
      <p className="text-xs font-semibold text-white/90">
        로컬 개발용 매직링크 로그인
      </p>
      <input
        type="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="app-mobile-input w-full rounded-xl border bg-white px-4 py-3"
      />
      <button
        type="submit"
        disabled={isSending}
        className="app-action-button w-full rounded-xl bg-white/90 py-3 text-sm font-semibold text-pkpk-dark disabled:opacity-60"
      >
        {isSending ? "보내는 중..." : "로그인 링크 받기"}
      </button>
      {sentTo && (
        <p className="text-xs leading-5 text-white/90">
          {sentTo}로 링크를 보냈어요. 로컬 Mailpit(http://127.0.0.1:54324)에서
          메일을 열어 주세요.
        </p>
      )}
    </form>
  );
};

const Login: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { notice, clearNotice } = useAuth();

  const handleError = (message: string) => {
    clearNotice();
    setError(message);
  };

  const handleGoogleLogin = async () => {
    setError(null);
    if (!isOnline()) {
      handleError(OFFLINE_LOGIN_MESSAGE);
      return;
    }

    setIsRedirecting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setIsRedirecting(false);
      handleError(getErrorMessage(err));
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

        <button
          type="button"
          onClick={() => void handleGoogleLogin()}
          disabled={isRedirecting}
          className="app-action-button flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-semibold text-pkpk-dark shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          <FcGoogle aria-hidden className="h-5 w-5" />
          {isRedirecting ? "Google로 이동 중..." : "Google 계정으로 로그인"}
        </button>

        {import.meta.env.DEV && <DevMagicLinkForm onError={handleError} />}
      </div>
    </div>
  );
};

export default Login;
