import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AuthErrorResponse, MeResponse } from "@pkpkdupr/shared/auth";
import type { Player } from "@pkpkdupr/shared/player";
import { apiFetch } from "../lib/api";
import {
  ALLOWED_EMAIL_DOMAIN,
  getAccessToken,
  signOut,
  supabase,
} from "../lib/supabase";

type PlayerInfo = Pick<
  Player,
  "id" | "username" | "duprRating" | "gender" | "status"
>;

/**
 * - loading: Supabase 세션 복원 또는 /api/me 확인 중
 * - signedOut: 세션 없음 → /login
 * - authenticated: 관리자 확인 완료
 */
export type AdminAuthStatus = "loading" | "signedOut" | "authenticated";

interface AuthContextType {
  status: AdminAuthStatus;
  player: PlayerInfo | null;
  isAdmin: boolean;
  /** 로그인 화면에 보여줄 안내(관리자 아님, 도메인 거부 등) */
  notice: string | null;
  clearNotice: () => void;
  logout: () => Promise<void>;
}

const NOT_ADMIN_NOTICE = "관리자 권한이 없습니다.";
const DOMAIN_NOT_ALLOWED_NOTICE = `회사 계정(@${ALLOWED_EMAIL_DOMAIN})으로 로그인해 주세요.`;
// 더 이상 쓰지 않는 저장소 키. 남아 있으면 지운다.
const LEGACY_TOKEN_STORAGE_KEY = "admin-token";
const SESSION_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const SESSION_RETRY_INTERVAL_MS = 30_000;

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sessionUserIdRef = useRef<string | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const validationInFlightRef = useRef(false);
  const validateSessionRef = useRef<(() => Promise<void>) | null>(null);

  const clearSessionRetry = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryAttemptRef.current = 0;
  }, []);

  const resetToSignedOut = useCallback(() => {
    clearSessionRetry();
    sessionUserIdRef.current = null;
    setPlayer(null);
    setStatus("signedOut");
  }, [clearSessionRetry]);

  const endSession = useCallback(
    async (nextNotice?: string) => {
      if (nextNotice) {
        setNotice(nextNotice);
      }
      resetToSignedOut();
      await signOut();
    },
    [resetToSignedOut],
  );

  const scheduleRetry = useCallback(() => {
    const retryDelay =
      SESSION_RETRY_DELAYS_MS[retryAttemptRef.current] ??
      SESSION_RETRY_INTERVAL_MS;
    retryAttemptRef.current += 1;
    // 재시도 대기 중에 검증이 다시 돌았을 수 있으므로 기존 타이머를 지우고 하나만 유지한다.
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
    }
    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null;
      void validateSessionRef.current?.();
    }, retryDelay);
  }, []);

  const validateSession = useCallback(async () => {
    const userId = sessionUserIdRef.current;
    if (!userId || validationInFlightRef.current) {
      return;
    }
    const isCurrentSession = () => sessionUserIdRef.current === userId;

    validationInFlightRef.current = true;
    try {
      // 토큰 갱신이 일시적으로 실패하면 세션은 남고 토큰만 없다. 이때는 401로 로그아웃하지 않고 다시 시도한다.
      if (!(await getAccessToken())) {
        if (isCurrentSession()) {
          scheduleRetry();
        }
        return;
      }
      const res = await apiFetch("/api/me");
      if (!isCurrentSession()) {
        return;
      }

      if (res.ok) {
        const data = (await res.json()) as MeResponse;
        if (!isCurrentSession()) {
          return;
        }
        if (!data.isAdmin) {
          await endSession(NOT_ADMIN_NOTICE);
          return;
        }
        clearSessionRetry();
        setNotice(null);
        setPlayer(data);
        setStatus("authenticated");
        return;
      }

      const errorData = (await res
        .json()
        .catch(() => ({}))) as Partial<AuthErrorResponse>;
      if (!isCurrentSession()) {
        return;
      }

      switch (errorData.code) {
        case "DOMAIN_NOT_ALLOWED":
          await endSession(DOMAIN_NOT_ALLOWED_NOTICE);
          return;
        // 연결된 회원이 없으면 관리자일 수 없다. 초대 코드 가입은 web에서 한다.
        case "ACCOUNT_NOT_LINKED":
        case "FORBIDDEN":
          await endSession(NOT_ADMIN_NOTICE);
          return;
        default:
          break;
      }

      if (res.status === 401 || errorData.code === "SESSION_INVALID") {
        await endSession();
        return;
      }

      // SESSION_UNAVAILABLE(503) 등 일시 오류는 세션을 유지하고 다시 시도한다.
      scheduleRetry();
    } catch {
      console.error("Failed to fetch user info");
      if (isCurrentSession()) {
        scheduleRetry();
      }
    } finally {
      validationInFlightRef.current = false;
      // 검증 중에 다른 사용자로 바뀌었다면 그 사용자의 검증은 in-flight 가드에 걸려 건너뛰어졌으므로 다시 실행한다.
      if (sessionUserIdRef.current && !isCurrentSession()) {
        void validateSessionRef.current?.();
      }
    }
  }, [clearSessionRetry, endSession, scheduleRetry]);

  validateSessionRef.current = validateSession;

  useEffect(() => {
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        resetToSignedOut();
        return;
      }

      const isNewUser = sessionUserIdRef.current !== session.user.id;
      sessionUserIdRef.current = session.user.id;

      // 토큰 갱신만 일어난 경우에는 /api/me를 다시 부를 필요가 없다.
      if (!isNewUser && event === "TOKEN_REFRESHED") {
        return;
      }

      if (isNewUser) {
        clearSessionRetry();
        setPlayer(null);
        setStatus("loading");
      }

      // 콜백 안에서 supabase 호출을 기다리면 교착될 수 있어 다음 틱으로 미룬다.
      window.setTimeout(() => {
        void validateSessionRef.current?.();
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
      clearSessionRetry();
    };
  }, [clearSessionRetry, resetToSignedOut]);

  const logout = useCallback(async () => {
    await endSession();
  }, [endSession]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return (
    <AuthContext.Provider
      value={{
        status,
        player,
        isAdmin: status === "authenticated",
        notice,
        clearNotice,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
