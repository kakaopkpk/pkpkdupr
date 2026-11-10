import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  PlayerAffiliation,
  PublicPlayerDupr,
} from "@pkpkdupr/shared/player";
import { buildApiUrl } from "@/lib/api";

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

interface AuthContextType {
  token: string | null;
  player: PlayerInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requiresPasswordChange: boolean;
  login: (
    username: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<void>;
  changePassword: (
    currentPassword: string | undefined,
    newPassword: string,
  ) => Promise<void>;
  updateProfile: (input: {
    affiliations?: PlayerAffiliation[];
    statusMessage?: string | null;
    statusMessageBackgroundColor?: string | null;
  }) => Promise<PlayerInfo>;
  uploadAvatar: (imageDataUrl: string) => Promise<PlayerInfo>;
  deleteAvatar: () => Promise<PlayerInfo>;
  refreshMe: () => Promise<PlayerInfo>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const TOKEN_STORAGE_KEY = "token";
const CACHED_AUTH_STATE_KEY = "pkpkdupr:auth-state";
const ONLINE_REQUIRED_MESSAGE = "온라인 연결이 필요합니다.";

type LoginResponse = {
  accessToken: string;
  isFirstLogin?: boolean;
};

type MeResponse = PlayerInfo & {
  accessToken?: string;
  isFirstLogin?: boolean;
};

type CachedAuthState = {
  player: PlayerInfo;
  requiresPasswordChange: boolean;
};

type SessionFetchResult =
  | { status: "authenticated"; player: PlayerInfo }
  | { status: "invalid" }
  | { status: "unavailable" };

type MeErrorResponse = {
  code?: string;
};

const SESSION_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const SESSION_RETRY_INTERVAL_MS = 30_000;

const isOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const shouldRequirePasswordChange = (isFirstLogin?: boolean) =>
  isFirstLogin === true;

const readCachedAuthState = (): CachedAuthState | null => {
  try {
    const cachedState = localStorage.getItem(CACHED_AUTH_STATE_KEY);
    return cachedState ? (JSON.parse(cachedState) as CachedAuthState) : null;
  } catch {
    return null;
  }
};

const persistAuthState = (
  player: PlayerInfo,
  requiresPasswordChange: boolean,
) => {
  localStorage.setItem(
    CACHED_AUTH_STATE_KEY,
    JSON.stringify({
      player,
      requiresPasswordChange,
    } satisfies CachedAuthState),
  );
};

const clearStoredAuthState = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(CACHED_AUTH_STATE_KEY);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  const retryTimeoutRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const sessionValidationInFlightRef = useRef(false);
  const activeTokenRef = useRef<string | null>(null);
  const hasSessionProfileRef = useRef(false);
  const sessionValidationRef = useRef<
    ((accessToken?: string) => Promise<void>) | null
  >(null);

  const clearSessionRetry = useCallback((resetAttempt = true) => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (resetAttempt) {
      retryAttemptRef.current = 0;
    }
  }, []);

  const clearSession = useCallback(() => {
    clearSessionRetry();
    activeTokenRef.current = null;
    hasSessionProfileRef.current = false;
    clearStoredAuthState();
    setToken(null);
    setPlayer(null);
    setRequiresPasswordChange(false);
  }, [clearSessionRetry]);

  const restoreCachedAuthState = useCallback(() => {
    const cachedAuthState = readCachedAuthState();
    if (!cachedAuthState) {
      return null;
    }

    hasSessionProfileRef.current = true;
    setPlayer(cachedAuthState.player);
    setRequiresPasswordChange(cachedAuthState.requiresPasswordChange);
    return cachedAuthState;
  }, []);

  const fetchMe = useCallback(
    async (accessToken: string): Promise<SessionFetchResult> => {
      const isCurrentSession = () => activeTokenRef.current === accessToken;

      try {
        const res = await fetch(buildApiUrl("/api/me"), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.ok) {
          const data = (await res.json()) as MeResponse;
          if (!data.id) {
            // 새 web 번들이 먼저 반영되어 이전 API의 빈 200 응답을 받더라도
            // 세션을 지우지 않고 배포 완료를 기다립니다.
            restoreCachedAuthState();
            return { status: "unavailable" };
          }

          if (!isCurrentSession()) {
            return { status: "unavailable" };
          }

          const {
            accessToken: refreshedAccessToken,
            isFirstLogin,
            ...playerInfo
          } = data;
          const nextRequiresPasswordChange =
            shouldRequirePasswordChange(isFirstLogin);

          if (refreshedAccessToken) {
            localStorage.setItem(TOKEN_STORAGE_KEY, refreshedAccessToken);
            activeTokenRef.current = refreshedAccessToken;
            setToken(refreshedAccessToken);
          }
          hasSessionProfileRef.current = true;
          setPlayer(playerInfo);
          setRequiresPasswordChange(nextRequiresPasswordChange);
          persistAuthState(playerInfo, nextRequiresPasswordChange);
          return { status: "authenticated", player: playerInfo };
        }

        const errorData = (await res.json().catch(() => ({}))) as MeErrorResponse;
        if (res.status === 401 || errorData.code === "SESSION_INVALID") {
          if (isCurrentSession()) {
            clearSession();
          }
          return { status: "invalid" };
        }

        restoreCachedAuthState();
        return { status: "unavailable" };
      } catch {
        console.error("Failed to fetch user info");
        restoreCachedAuthState();
        return { status: "unavailable" };
      }
    },
    [clearSession, restoreCachedAuthState],
  );

  const validateSession = useCallback(
    async (requestedToken?: string) => {
      const accessToken = requestedToken ?? activeTokenRef.current;
      if (
        !accessToken ||
        activeTokenRef.current !== accessToken ||
        sessionValidationInFlightRef.current
      ) {
        return;
      }

      clearSessionRetry(false);
      sessionValidationInFlightRef.current = true;
      const result = await fetchMe(accessToken);
      sessionValidationInFlightRef.current = false;

      if (result.status === "authenticated" || result.status === "invalid") {
        clearSessionRetry();
        setIsLoading(false);
        return;
      }

      if (activeTokenRef.current !== accessToken) {
        return;
      }

      if (!hasSessionProfileRef.current) {
        setIsLoading(true);
      }

      const retryDelay =
        SESSION_RETRY_DELAYS_MS[retryAttemptRef.current] ??
        SESSION_RETRY_INTERVAL_MS;
      retryAttemptRef.current += 1;
      retryTimeoutRef.current = window.setTimeout(() => {
        retryTimeoutRef.current = null;
        void sessionValidationRef.current?.();
      }, retryDelay);
    },
    [clearSessionRetry, fetchMe],
  );

  sessionValidationRef.current = validateSession;

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    activeTokenRef.current = storedToken;
    setToken(storedToken);
    const cachedAuthState = restoreCachedAuthState();
    setIsLoading(!cachedAuthState);
    void validateSession(storedToken);

    const validateWhenActive = () => {
      void sessionValidationRef.current?.();
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
      clearSessionRetry();
      window.removeEventListener("online", validateWhenActive);
      window.removeEventListener("focus", validateWhenActive);
      document.removeEventListener("visibilitychange", validateWhenVisible);
    };
  }, [clearSessionRetry, restoreCachedAuthState, validateSession]);

  const login = async (
    username: string,
    password: string,
    rememberMe = false,
  ) => {
    if (!isOnline()) {
      throw new Error(
        "오프라인에서는 로그인할 수 없습니다. 온라인 연결이 필요합니다.",
      );
    }

    const res = await fetch(buildApiUrl("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, rememberMe }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "로그인 실패");
    }
    const data = (await res.json()) as LoginResponse;
    clearSessionRetry();
    activeTokenRef.current = data.accessToken;
    localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);
    setToken(data.accessToken);
    setRequiresPasswordChange(shouldRequirePasswordChange(data.isFirstLogin));
    setIsLoading(true);
    const result = await fetchMe(data.accessToken);

    if (result.status === "unavailable") {
      if (!hasSessionProfileRef.current) {
        setIsLoading(true);
      }
      void sessionValidationRef.current?.();
      return;
    }

    setIsLoading(false);
  };

  const changePassword = async (
    currentPassword: string | undefined,
    newPassword: string,
  ) => {
    if (!token) {
      throw new Error("로그인이 필요합니다.");
    }
    if (!isOnline()) {
      throw new Error(
        "오프라인에서는 패스워드를 변경할 수 없습니다. 온라인 연결이 필요합니다.",
      );
    }

    const res = await fetch(buildApiUrl("/api/change-password"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "비밀번호 변경 실패");
    }

    setRequiresPasswordChange(false);
  };

  const updateProfile: AuthContextType["updateProfile"] = async (input) => {
    if (!token) {
      throw new Error("로그인이 필요합니다.");
    }
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }

    const res = await fetch(buildApiUrl("/api/me/profile"), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "프로필 변경 실패");
    }
    const data = (await res.json()) as PlayerInfo;
    setPlayer(data);
    persistAuthState(data, requiresPasswordChange);
    return data;
  };

  const uploadAvatar = async (imageDataUrl: string) => {
    if (!token) {
      throw new Error("로그인이 필요합니다.");
    }
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }

    const res = await fetch(buildApiUrl("/api/me/avatar"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ imageDataUrl }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "프로필 이미지 업로드 실패");
    }
    const data = (await res.json()) as PlayerInfo;
    setPlayer(data);
    persistAuthState(data, requiresPasswordChange);
    return data;
  };

  const deleteAvatar = async () => {
    if (!token) {
      throw new Error("로그인이 필요합니다.");
    }
    if (!isOnline()) {
      throw new Error(ONLINE_REQUIRED_MESSAGE);
    }

    const res = await fetch(buildApiUrl("/api/me/avatar"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "프로필 이미지 삭제 실패");
    }
    const data = (await res.json()) as PlayerInfo;
    setPlayer(data);
    persistAuthState(data, requiresPasswordChange);
    return data;
  };

  const refreshMe = async () => {
    if (!token) {
      throw new Error("로그인이 필요합니다.");
    }

    const result = await fetchMe(token);
    if (result.status !== "authenticated") {
      throw new Error("내 정보를 새로고침하지 못했습니다.");
    }

    return result.player;
  };

  const logout = () => {
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        player,
        isLoading,
        isAuthenticated: !!token,
        requiresPasswordChange,
        login,
        changePassword,
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
