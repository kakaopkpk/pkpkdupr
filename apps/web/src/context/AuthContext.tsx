import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AuthErrorResponse,
  MeResponse,
  RedeemInviteRequest,
} from "@pkpkdupr/shared/auth";
import type {
  PlayerAffiliation,
  PublicPlayerDupr,
} from "@pkpkdupr/shared/player";
import { apiFetch } from "@/lib/api";
import {
  DOMAIN_NOT_ALLOWED_NOTICE,
  INVITE_INVALID_MESSAGE,
} from "@/lib/authMessages";
import { signOut, supabase } from "@/lib/supabase";

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
 * - needsInvite: Google 계정은 확인됐지만 연결된 회원이 없음 → 초대 코드 입력
 * - authenticated: /api/me 200
 */
export type AuthStatus =
  | "loading"
  | "signedOut"
  | "needsInvite"
  | "authenticated";

interface AuthContextType {
  status: AuthStatus;
  player: PlayerInfo | null;
  /** 로그인한 Google 계정 이메일 */
  email: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** 로그인 화면에 보여줄 안내(도메인 거부 등) */
  notice: string | null;
  clearNotice: () => void;
  redeemInvite: (code: string) => Promise<void>;
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
// 자체 JWT 시절 저장소 키. 남아 있으면 지운다.
const LEGACY_STORAGE_KEYS = ["token", "pkpkdupr:auth-state"];

type MeFetchResult =
  | { status: "authenticated"; player: PlayerInfo }
  | { status: "needsInvite" }
  | { status: "signedOut" }
  | { status: "unavailable" }
  | { status: "stale" };

const SESSION_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const SESSION_RETRY_INTERVAL_MS = 30_000;

const isOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const toPlayerInfo = (me: MeResponse): PlayerInfo => me;

const readErrorResponse = async (res: Response) =>
  (await res.json().catch(() => ({}))) as Partial<AuthErrorResponse>;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  // 현재 Supabase 세션의 사용자. 응답이 늦게 와도 다른 세션의 결과를 반영하지 않도록 비교한다.
  const sessionUserIdRef = useRef<string | null>(null);
  const hasProfileRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const validationInFlightRef = useRef(false);
  const validateSessionRef = useRef<(() => Promise<void>) | null>(null);

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
    hasProfileRef.current = false;
    setPlayer(null);
    setEmail(null);
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

  const applyPlayer = useCallback((nextPlayer: PlayerInfo) => {
    hasProfileRef.current = true;
    setNotice(null);
    setPlayer(nextPlayer);
    setStatus("authenticated");
  }, []);

  const fetchMe = useCallback(async (): Promise<MeFetchResult> => {
    const userId = sessionUserIdRef.current;
    if (!userId) {
      return { status: "signedOut" };
    }
    const isCurrentSession = () => sessionUserIdRef.current === userId;

    try {
      const res = await apiFetch("/api/me");
      if (!isCurrentSession()) {
        return { status: "stale" };
      }

      if (res.ok) {
        const nextPlayer = toPlayerInfo((await res.json()) as MeResponse);
        if (!isCurrentSession()) {
          return { status: "stale" };
        }
        applyPlayer(nextPlayer);
        return { status: "authenticated", player: nextPlayer };
      }

      const errorData = await readErrorResponse(res);
      if (!isCurrentSession()) {
        return { status: "stale" };
      }

      if (errorData.code === "ACCOUNT_NOT_LINKED") {
        hasProfileRef.current = false;
        setPlayer(null);
        setStatus("needsInvite");
        return { status: "needsInvite" };
      }

      if (errorData.code === "DOMAIN_NOT_ALLOWED") {
        await endSession(DOMAIN_NOT_ALLOWED_NOTICE);
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
  }, [applyPlayer, endSession]);

  const validateSession = useCallback(async () => {
    const userId = sessionUserIdRef.current;
    if (!userId || validationInFlightRef.current) {
      return;
    }

    clearSessionRetry(false);
    validationInFlightRef.current = true;
    const result = await fetchMe();
    validationInFlightRef.current = false;

    if (result.status !== "unavailable") {
      clearSessionRetry();
      return;
    }

    if (sessionUserIdRef.current !== userId) {
      return;
    }

    // 프로필을 아직 못 받았으면 로딩을 유지하고, 이미 있으면 화면을 그대로 둔 채 재시도한다.
    if (!hasProfileRef.current) {
      setStatus("loading");
    }

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

      const isNewUser = sessionUserIdRef.current !== session.user.id;
      sessionUserIdRef.current = session.user.id;
      setEmail(session.user.email ?? null);

      // 토큰 갱신만 일어난 경우에는 /api/me를 다시 부를 필요가 없다.
      if (!isNewUser && event === "TOKEN_REFRESHED") {
        return;
      }

      if (isNewUser) {
        clearSessionRetry();
        hasProfileRef.current = false;
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

  const redeemInvite = async (code: string) => {
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }

    const res = await apiFetch("/api/auth/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() } satisfies RedeemInviteRequest),
    });

    if (res.ok) {
      applyPlayer(toPlayerInfo((await res.json()) as MeResponse));
      return;
    }

    const errorData = await readErrorResponse(res);
    switch (errorData.code) {
      case "INVITE_INVALID":
        throw new Error(INVITE_INVALID_MESSAGE);
      case "ALREADY_LINKED":
        // 다른 탭 등에서 이미 연결됐다면 내 정보를 다시 받아 메인으로 간다.
        await fetchMe();
        return;
      case "DOMAIN_NOT_ALLOWED":
        await endSession(DOMAIN_NOT_ALLOWED_NOTICE);
        return;
      case "SESSION_INVALID":
        await endSession();
        return;
      default:
        throw new Error(errorData.error || "초대 코드를 확인하지 못했습니다.");
    }
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
        email,
        isLoading: status === "loading",
        isAuthenticated: status === "authenticated",
        notice,
        clearNotice,
        redeemInvite,
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
