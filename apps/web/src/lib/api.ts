import { getAccessToken } from "@/lib/supabase";

const normalizeBaseUrl = (value: string | undefined) =>
  value ? value.replace(/\/+$/, "") : "";

const resolveApiBaseUrl = () => {
  const configuredBaseUrl = normalizeBaseUrl(
    import.meta.env.VITE_API_BASE_URL?.trim(),
  );
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  // 개발 서버는 상대 경로(/api)를 Vite 프록시로 보낸다.
  if (import.meta.env.DEV) {
    return "";
  }

  // 정적 배포(GitHub Pages)에는 API가 같은 origin에 없으므로 주소를 추측하지 않는다.
  throw new Error(
    "VITE_API_BASE_URL 환경변수가 필요합니다. 운영 빌드에는 API 주소(예: https://<project-ref>.supabase.co/functions/v1)를 넣어야 합니다.",
  );
};

const API_BASE_URL = resolveApiBaseUrl();

// 값이 있으면 Edge Function 실행 리전을 고정한다(DB와 같은 리전에서 실행해 DB 왕복 지연을 줄인다).
const FUNCTION_REGION = import.meta.env.VITE_FUNCTION_REGION?.trim() ?? "";

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

  const regionQuery = FUNCTION_REGION
    ? `${path.includes("?") ? "&" : "?"}forceFunctionRegion=${encodeURIComponent(FUNCTION_REGION)}`
    : "";
  const apiUrl = `${API_BASE_URL}${path}${regionQuery}`;
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
