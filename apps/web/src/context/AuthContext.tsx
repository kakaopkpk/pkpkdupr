import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AuthErrorResponse, MeResponse } from "@pkpkdupr/shared/auth";
import type {
  PlayerAffiliation,
  PublicPlayerDupr,
} from "@pkpkdupr/shared/player";
import { apiFetch } from "@/lib/api";
import { ACCOUNT_NOT_LINKED_NOTICE } from "@/lib/authMessages";
import {
  getAccessToken,
  signOut,
  supabase,
  updatePassword,
} from "@/lib/supabase";
import { clearUserCaches } from "@/lib/userCache";

export interface PlayerInfo {
  id: string;
  username?: string;
  duprRating?: PublicPlayerDupr | null;
  gender?: "M" | "F";
  avatarUrl?: string;
  affiliations?: PlayerAffiliation[];
  statusMessage?: string;
  statusMessageBackgroundColor?: string;
}

/**
 * - loading: Supabase 세션 복원 또는 첫 /api/me 확인 중
 * - signedOut: Supabase 세션 없음 → /login
 * - mustChangePassword: /api/me 200이지만 isFirstLogin=true → /force-change-password
 * - authenticated: /api/me 200, isFirstLogin=false
 */
export type AuthStatus =
  | "loading"
  | "signedOut"
  | "mustChangePassword"
  | "authenticated";

interface AuthContextType {
  status: AuthStatus;
  player: PlayerInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** 로그인 화면에 보여줄 안내(연결된 회원 없음 등) */
  notice: string | null;
  clearNotice: () => void;
  /** 로그인 중 비밀번호 변경. 현재 비밀번호는 묻지 않는다. */
  changePassword: (newPassword: string) => Promise<void>;
  /** 첫 로그인·초기화 직후 강제 변경. 성공하면 메인으로 간다. */
  completeForcedPasswordChange: (newPassword: string) => Promise<void>;
  updateProfile: (input: {
    affiliations?: PlayerAffiliation[];
    statusMessage?: string | null;
    statusMessageBackgroundColor?: string | null;
  }) => Promise<PlayerInfo>;
  uploadAvatar: (imageDataUrl: string) => Promise<PlayerInfo>;
  deleteAvatar: () => Promise<PlayerInfo>;
  refreshMe: () => Promise<PlayerInfo>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const ONLINE_REQUIRED_MESSAGE = "온라인 연결이 필요합니다.";
// 더 이상 쓰지 않는 저장소 키. 남아 있으면 지운다.
const LEGACY_STORAGE_KEYS = ["token", "pkpkdupr:auth-state"];

type MeFetchResult =
  | { status: "authenticated"; player: PlayerInfo }
  | { status: "signedOut" }
  | { status: "unavailable" }
  | { status: "stale" };

const SESSION_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const SESSION_RETRY_INTERVAL_MS = 30_000;

const isOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const readErrorResponse = async (res: Response) =>
  (await res.json().catch(() => ({}))) as Partial<AuthErrorResponse>;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 현재 Supabase 세션의 사용자. 응답이 늦게 와도 다른 세션의 결과를 반영하지 않도록 비교한다.
  const sessionUserIdRef = useRef<string | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const validationInFlightRef = useRef(false);
  const validateSessionRef = useRef<(() => Promise<void>) | null>(null);
  // 강제 변경을 완료할 때마다 올린다. 그 전에 시작한 /api/me 응답(isFirstLogin=true)은 버린다.
  const meGenerationRef = useRef(0);
  // 강제 변경에서 updateUser까지 성공했고 password-changed가 아직 끝나지 않은 사용자.
  // 이 사용자가 같은 비밀번호로 다시 제출하면 same_password를 성공으로 본다.
  const pendingPasswordChangeUserIdRef = useRef<string | null>(null);

  const clearSessionRetry = useCallback((resetAttempt = true) => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (resetAttempt) {
      retryAttemptRef.current = 0;
    }
  }, []);

  const resetToSignedOut = useCallback(() => {
    clearSessionRetry();
    sessionUserIdRef.current = null;
    pendingPasswordChangeUserIdRef.current = null;
    clearUserCaches();
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

  const applyMe = useCallback((me: MeResponse) => {
    setNotice(null);
    setPlayer(me);
    setStatus(me.isFirstLogin ? "mustChangePassword" : "authenticated");
  }, []);

  const fetchMe = useCallback(async (): Promise<MeFetchResult> => {
    const userId = sessionUserIdRef.current;
    if (!userId) {
      return { status: "signedOut" };
    }
    const generation = meGenerationRef.current;
    const isCurrentSession = () =>
      sessionUserIdRef.current === userId &&
      meGenerationRef.current === generation;

    try {
      // 토큰 갱신이 일시적으로 실패하면 세션은 남고 토큰만 없다. 이때는 401로 로그아웃하지 않고 다시 시도한다.
      if (!(await getAccessToken())) {
        return { status: "unavailable" };
      }
      const res = await apiFetch("/api/me");
      if (!isCurrentSession()) {
        return { status: "stale" };
      }

      if (res.ok) {
        const me = (await res.json()) as MeResponse;
        if (!isCurrentSession()) {
          return { status: "stale" };
        }
        applyMe(me);
        return { status: "authenticated", player: me };
      }

      const errorData = await readErrorResponse(res);
      if (!isCurrentSession()) {
        return { status: "stale" };
      }

      if (errorData.code === "ACCOUNT_NOT_LINKED") {
        await endSession(ACCOUNT_NOT_LINKED_NOTICE);
        return { status: "signedOut" };
      }

      if (res.status === 401 || errorData.code === "SESSION_INVALID") {
        await endSession();
        return { status: "signedOut" };
      }

      // SESSION_UNAVAILABLE(503) 등 일시 오류는 세션을 유지하고 다시 시도한다.
      return { status: "unavailable" };
    } catch {
      console.error("Failed to fetch user info");
      return { status: "unavailable" };
    }
  }, [applyMe, endSession]);

  const validateSession = useCallback(async () => {
    const userId = sessionUserIdRef.current;
    if (!userId || validationInFlightRef.current) {
      return;
    }

    clearSessionRetry(false);
    validationInFlightRef.current = true;
    const result = await fetchMe();
    validationInFlightRef.current = false;

    // 검증 중에 다른 사용자로 바뀌었다면 그 사용자의 검증은 in-flight 가드에 걸려 건너뛰어졌으므로 다시 실행한다.
    if (sessionUserIdRef.current !== userId) {
      if (sessionUserIdRef.current) {
        void validateSessionRef.current?.();
      }
      return;
    }

    if (result.status !== "unavailable") {
      clearSessionRetry();
      return;
    }

    // 현재 화면(로딩·비밀번호 변경·메인)을 그대로 둔 채 재시도한다.
    const retryDelay =
      SESSION_RETRY_DELAYS_MS[retryAttemptRef.current] ??
      SESSION_RETRY_INTERVAL_MS;
    retryAttemptRef.current += 1;
    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null;
      void validateSessionRef.current?.();
    }, retryDelay);
  }, [clearSessionRetry, fetchMe]);

  validateSessionRef.current = validateSession;

  useEffect(() => {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        resetToSignedOut();
        return;
      }

      const previousUserId = sessionUserIdRef.current;
      const isNewUser = previousUserId !== session.user.id;
      // 앱 첫 로드(이전 id 없음)에서는 오프라인 캐시를 유지하고, 사용자가 바뀐 경우에만 지운다.
      if (previousUserId && isNewUser) {
        clearUserCaches();
      }
      sessionUserIdRef.current = session.user.id;

      // 같은 사용자의 토큰 갱신·비밀번호 변경(USER_UPDATED)에는 /api/me를 다시 부르지 않는다.
      if (
        !isNewUser &&
        (event === "TOKEN_REFRESHED" || event === "USER_UPDATED")
      ) {
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

    const validateWhenActive = () => {
      void validateSessionRef.current?.();
    };
    const validateWhenVisible = () => {
      if (document.visibilityState === "visible") {
        validateWhenActive();
      }
    };

    window.addEventListener("online", validateWhenActive);
    window.addEventListener("focus", validateWhenActive);
    document.addEventListener("visibilitychange", validateWhenVisible);

    return () => {
      subscription.unsubscribe();
      clearSessionRetry();
      window.removeEventListener("online", validateWhenActive);
      window.removeEventListener("focus", validateWhenActive);
      document.removeEventListener("visibilitychange", validateWhenVisible);
    };
  }, [clearSessionRetry, resetToSignedOut]);

  const changePassword = async (newPassword: string) => {
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }
    await updatePassword(newPassword);
  };

  const completeForcedPasswordChange = async (newPassword: string) => {
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }
    const userId = sessionUserIdRef.current;
    await updatePassword(newPassword, {
      allowSamePassword:
        userId !== null && pendingPasswordChangeUserIdRef.current === userId,
    });
    pendingPasswordChangeUserIdRef.current = userId;

    const res = await apiFetch("/api/me/password-changed", { method: "POST" });
    if (res.ok) {
      const me = (await res.json()) as MeResponse;
      if (sessionUserIdRef.current !== userId) {
        return;
      }
      pendingPasswordChangeUserIdRef.current = null;
      meGenerationRef.current += 1;
      applyMe(me);
      return;
    }

    const errorData = await readErrorResponse(res);
    if (res.status === 401 || errorData.code === "SESSION_INVALID") {
      await endSession();
      return;
    }
    if (errorData.code === "ACCOUNT_NOT_LINKED") {
      await endSession(ACCOUNT_NOT_LINKED_NOTICE);
      return;
    }
    throw new Error(
      errorData.error || "비밀번호 변경을 완료하지 못했습니다. 다시 시도해 주세요.",
    );
  };

  const updateProfile: AuthContextType["updateProfile"] = async (input) => {
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }

    const res = await apiFetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errorData = await readErrorResponse(res);
      throw new Error(errorData.error || "프로필 변경 실패");
    }
    const data = (await res.json()) as PlayerInfo;
    setPlayer(data);
    return data;
  };

  const uploadAvatar = async (imageDataUrl: string) => {
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }

    const res = await apiFetch("/api/me/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl }),
    });
    if (!res.ok) {
      const errorData = await readErrorResponse(res);
      throw new Error(errorData.error || "프로필 이미지 업로드 실패");
    }
    const data = (await res.json()) as PlayerInfo;
    setPlayer(data);
    return data;
  };

  const deleteAvatar = async () => {
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }

    const res = await apiFetch("/api/me/avatar", { method: "DELETE" });
    if (!res.ok) {
      const errorData = await readErrorResponse(res);
      throw new Error(errorData.error || "프로필 이미지 삭제 실패");
    }
    const data = (await res.json()) as PlayerInfo;
    setPlayer(data);
    return data;
  };

  const refreshMe = async () => {
    const result = await fetchMe();
    if (result.status !== "authenticated") {
      throw new Error("내 정보를 새로고침하지 못했습니다.");
    }

    return result.player;
  };

  const logout = async () => {
    await endSession();
  };

  const clearNotice = useCallback(() => setNotice(null), []);

  return (
    <AuthContext.Provider
      value={{
        status,
        player,
        isLoading: status === "loading",
        isAuthenticated: status === "authenticated",
        notice,
        clearNotice,
        changePassword,
        completeForcedPasswordChange,
        updateProfile,
        uploadAvatar,
        deleteAvatar,
        refreshMe,
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
