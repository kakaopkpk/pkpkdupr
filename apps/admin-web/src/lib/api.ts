import { getAccessToken } from "./supabase";

// 미설정이면 상대 경로(/api)를 써서 개발 서버의 Vite 프록시를 탄다.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

export const buildApiUrl = (path: string) => {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/': ${path}`);
  }
  return `${API_BASE_URL}${path}`;
};

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
