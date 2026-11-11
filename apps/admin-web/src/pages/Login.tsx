import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { signInWithUsername } from "../lib/supabase";

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "알 수 없는 오류입니다.";

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
    setIsSubmitting(true);
    try {
      // 성공하면 AuthContext가 세션 변경을 받아 관리자 여부를 확인한다.
      await signInWithUsername(username, password);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
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

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            name="username"
            placeholder="아이디"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            name="password"
            placeholder="비밀번호"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
