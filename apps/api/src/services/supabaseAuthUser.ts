import {
  createClient,
  isAuthApiError,
  isAuthSessionMissingError,
  type SupabaseClient,
} from "@supabase/supabase-js";

/** Supabase Auth가 확인해 준 요청자 정보. 브라우저가 보낸 값이 아니라 Auth 서버 응답이다. */
export interface SupabaseAuthUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  /**
   * 계정을 처음 만든 로그인 provider(`app_metadata.provider`). 예: google, email.
   * 이번 세션의 로그인 방식이 아니며, 나중에 다른 방식으로 로그인해도 바뀌지 않는다.
   */
  provider: string | null;
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
 * Supabase Auth access token을 Auth 서버(`GET /auth/v1/user`)로 확인한다.
 * Edge Function에는 SUPABASE_URL·SUPABASE_ANON_KEY가 자동 주입되고, 로컬 Node api는 `pnpm dev`가 넣는다.
 */
export class SupabaseAuthUserVerifier {
  private client?: SupabaseClient;

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
    }
    return this.client;
  }

  /**
   * 토큰이 무효·만료됐거나 사용자가 없거나 정지된 계정일 때만 null을 돌려준다.
   * 무효 여부는 에러 코드로 판정하며, code를 받지 못한 401만 예외로 인증 거부로 본다.
   * rate limit(429)·타임아웃(408) 등 토큰 유효성을 판단하지 못한 경우와 알 수 없는 오류는 모두 throw한다.
   */
  async getUser(accessToken: string): Promise<SupabaseAuthUser | null> {
    const { data, error } = await this.getClient().auth.getUser(accessToken);
    if (error) {
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

    const user = data.user;
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email ?? null,
      emailConfirmed: !!user.email_confirmed_at,
      provider:
        typeof user.app_metadata?.provider === "string"
          ? user.app_metadata.provider
          : null,
    };
  }
}
