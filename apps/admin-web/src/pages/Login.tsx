import React, { useState } from "react";
import { Button } from "../components/ui/Button";
import { InlineError } from "../components/ui/InlineError";
import { TextInput } from "../components/ui/TextInput";
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
    <div className="flex min-h-screen items-center justify-center bg-pk-bg p-6">
      <div className="w-full max-w-[400px] space-y-6 rounded-pk-lg bg-white p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-pk-sm bg-pk-primary text-pk-17 font-bold text-white">
            PK
          </span>
          <div>
            <h1 className="text-pk-22 font-bold text-pk-ink">pkpkdupr</h1>
            <p className="mt-1 text-pk-13 font-semibold text-pk-muted">관리자</p>
          </div>
        </div>

        {notice && !error && (
          <div
            role="status"
            className="rounded-pk-sm bg-pk-primary-soft px-4 py-3 text-pk-13 font-semibold text-pk-primary"
          >
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <TextInput
            type="text"
            name="username"
            placeholder="아이디"
            aria-label="아이디"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <TextInput
            type="password"
            name="password"
            placeholder="비밀번호"
            aria-label="비밀번호"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <InlineError message={error} />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "로그인 중…" : "로그인"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;
