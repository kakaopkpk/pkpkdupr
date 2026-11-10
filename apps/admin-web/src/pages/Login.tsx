import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { signInWithGoogle, signInWithMagicLink } from "../lib/supabase";

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "알 수 없는 오류입니다.";

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
      className="space-y-3 rounded-lg border border-dashed border-gray-300 p-4"
    >
      <p className="text-xs font-semibold text-gray-500">
        로컬 개발용 매직링크 로그인
      </p>
      <input
        type="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={isSending}
        className="w-full py-2 border border-blue-600 text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 disabled:opacity-60"
      >
        {isSending ? "보내는 중..." : "로그인 링크 받기"}
      </button>
      {sentTo && (
        <p className="text-xs text-gray-500">
          {sentTo}로 링크를 보냈습니다. 로컬 Mailpit(http://127.0.0.1:54324)에서
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
    setIsRedirecting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setIsRedirecting(false);
      handleError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-[400px] bg-white rounded-xl shadow-lg p-8 m-4 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-blue-600">pkpkdupr</h1>
          <p className="text-gray-500 mt-2">관리자 페이지</p>
        </div>

        {notice && !error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded text-sm">
            {notice}
          </div>
        )}

        {error && (
          <div className="bg-error/10 border border-error/20 text-error px-4 py-2 rounded text-sm">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleGoogleLogin()}
          disabled={isRedirecting}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {isRedirecting ? "Google로 이동 중..." : "Google 계정으로 로그인"}
        </button>

        {import.meta.env.DEV && <DevMagicLinkForm onError={handleError} />}
      </div>
    </div>
  );
};

export default Login;
