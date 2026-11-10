import { getAccessToken } from "@/lib/supabase";

const normalizeBaseUrl = (value: string | undefined) =>
  value ? value.replace(/\/+$/, "") : "";

const resolveApiBaseUrl = () => {
  const configuredBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (import.meta.env.DEV || typeof window === "undefined") {
    return "";
  }

  const apiUrl = new URL(window.location.origin);
  apiUrl.port = import.meta.env.VITE_API_PORT?.trim() || "3333";
  return apiUrl.origin;
};

const API_BASE_URL = resolveApiBaseUrl();

const isLoopbackHostname = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

const assertSecureProductionApiUrl = (url: string) => {
  if (import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  const target = new URL(url, window.location.origin);
  if (target.protocol !== "https:" && !isLoopbackHostname(target.hostname)) {
    throw new Error("운영 API 주소는 HTTPS여야 합니다.");
  }
};

export const buildApiUrl = (path: string) => {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/': ${path}`);
  }

  const apiUrl = `${API_BASE_URL}${path}`;
  assertSecureProductionApiUrl(apiUrl);
  return apiUrl;
};

// 아바타는 Supabase Storage 공개 절대 URL로 저장되므로 값을 그대로 쓴다.
export const resolveAssetUrl = (value?: string | null) => value || undefined;

/**
 * 현재 Supabase 세션의 access token을 Authorization 헤더로 붙여 API를 호출한다.
 * 토큰 갱신은 supabase-js가 하므로 호출할 때마다 현재 세션에서 토큰을 읽는다.
 */
export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  const accessToken = await getAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return fetch(buildApiUrl(path), { ...init, headers });
};
