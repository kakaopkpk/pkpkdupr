import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

const InviteCode: React.FC = () => {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { redeemInvite, logout } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      // 성공하면 AuthContext가 authenticated로 바뀌어 메인 화면으로 이동한다.
      await redeemInvite(code);
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
            초대 코드 입력
          </h1>
          <p className="mt-2 text-sm font-medium leading-6 text-white/85">
            처음 오셨네요. 관리자에게 받은 초대 코드를 입력해 주세요.
          </p>
        </header>

        {error && (
          <div className="mb-4 w-full rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <input
            type="text"
            placeholder="초대 코드"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            required
            className="app-mobile-input w-full rounded-xl border bg-white px-4 py-3 font-mono tracking-widest"
          />

          <button
            type="submit"
            disabled={isSubmitting || !code.trim()}
            className="app-action-button w-full rounded-xl bg-pkpk-accent-bg py-3 font-semibold text-pkpk-dark shadow-sm transition-colors hover:bg-[#d7dc17] disabled:opacity-60"
          >
            {isSubmitting ? "확인 중..." : "가입하기"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-4 w-full py-2 text-sm text-white/80 underline-offset-2 hover:underline"
        >
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  );
};

export default InviteCode;
