import {
  createClient,
  isAuthApiError,
  isAuthError,
  isAuthSessionMissingError,
  type JWK,
  type SupabaseClient,
} from "@supabase/supabase-js";

/** 서명 검증(또는 Auth 서버 확인)을 통과한 토큰의 요청자 정보. 브라우저가 따로 보낸 값이 아니다. */
export interface SupabaseAuthUser {
  id: string;
}

/**
 * 토큰·세션·사용자가 무효임을 뜻하는 Auth 에러 코드. 이 밖의 오류는 일시 장애로 본다.
 * user_banned는 관리자가 정지를 풀기 전까지 재시도로 결과가 바뀌지 않는다.
 */
const INVALID_TOKEN_ERROR_CODES: ReadonlySet<string> = new Set([
  "bad_jwt",
  "session_not_found",
  "user_not_found",
  "user_banned",
]);

/**
 * env `SUPABASE_JWKS`(Edge Function에 Supabase가 자동 주입하는 프로젝트 서명 공개키)를 읽는다.
 * `{ "keys": [...] }`와 키 배열을 모두 받으며, 없거나 읽을 수 없으면 undefined를 돌려
 * Auth JWKS 엔드포인트 조회로 대신하게 한다.
 */
const readJwksFromEnv = (): { keys: JWK[] } | undefined => {
  const raw = process.env.SUPABASE_JWKS?.trim();
  if (!raw) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const keys = Array.isArray(parsed)
      ? parsed
      : (parsed as { keys?: unknown } | null)?.keys;
    if (Array.isArray(keys)) {
      return { keys: keys as JWK[] };
    }
  } catch {
    // 아래 경고로 함께 처리한다.
  }
  console.warn("SUPABASE_JWKS를 JWKS로 읽지 못해 Auth JWKS 엔드포인트를 조회합니다.");
  return undefined;
};

/**
 * Supabase Auth access token을 확인한다.
 * - 비대칭 서명(ES256/RS256) 토큰은 `auth.getClaims`가 프로젝트 공개키로 서명·`exp`를 직접 검증한다.
 *   키는 `SUPABASE_JWKS`에서 먼저 찾고, 없으면 `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`을 받아
 *   클라이언트 인스턴스에 캐시한다.
 * - 대칭 서명(HS256) 토큰과 어느 키 목록에도 없는 `kid`는 getClaims가 Auth 서버(`GET /auth/v1/user`)로 확인한다.
 * 로컬 서명 검증이라 로그아웃·세션 철회·Auth 사용자 삭제는 토큰이 만료될 때까지 반영되지 않는다.
 * `iss`·`aud`는 검사하지 않는다(로컬 함수 런타임의 SUPABASE_URL이 토큰 iss와 달라 오탐이 난다).
 * Edge Function에는 SUPABASE_URL·SUPABASE_ANON_KEY·SUPABASE_JWKS가 자동 주입되고, 로컬 Node api는 `pnpm dev`가
 * SUPABASE_URL·SUPABASE_ANON_KEY를 넣는다.
 */
export class SupabaseAuthUserVerifier {
  private client?: SupabaseClient;
  private jwks?: { keys: JWK[] };

  private getClient(): SupabaseClient {
    if (!this.client) {
      const url = process.env.SUPABASE_URL?.trim();
      const key = process.env.SUPABASE_ANON_KEY?.trim();
      if (!url || !key) {
        throw new Error("SUPABASE_URL과 SUPABASE_ANON_KEY 환경변수가 필요합니다.");
      }
      this.client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      this.jwks = readJwksFromEnv();
    }
    return this.client;
  }

  /**
   * 토큰이 무효·만료됐거나 서명이 맞지 않거나, 사용자가 없거나 정지된 계정일 때만 null을 돌려준다.
   * Auth 서버 응답은 에러 코드로 판정하며, code를 받지 못한 401만 예외로 인증 거부로 본다.
   * JWKS·Auth 서버 조회 실패, rate limit(429)·타임아웃(408) 등 토큰 유효성을 판단하지 못한 경우와
   * 알 수 없는 오류는 모두 throw한다.
   */
  async getUser(accessToken: string): Promise<SupabaseAuthUser | null> {
    const client = this.getClient();
    let result: Awaited<ReturnType<SupabaseClient["auth"]["getClaims"]>>;
    try {
      result = await client.auth.getClaims(accessToken, { jwks: this.jwks });
    } catch (error) {
      // 세 부분 base64url 형식은 맞지만 header·payload가 JSON이 아니면 getClaims가 SyntaxError를 그대로 던진다.
      if (error instanceof SyntaxError) {
        return null;
      }
      throw error;
    }

    const { data, error } = result;
    if (error) {
      // invalid_jwt(AuthInvalidJwtError): 형식 오류·만료·서명 불일치
      if (isAuthError(error) && error.code === "invalid_jwt") {
        return null;
      }
      // SDK는 session_not_found 응답을 AuthApiError가 아니라 AuthSessionMissingError로 바꿔 던진다.
      if (isAuthSessionMissingError(error)) {
        return null;
      }
      if (isAuthApiError(error)) {
        const code = error.code ?? "";
        if (INVALID_TOKEN_ERROR_CODES.has(code) || (error.status === 401 && !code)) {
          return null;
        }
      }
      throw error;
    }

    const sub = data?.claims.sub;
    if (typeof sub !== "string" || !sub) {
      return null;
    }
    return { id: sub };
  }
}
